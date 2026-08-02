"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";

import { fisheye, smoothing } from "@/lib/cosmos-math";
import { posterUrl } from "@/lib/poster";

export type CosmosItem = {
  /** React key — unique per entry in the pool. */
  key: string;
  /** Where clicking this tile navigates. */
  href: string;
  title: string;
  posterUrl: string;
  score: number | null;
};

/** Posters are 2:3, and cover-cropping every cell keys off that. */
const POSTER_ASPECT = 2 / 3;
/** Resting cell width in CSS pixels — sets how dense the mosaic reads. */
const CELL_PX_DESKTOP = 84;
const CELL_PX_MOBILE = 64;
/** Hard ceiling on tiles: each one is a draw call. */
const MAX_TILES_DESKTOP = 340;
const MAX_TILES_MOBILE = 150;
/** Hairline between cells, in pixels. */
const GAP = 1.5;
/** Lens strength at rest and while a cell is being opened. */
const FOCUS_STRENGTH = 3.6;
const SELECT_STRENGTH = 26;
/** How long the zoom-into-a-cell runs before the route changes. */
const SELECT_MS = 420;

/**
 * Motion tuning, expressed as *time constants* rather than per-frame factors.
 *
 * The lens used to ease with fixed per-frame lerps (`focus += (target - focus)
 * * 0.16`), which silently ties the animation's speed to the refresh rate: the
 * same gesture settles in half the time on a 120 Hz laptop as on a 60 Hz one,
 * and stutters into treacle whenever a frame runs long. These are the seconds
 * each quantity takes to cover ~63% of its remaining distance, converted to a
 * per-frame factor from the real elapsed time — so the feel is identical at 60,
 * 120 or 144 Hz, and a dropped frame catches up instead of falling behind.
 */
const FOLLOW_TAU = 0.085;
const STRENGTH_TAU = 0.12;
const BRIGHTNESS_TAU = 0.1;
/** Ceiling on a single step's dt: a backgrounded tab must not teleport the lens. */
const MAX_FRAME_S = 1 / 20;
/** Idle drift — a slow breath so the wall isn't dead when untouched. */
const DRIFT_AMPLITUDE = 0.06;
const DRIFT_PERIOD_S = 14;

/**
 * The library as a dense poster mosaic you push a lens across — the cell under
 * the pointer swells while the surrounding cells squash, then clicking one
 * zooms into it and opens the title.
 *
 * WebGL via three.js, mounted only by `CosmosStage` (dynamic, ssr:false) so
 * three never reaches the server bundle or any other route's JS. Everything
 * allocated here is disposed on unmount: a leaked context survives client
 * navigation and browsers cap them at ~16.
 */
