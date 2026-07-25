"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";

export type CosmosItem = {
  id: string;
  title: string;
  posterUrl: string;
  score: number | null;
};

/** Poster plane size in world units (2:3, same aspect as every poster grid). */
const CARD_W = 1;
const CARD_H = 1.5;
/** Radius of the shell the posters sit on. */
const RADIUS = 7;
/** Camera dolly limits — near enough to read a card, far enough to see the orb. */
const MIN_Z = 9;
const MAX_Z = 22;
/** How long the click-to-enter flight lasts before the route changes. */
const FLIGHT_MS = 620;

/**
 * Evenly distributes `n` points on a sphere (golden-angle spiral). Even beats
 * random here: random clumps, and clumped posters overlap into visual mush.
 */
function spherePoint(i: number, n: number, radius: number): THREE.Vector3 {
  const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = i * Math.PI * (3 - Math.sqrt(5));
  return new THREE.Vector3(
    Math.cos(theta) * r,
    y,
    Math.sin(theta) * r,
  ).multiplyScalar(radius);
}

/** Soft radial sprite, drawn once and shared by the core glow and the stars. */
function radialSprite(inner: string, outer: string): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The library as a slowly turning orb of posters you can spin, zoom, and fly
 * into. WebGL via three.js, mounted only by `CosmosStage` (dynamic, ssr:false)
 * so three never reaches the server bundle or any other route's JS.
 *
 * Everything allocated here is disposed on unmount — a leaked WebGL context
 * survives client navigation and browsers cap them at ~16, after which every
 * later canvas silently fails to render.
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
  // Mirrored into a ref so the animation loop can read the current preference
  // without the scene effect re-running (which would rebuild every card).
  const reduceRef = useRef(reduceMotion);
  useEffect(() => {
    reduceRef.current = reduceMotion;
  }, [reduceMotion]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || items.length === 0) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 0, 15);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    // Cap DPR: a 3x phone screen renders 9x the pixels for no visible gain.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.cursor = "grab";

    // The orb spins as one group; the camera only ever dollies.
    const orb = new THREE.Group();
    scene.add(orb);

    /* ---- Posters ---------------------------------------------------- */
    // One geometry shared by every card — 150 identical plane buffers would be
    // 150 pointless uploads.
    const cardGeometry = new THREE.PlaneGeometry(CARD_W, CARD_H);
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous"); // WebGL refuses non-CORS textures
    const textures: THREE.Texture[] = [];
    const materials: THREE.MeshBasicMaterial[] = [];
    const cards: THREE.Mesh[] = [];
    let disposed = false;

    items.forEach((item, i) => {
      const material = new THREE.MeshBasicMaterial({
        // Dim placeholder until the poster decodes, so the orb has shape from
        // the first frame instead of popping in card by card.
        color: new THREE.Color(0x2a2340),
        transparent: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(cardGeometry, material);
      mesh.position.copy(spherePoint(i, items.length, RADIUS));
      // Face away from the centre so the shell reads as a solid orb of art.
      mesh.lookAt(mesh.position.clone().multiplyScalar(2));
      mesh.userData.index = i;
      orb.add(mesh);
      cards.push(mesh);
      materials.push(material);

      loader.load(
        item.posterUrl,
        (texture) => {
          // The scene may have unmounted while this was in flight.
          if (disposed) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
          material.map = texture;
          material.color.set(0xffffff);
          material.needsUpdate = true;
          textures.push(texture);
        },
        undefined,
        () => {
          /* a dead poster URL just stays a dim card */
        },
      );
    });

    /* ---- Starfield + core glow --------------------------------------- */
    const starSprite = radialSprite(
      "rgba(255,255,255,0.9)",
      "rgba(255,255,255,0)",
    );
    const starCount = 1200;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      // Shell well outside the orb so stars never intersect the cards.
      const p = spherePoint(i, starCount, 26 + Math.random() * 12);
      starPositions.set([p.x, p.y, p.z], i * 3);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(starPositions, 3),
    );
    const starMaterial = new THREE.PointsMaterial({
      size: 0.5,
      map: starSprite,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0xb9a8ff,
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    const glowSprite = radialSprite(
      "rgba(167,139,250,0.55)",
      "rgba(167,139,250,0)",
    );
    const glowMaterial = new THREE.SpriteMaterial({
      map: glowSprite,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.set(14, 14, 1);
    scene.add(glow);

    /* ---- Input ------------------------------------------------------- */
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerInside = false;
    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    // Angular velocity, in radians per frame, decayed each frame.
    let velX = 0;
    let velY = 0;
    let targetZ = camera.position.z;
    let hoverIndex = -1;
    let flight: { from: THREE.Vector3; to: THREE.Vector3; start: number; id: string } | null =
      null;

    const el = renderer.domElement;

    function updatePointer(e: PointerEvent) {
      const rect = el.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointerInside = true;
    }

    /** The card under this event's position right now, or -1. */
    function cardIndexAt(e: PointerEvent): number {
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(cards, false)[0];
      return hit ? ((hit.object.userData.index as number) ?? -1) : -1;
    }

    function onPointerDown(e: PointerEvent) {
      updatePointer(e);
      dragging = true;
      moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    }

    function onPointerMove(e: PointerEvent) {
      updatePointer(e);
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      velY = dx * 0.005;
      velX = dy * 0.005;
      orb.rotation.y += velY;
      orb.rotation.x = THREE.MathUtils.clamp(
        orb.rotation.x + velX,
        -Math.PI / 2.2,
        Math.PI / 2.2,
      );
    }

    function onPointerUp(e: PointerEvent) {
      if (dragging) el.releasePointerCapture(e.pointerId);
      dragging = false;
      el.style.cursor = "grab";
      if (moved || flight) return;

      // Raycast fresh at the release point rather than reusing the loop's
      // hover index: a tap fires down→up with no pointermove in between, so on
      // touch the cached index is always -1 and nothing would ever open.
      const index = cardIndexAt(e);
      if (index < 0) return;

      // A click (not a drag) on a card flies the camera in, then navigates.
      const world = cards[index]!.getWorldPosition(new THREE.Vector3());
      flight = {
        from: camera.position.clone(),
        // Stop just short of the card so it fills the frame at arrival.
        to: world.clone().multiplyScalar(1.18),
        start: performance.now(),
        id: items[index]!.id,
      };

      // Touch has no hover, so clear the title overlay it can't dismiss.
      if (e.pointerType === "touch") {
        pointerInside = false;
        hoverIndex = -1;
        setHovered(null);
      }
    }

    function onPointerLeave() {
      pointerInside = false;
      dragging = false;
      el.style.cursor = "grab";
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      targetZ = THREE.MathUtils.clamp(targetZ + e.deltaY * 0.01, MIN_Z, MAX_Z);
    }

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("wheel", onWheel, { passive: false });

    /* ---- Resize ------------------------------------------------------ */
    function resize() {
      const { clientWidth: w, clientHeight: h } = mount!;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    /* ---- Loop -------------------------------------------------------- */
    let frame = 0;
    const clock = new THREE.Clock();

    function tick() {
      frame = requestAnimationFrame(tick);
      const dt = clock.getDelta();

      if (flight) {
        // Ease-in-out over the flight, then hand off to the router.
        const t = Math.min(1, (performance.now() - flight.start) / FLIGHT_MS);
        const eased = t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2;
        camera.position.lerpVectors(flight.from, flight.to, eased);
        camera.lookAt(0, 0, 0);
        if (t >= 1) {
          const id = flight.id;
          flight = null;
          router.push(`/anime/${id}`);
        }
      } else {
        // Idle drift, plus inertia from the last drag. Both off under reduced
        // motion: the orb then only moves while actively dragged.
        if (!reduceRef.current) {
          if (!dragging) {
            velY *= 0.94;
            velX *= 0.94;
            orb.rotation.y += velY + dt * 0.045;
            orb.rotation.x = THREE.MathUtils.clamp(
              orb.rotation.x + velX,
              -Math.PI / 2.2,
              Math.PI / 2.2,
            );
          }
          stars.rotation.y -= dt * 0.01;
        }
        camera.position.z += (targetZ - camera.position.z) * 0.08;
        camera.lookAt(0, 0, 0);

        // Hover: raycast only when the pointer is over the canvas and still.
        let nextHover = -1;
        if (pointerInside && !dragging) {
          raycaster.setFromCamera(pointer, camera);
          const hit = raycaster.intersectObjects(cards, false)[0];
          if (hit) nextHover = (hit.object.userData.index as number) ?? -1;
        }
        if (nextHover !== hoverIndex) {
          hoverIndex = nextHover;
          el.style.cursor = hoverIndex >= 0 ? "pointer" : "grab";
          setHovered(hoverIndex >= 0 ? items[hoverIndex]! : null);
        }
        // Lift the hovered card out of the shell and settle the rest back.
        cards.forEach((card, i) => {
          const target = i === hoverIndex ? 1.34 : 1;
          card.scale.lerp(new THREE.Vector3(target, target, 1), 0.18);
        });
      }

      glow.material.opacity = 0.75 + Math.sin(performance.now() / 1400) * 0.2;
      renderer.render(scene, camera);
    }

    // A hidden tab still fires rAF in some browsers and never in others; pause
    // explicitly so a backgrounded cosmos costs nothing either way.
    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(frame);
      } else {
        clock.getDelta(); // drop the elapsed gap so nothing jumps
        frame = requestAnimationFrame(tick);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    frame = requestAnimationFrame(tick);

    /* ---- Teardown ---------------------------------------------------- */
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      resizeObserver.disconnect();
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("wheel", onWheel);

      cardGeometry.dispose();
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      starGeometry.dispose();
      starMaterial.dispose();
      starSprite.dispose();
      glowMaterial.dispose();
      glowSprite.dispose();
      renderer.dispose();
      // Without this the GPU context lingers past unmount and counts against
      // the browser's per-page WebGL context cap.
      renderer.forceContextLoss();
      el.remove();
    };
  }, [items, router]);

  return (
    <>
      <div ref={mountRef} className="absolute inset-0" aria-hidden />

      {/* Hovered title — DOM, so it stays crisp and selectable text. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-6">
        <div
          className={`glass max-w-[min(90vw,32rem)] rounded-full px-5 py-2.5 text-center transition-all duration-200 ${
            hovered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
        >
          <p className="truncate text-sm font-medium text-foreground">
            {hovered?.title ?? ""}
          </p>
          {hovered?.score != null ? (
            <p className="text-xs text-muted-foreground">★ {hovered.score}</p>
          ) : null}
        </div>
      </div>

      {/* The canvas is unreachable without a pointer, so mirror it as real
          links: keyboard and screen-reader users get the same destinations. */}
      <ul className="sr-only">
        {items.map((item) => (
          <li key={item.id}>
            <a href={`/anime/${item.id}`}>{item.title}</a>
          </li>
        ))}
      </ul>
    </>
  );
}

export default PosterCosmos;
