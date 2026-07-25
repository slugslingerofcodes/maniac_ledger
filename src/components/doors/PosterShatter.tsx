"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/** Tile grid. 7×10 ≈ 70 draw calls — dense enough to read as shards. */
const COLS = 7;
const ROWS = 10;
/** Streak particles rushing past as the shards clear. */
const STREAKS = 320;
/** Camera distance to the poster plane. */
const DIST = 10;

/**
 * The "enter the world" pay-off: the clicked poster, held across the shōji
 * doors, breaks into tiles that accelerate past the camera while speed streaks
 * rush outward — the page beneath is revealed through the gaps.
 *
 * Purely decorative by design. `ShojiDoors` owns navigation on its own timer,
 * so if this never mounts, never loads, or fails outright, the route change is
 * unaffected — the transition just degrades to the plain sliding doors.
 */
export function PosterShatter({
  src,
  durationMs,
}: {
  src: string;
  durationMs: number;
}) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.z = DIST;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    // World units the camera sees at the poster's depth — the shards must fill
    // exactly this, or the seam between shatter and doors is visible.
    const viewH = 2 * DIST * Math.tan((camera.fov * Math.PI) / 360);
    const viewW = viewH * camera.aspect;

    const group = new THREE.Group();
    scene.add(group);

    const tiles: {
      mesh: THREE.Mesh;
      material: THREE.MeshBasicMaterial;
      geometry: THREE.PlaneGeometry;
      delay: number;
      vx: number;
      vy: number;
      vz: number;
      spin: number;
    }[] = [];

    let disposed = false;
    let frame = 0;
    const start = performance.now();

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    let texture: THREE.Texture | null = null;

    loader.load(
      src,
      (tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        texture = tex;

        // Emulate background-size: cover in UV space, then subdivide inside
        // that crop — otherwise tiles would sample letterboxed empty edges.
        const image = tex.image as { width: number; height: number };
        const imgAspect = image.width / image.height;
        const viewAspect = width / height;
        const cropU = imgAspect > viewAspect ? viewAspect / imgAspect : 1;
        const cropV = imgAspect > viewAspect ? 1 : imgAspect / viewAspect;
        const u0 = (1 - cropU) / 2;
        const v0 = (1 - cropV) / 2;

        const tileW = viewW / COLS;
        const tileH = viewH / ROWS;

        for (let row = 0; row < ROWS; row++) {
          for (let col = 0; col < COLS; col++) {
            const geometry = new THREE.PlaneGeometry(tileW, tileH);
            // Remap this tile's UVs onto its slice of the cropped poster.
            const uv = geometry.attributes.uv;
            for (let i = 0; i < uv.count; i++) {
              const u = uv.getX(i);
              const v = uv.getY(i);
              uv.setXY(
                i,
                u0 + ((col + u) / COLS) * cropU,
                v0 + ((row + v) / ROWS) * cropV,
              );
            }
            uv.needsUpdate = true;

            const material = new THREE.MeshBasicMaterial({
              map: tex,
              transparent: true,
              side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(geometry, material);
            const x = -viewW / 2 + tileW * (col + 0.5);
            const y = -viewH / 2 + tileH * (row + 0.5);
            mesh.position.set(x, y, 0);
            group.add(mesh);

            // Shards burst outward from the centre, so the middle clears first
            // and the reveal reads as an iris opening toward the viewer.
            const dist = Math.hypot(x, y) / Math.hypot(viewW / 2, viewH / 2);
            tiles.push({
              mesh,
              material,
              geometry,
              delay: dist * 0.28,
              vx: x * 0.9 + (Math.random() - 0.5) * 2,
              vy: y * 0.9 + (Math.random() - 0.5) * 2,
              // Toward the camera — the shards pass around the viewer.
              vz: 9 + Math.random() * 7,
              spin: (Math.random() - 0.5) * 3,
            });
          }
        }
      },
      undefined,
      () => {
        /* poster failed to load — the streaks alone still carry the beat */
      },
    );

    /* ---- Speed streaks ------------------------------------------------ */
    const streakPositions = new Float32Array(STREAKS * 3);
    const streakVel: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < STREAKS; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 1.5;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      streakPositions.set([x, y, -6 - Math.random() * 8], i * 3);
      streakVel.push({
        x: Math.cos(angle) * (5 + Math.random() * 9),
        y: Math.sin(angle) * (5 + Math.random() * 9),
        z: 26 + Math.random() * 20,
      });
    }
    const streakGeometry = new THREE.BufferGeometry();
    streakGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(streakPositions, 3),
    );
    const streakMaterial = new THREE.PointsMaterial({
      size: 0.09,
      color: 0xc9b6ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const streaks = new THREE.Points(streakGeometry, streakMaterial);
    scene.add(streaks);

    /* ---- Loop ---------------------------------------------------------- */
    function tick() {
      frame = requestAnimationFrame(tick);
      const elapsed = (performance.now() - start) / durationMs;
      const t = Math.min(1, Math.max(0, elapsed));

      for (const tile of tiles) {
        // Each shard waits its turn, then accelerates (t² — a launch, not a
        // drift) and fades as it sweeps past the camera.
        const local = Math.min(1, Math.max(0, (t - tile.delay) / (1 - tile.delay)));
        const accel = local * local;
        tile.mesh.position.x = tile.mesh.position.x + 0;
        tile.mesh.position.z = accel * tile.vz;
        tile.mesh.position.x += tile.vx * accel * 0.02;
        tile.mesh.position.y += tile.vy * accel * 0.02;
        tile.mesh.rotation.z = tile.spin * accel * 0.5;
        tile.mesh.rotation.x = tile.spin * accel * 0.3;
        tile.material.opacity = 1 - accel;
      }

      const positions = streakGeometry.attributes.position;
      for (let i = 0; i < STREAKS; i++) {
        const v = streakVel[i]!;
        positions.setXYZ(
          i,
          positions.getX(i) + v.x * 0.016,
          positions.getY(i) + v.y * 0.016,
          positions.getZ(i) + v.z * 0.016,
        );
      }
      positions.needsUpdate = true;
      // Streaks swell as the shards clear, then fall away with them.
      streakMaterial.opacity = Math.sin(t * Math.PI) * 0.9;

      renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      for (const tile of tiles) {
        tile.geometry.dispose();
        tile.material.dispose();
      }
      texture?.dispose();
      streakGeometry.dispose();
      streakMaterial.dispose();
      renderer.dispose();
      // Contexts survive unmount and browsers cap them at ~16 — a transition
      // that runs on every navigation must never leak one.
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [src, durationMs]);

  return (
    <div
      ref={mountRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[61]"
    />
  );
}

export default PosterShatter;