export function PosterCosmos({
  items,
  reduceMotion,
}: {
  items: CosmosItem[];
  reduceMotion: boolean;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [hovered, setHovered] = useState<CosmosItem | null>(null);
  // Read inside the loop without re-running the effect (which rebuilds tiles).
  const reduceRef = useRef(reduceMotion);
  useEffect(() => {
    reduceRef.current = reduceMotion;
  }, [reduceMotion]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || items.length === 0) return;

    const scene = new THREE.Scene();
    // Screen-space orthographic in CSS pixels, kept y-UP (top = height).
    // Flipping the frustum instead (top=0, bottom=height) to get layout-style
    // y-down coordinates puts a negative scale in the projection, which both
    // mirrors every texture vertically and reverses triangle winding — posters
    // render upside down, and only survive back-face culling at all if you
    // force DoubleSide. Grid maths still runs top-down; positions are flipped
    // once, at the end.
    const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      // The mosaic is opaque art on a black field and never reads back its own
      // buffer; letting the driver discard it after compositing is free.
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    // `none` stops a drag over the canvas from scrolling or back-swiping the
    // page — the lens should follow the finger, not pan the document.
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.overscrollBehavior = "none";

    const geometry = new THREE.PlaneGeometry(1, 1);
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    /** Sharpest sampling the GPU will give us for minified, angled posters. */
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    /** One decoded texture per distinct poster, shared by every tile using it. */
    const textures = new Map<string, THREE.Texture>();
    type Tile = {
      mesh: THREE.Mesh;
      material: THREE.MeshBasicMaterial;
      /** Per-tile clone so cover-cropping one cell can't crop the others. */
      texture: THREE.Texture | null;
      item: CosmosItem;
    };
    let tiles: Tile[] = [];
    let cols = 0;
    let rows = 0;
    let disposed = false;

    /* ---- Grid construction ------------------------------------------- */
    function buildGrid(width: number, height: number) {
      for (const tile of tiles) {
        scene.remove(tile.mesh);
        tile.material.dispose();
        tile.texture?.dispose();
      }
      tiles = [];

      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const cell = coarse ? CELL_PX_MOBILE : CELL_PX_DESKTOP;
      const maxTiles = coarse ? MAX_TILES_MOBILE : MAX_TILES_DESKTOP;

      cols = Math.max(3, Math.round(width / cell));
      rows = Math.max(3, Math.round(height / (cell / POSTER_ASPECT)));
      // Thin the grid rather than blow the draw-call budget on a big screen.
      while (cols * rows > maxTiles && cols > 3 && rows > 3) {
        cols -= 1;
        rows -= 1;
      }

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          // Libraries are usually smaller than the grid, so posters repeat —
          // offset per row so the repeat doesn't line up into stripes.
          const item = items[(row * cols + col + row * 3) % items.length]!;
          const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(0x1b1b22),
            transparent: true,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.userData.col = col;
          mesh.userData.row = row;
          scene.add(mesh);
          const tile: Tile = { mesh, material, texture: null, item };
          tiles.push(tile);

          const src = posterUrl(item.posterUrl, "card")!;
          const cached = textures.get(src);
          if (cached) {
            applyTexture(tile, cached);
          } else {
            loader.load(
              src,
              (tex) => {
                if (disposed) {
                  tex.dispose();
                  return;
                }
                tex.colorSpace = THREE.SRGBColorSpace;
                // Posters arrive far larger than a ~84px cell. Without mipmaps
                // the GPU point-samples that reduction and the art crawls with
                // aliasing as the lens resizes it; anisotropy keeps it sharp
                // once a cell is stretched away from square.
                tex.generateMipmaps = true;
                tex.minFilter = THREE.LinearMipmapLinearFilter;
                tex.magFilter = THREE.LinearFilter;
                tex.anisotropy = maxAnisotropy;
                textures.set(src, tex);
                // Every tile waiting on this poster, not just the one that
                // happened to request it.
                for (const t of tiles) {
                  if (posterUrl(t.item.posterUrl, "card") === src && !t.texture) {
                    applyTexture(t, tex);
                  }
                }
              },
              undefined,
              () => {
                /* dead poster URL — the cell stays a dim block */
              },
            );
          }
        }
      }
    }

    function applyTexture(tile: Tile, source: THREE.Texture) {
      // Clone so each cell can carry its own cover-crop; clones share the GPU
      // image via `source`, so this costs no extra VRAM.
      const tex = source.clone();
      tex.needsUpdate = true;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = maxAnisotropy;
      tile.texture = tex;
      tile.material.map = tex;
      tile.material.color.set(0xffffff);
      tile.material.needsUpdate = true;
    }

    /* ---- Input --------------------------------------------------------- */
    // Focus in normalised [0,1] screen coords; starts centred.
    let focusX = 0.5;
    let focusY = 0.5;
    let targetX = 0.5;
    let targetY = 0.5;
    let pointerInside = false;
    let strength = FOCUS_STRENGTH;
    let selecting: { at: number; item: CosmosItem } | null = null;
    let hoverIndex = -1;

    const el = renderer.domElement;
    el.style.cursor = "crosshair";

    function setTargetFromEvent(e: PointerEvent) {
      const rect = el.getBoundingClientRect();
      targetX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      targetY = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      pointerInside = true;
    }

    function onPointerMove(e: PointerEvent) {
      setTargetFromEvent(e);
    }

    function onPointerLeave() {
      pointerInside = false;
      targetX = 0.5;
      targetY = 0.5;
    }

    function onPointerDown(e: PointerEvent) {
      // Touch has no hover, so a tap must place the lens before selecting.
      setTargetFromEvent(e);
      if (reduceRef.current) {
        const tile = tileAtFocus(targetX, targetY);
        if (tile) router.push(tile.item.href);
        return;
      }
      const tile = tileAtFocus(targetX, targetY);
      if (tile && !selecting) {
        selecting = { at: performance.now(), item: tile.item };
      }
    }

    /** The focus maps to itself under the fisheye, so plain grid maths finds it. */
    function tileAtFocus(fx: number, fy: number): Tile | null {
      const col = Math.min(cols - 1, Math.floor(fx * cols));
      const row = Math.min(rows - 1, Math.floor(fy * rows));
      return tiles[row * cols + col] ?? null;
    }

    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("pointerdown", onPointerDown);

    /* ---- Resize -------------------------------------------------------- */
    let width = 0;
    let height = 0;

    function resize() {
      const w = mount!.clientWidth;
      const h = mount!.clientHeight;
      if (w === 0 || h === 0) return;
      const changed = w !== width || h !== height;
      width = w;
      height = h;
      // `updateStyle` must stay true. Passing false sets the drawing buffer to
      // `w * devicePixelRatio` but leaves the element's CSS size unset — and a
      // canvas with no CSS size lays out at its *attribute* size in CSS pixels.
      // On any 2x display that made the canvas twice the width of its
      // container: the page scrolled sideways, the mosaic was cropped, and the
      // lens sat at half the pointer's actual offset (the grid maths reads
      // clientWidth, not the inflated canvas).
      renderer.setSize(w, h);
      camera.left = 0;
      camera.right = w;
      camera.top = h;
      camera.bottom = 0;
      camera.updateProjectionMatrix();
      if (changed) buildGrid(w, h);
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    /* ---- Loop ---------------------------------------------------------- */
    let frame = 0;
    let lastFrameAt = performance.now();
    const startedAt = lastFrameAt;

    function tick() {
      frame = requestAnimationFrame(tick);

      // Real elapsed time, clamped. Every easing below is expressed as a time
      // constant and converted here, so the motion is identical at any refresh
      // rate; the clamp stops a long stall (tab restore, GC pause) from
      // snapping the lens across the screen in one frame.
      const now = performance.now();
      const dt = Math.min((now - lastFrameAt) / 1000, MAX_FRAME_S);
      lastFrameAt = now;

      if (width === 0 || height === 0 || tiles.length === 0) return;

      if (selecting) {
        // Drive the lens hard into the chosen cell, then hand off to the router.
        const t = Math.min(1, (now - selecting.at) / SELECT_MS);
        // Cubic ease-in: the zoom starts gently and accelerates into the cut,
        // so the hand-off to the router lands at peak speed instead of easing
        // out into a pause.
        const eased = t * t * t;
        strength = FOCUS_STRENGTH + (SELECT_STRENGTH - FOCUS_STRENGTH) * eased;
        if (t >= 1) {
          const href = selecting.item.href;
          selecting = null;
          router.push(href);
        }
      } else if (reduceRef.current) {
        // No lens at all: an even grid the pointer doesn't distort.
        strength = 0;
        focusX = 0.5;
        focusY = 0.5;
      } else {
        strength += (FOCUS_STRENGTH - strength) * smoothing(STRENGTH_TAU, dt);

        // Untouched, the lens breathes along a slow Lissajous path rather than
        // parking dead centre — the wall keeps moving, which is the whole
        // appeal, and it hints that the lens is draggable before you touch it.
        let aimX = targetX;
        let aimY = targetY;
        if (!pointerInside) {
          const phase = ((now - startedAt) / 1000 / DRIFT_PERIOD_S) * Math.PI * 2;
          aimX = 0.5 + Math.cos(phase) * DRIFT_AMPLITUDE;
          aimY = 0.5 + Math.sin(phase * 0.7) * DRIFT_AMPLITUDE;
        }

        const follow = smoothing(FOLLOW_TAU, dt);
        focusX += (aimX - focusX) * follow;
        focusY += (aimY - focusY) * follow;
      }

      // Column and row boundaries, warped independently around the focus.
      const xs: number[] = [];
      for (let i = 0; i <= cols; i++) {
        xs.push(fisheye(i / cols, focusX, strength) * width);
      }
      const ys: number[] = [];
      for (let j = 0; j <= rows; j++) {
        ys.push(fisheye(j / rows, focusY, strength) * height);
      }

      // The drift moves the lens but must not claim a "hovered" tile — the
      // title chip appearing on its own would read as a phantom cursor.
      const focusTile =
        pointerInside || selecting ? tileAtFocus(focusX, focusY) : null;
      const brightness = smoothing(BRIGHTNESS_TAU, dt);

      for (const tile of tiles) {
        const col = tile.mesh.userData.col as number;
        const row = tile.mesh.userData.row as number;
        const x0 = xs[col]!;
        const x1 = xs[col + 1]!;
        const y0 = ys[row]!;
        const y1 = ys[row + 1]!;
        const w = Math.max(0.001, x1 - x0 - GAP);
        const h = Math.max(0.001, y1 - y0 - GAP);
        tile.mesh.scale.set(w, h, 1);
        // ys[] is measured downward from the top; the world is y-up.
        tile.mesh.position.set((x0 + x1) / 2, height - (y0 + y1) / 2, 0);

        // Cover-crop this cell: cells are never the poster's aspect once the
        // lens has stretched them, and letting the art stretch looks cheap.
        const tex = tile.texture;
        if (tex) {
          const cellAspect = w / h;
          if (cellAspect > POSTER_ASPECT) {
            tex.repeat.set(1, POSTER_ASPECT / cellAspect);
            tex.offset.set(0, (1 - tex.repeat.y) / 2);
          } else {
            tex.repeat.set(cellAspect / POSTER_ASPECT, 1);
            tex.offset.set((1 - tex.repeat.x) / 2, 0);
          }
        }

        // Lift the focused cell out of the field; everything else sits back.
        const isFocus = tile === focusTile;
        const target = isFocus ? 1 : 0.62;
        const c = tile.material.color;
        const to = tile.texture ? target : target * 0.18;
        c.setScalar(c.r + (to - c.r) * brightness);
      }

      const nextHover = focusTile ? tiles.indexOf(focusTile) : -1;
      if (nextHover !== hoverIndex) {
        hoverIndex = nextHover;
        setHovered(focusTile ? focusTile.item : null);
      }

      renderer.render(scene, camera);
    }

    // A hidden tab either throttles rAF to nothing or never fires it; pause
    // explicitly so a backgrounded mosaic costs the same either way.
    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(frame);
      } else {
        // Restart the clock too: without this the first frame back carries the
        // whole hidden duration as its dt.
        lastFrameAt = performance.now();
        frame = requestAnimationFrame(tick);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    frame = requestAnimationFrame(tick);

    /* ---- Teardown ------------------------------------------------------ */
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      resizeObserver.disconnect();
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("pointerdown", onPointerDown);

      for (const tile of tiles) {
        tile.material.dispose();
        tile.texture?.dispose();
      }
      for (const tex of textures.values()) tex.dispose();
      geometry.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      el.remove();
    };
  }, [items, router]);

  return (
    <>
      <div ref={mountRef} className="absolute inset-0" aria-hidden />

      {/* Hovered title — DOM, so it stays crisp text. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-6">
        <div
          className={`max-w-[min(90vw,32rem)] rounded-full bg-black/70 px-5 py-2.5 text-center backdrop-blur transition-all duration-200 ${
            hovered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
        >
          <p className="truncate text-sm font-medium text-white">
            {hovered?.title ?? ""}
          </p>
          {hovered?.score != null ? (
            <p className="text-xs text-white/60">★ {hovered.score}</p>
          ) : null}
        </div>
      </div>

      {/* The canvas is unreachable without a pointer, so mirror it as real
          links: keyboard and screen-reader users get the same destinations. */}
      <ul className="sr-only">
        {items.map((item) => (
          <li key={item.key}>
            <a href={item.href}>{item.title}</a>
          </li>
        ))}
      </ul>
    </>
  );
}

export default PosterCosmos;
