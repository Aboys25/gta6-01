// Solmarina: one dense sun-soaked coastal district, built deterministically
// from seeded streams. Grid streets, a central park, a marina waterfront,
// landmark towers to the north, and a hazy skyline faking the horizon.
// Collision is block-level (see roads.js); visuals fill the blocks.
import * as THREE from 'three';
import { AVENUES, STREETS, ROAD_HALF, BEACH_Z, SEA_Z, buildBlocks, isParkBlock, isMarinaBlock } from './roads.js';
import { pick, range, rangeInt, chance } from './rng.js';

export const DISTRICTS = [
  { name: 'Harbor Heights', x0: -330, x1: -90, z0: -240, z1: -60 },
  { name: 'Old Town', x0: -90, x1: 90, z0: -240, z1: -60 },
  { name: 'Palm Row', x0: 90, x1: 330, z0: -240, z1: -60 },
  { name: 'Solmarina Park', x0: -90, x1: 90, z0: -60, z1: 60 },
  { name: 'The Docks', x0: -330, x1: 330, z0: 180, z1: 300 },
];
export function districtAt(x, z) {
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d.name;
  return 'Marina Bay';
}

const WALL_COLORS = [0xf3e2c7, 0xe8b48a, 0xd98c5f, 0xefe6d4, 0xcfe0d8, 0xe6c9a8, 0xdfa06b, 0xf7ead2];
const GLASS_COLORS = [0x7fb8c9, 0x5f9db3, 0x9fc8d4, 0x86b7c4];
const ROOF_COLORS = [0xb0703f, 0x8a6f55, 0x6f7f7a, 0xc98d5a];

function box(w, h, d, color, x, y, z, mat = null) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    mat || new THREE.MeshLambertMaterial({ color }),
  );
  m.position.set(x, y, z);
  return m;
}

export function buildCity(scene, streams) {
  const group = new THREE.Group();
  scene.add(group);
  const { buildings: rng, props: prng } = streams;

  // --- sky, sun, fog: golden hour over the bay ---
  scene.background = new THREE.Color(0xf8c98a);
  scene.fog = new THREE.Fog(0xf2bd7f, 180, 620);
  const sun = new THREE.DirectionalLight(0xffd9a3, 2.4);
  sun.position.set(-180, 140, -120);
  scene.add(sun);
  // warm fill from the south-east so faces away from the sun stay readable
  const fill = new THREE.DirectionalLight(0xffc98a, 0.9);
  fill.position.set(160, 90, 220);
  scene.add(fill);
  scene.add(new THREE.HemisphereLight(0xffe3b8, 0x8a6a4a, 1.1));
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff2c8, fog: false }),
  );
  sunDisc.position.set(-320, 130, -420);
  sunDisc.lookAt(0, 40, 0);
  group.add(sunDisc);

  // --- ground slabs ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 620),
    new THREE.MeshLambertMaterial({ color: 0xd9c4a3 }),
  );
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 20);
  group.add(ground);
  // sea
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 130),
    new THREE.MeshLambertMaterial({ color: 0x3f8ea8 }),
  );
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.01, SEA_Z + 55);
  group.add(sea);
  // beach
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(760, SEA_Z - BEACH_Z),
    new THREE.MeshLambertMaterial({ color: 0xecd9a8 }),
  );
  beach.rotation.x = -Math.PI / 2; beach.position.set(0, 0.02, (BEACH_Z + SEA_Z) / 2);
  group.add(beach);

  // --- roads: dark strips + centre dashes ---
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3d3a38 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xe8d9a8 });
  for (const ax of AVENUES) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 480), roadMat);
    r.rotation.x = -Math.PI / 2; r.position.set(ax, 0.03, -20); group.add(r);
    for (let z = -220; z < 200; z += 24) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 7), dashMat);
      d.rotation.x = -Math.PI / 2; d.position.set(ax, 0.04, z); group.add(d);
    }
  }
  for (const sz of STREETS) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(660, ROAD_HALF * 2), roadMat);
    r.rotation.x = -Math.PI / 2; r.position.set(0, 0.03, sz); group.add(r);
    for (let x = -320; x < 320; x += 24) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.7), dashMat);
      d.rotation.x = -Math.PI / 2; d.position.set(x, 0.04, sz); group.add(d);
    }
  }
  // Bayfront boulevard along the beach
  const bay = new THREE.Mesh(new THREE.PlaneGeometry(660, 12), roadMat);
  bay.rotation.x = -Math.PI / 2; bay.position.set(0, 0.03, BEACH_Z - 8); group.add(bay);

  // --- blocks: slabs + buildings ---
  const blocks = buildBlocks();
  const colliders = [];
  const wallMats = WALL_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const glassMats = GLASS_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  let towerCount = 0;
  for (const b of blocks) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    if (isParkBlock(b)) {
      const lawn = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color: 0x7da95c }));
      lawn.rotation.x = -Math.PI / 2; lawn.position.set(b.cx, 0.05, b.cz); group.add(lawn);
      const pond = new THREE.Mesh(new THREE.CircleGeometry(14, 24), new THREE.MeshLambertMaterial({ color: 0x5fb3c9 }));
      pond.rotation.x = -Math.PI / 2; pond.position.set(b.cx - 12, 0.06, b.cz + 8); group.add(pond);
      for (let i = 0; i < 14; i++) {
        const tx = b.x0 + 6 + prng() * (w - 12), tz = b.z0 + 6 + prng() * (d - 12);
        group.add(tree(tx, tz, prng));
      }
      continue;
    }
    if (isMarinaBlock(b)) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color: 0xc9a06b }));
      walk.rotation.x = -Math.PI / 2; walk.position.set(b.cx, 0.05, b.cz); group.add(walk);
      continue;
    }
    // solid block: slab + 1-4 buildings
    const slab = box(w, 0.6, d, 0xc7b28f, b.cx, 0, b.cz);
    group.add(slab);
    colliders.push(b);
    const n = rangeInt(rng, 1, 3);
    const tall = Math.abs(b.cx) < 120 && b.cz < 0; // downtown core grows tall
    for (let i = 0; i < n; i++) {
      const bw = range(rng, w * 0.22, w * 0.42), bd = range(rng, d * 0.22, d * 0.42);
      const bx = b.x0 + bw / 2 + rng() * Math.max(1, w - bw - 4);
      const bz = b.z0 + bd / 2 + rng() * Math.max(1, d - bd - 4);
      const h = tall ? range(rng, 26, 62) : range(rng, 8, 26);
      const glass = chance(rng, 0.35);
      const mat = glass ? pick(rng, glassMats) : pick(rng, wallMats);
      const bld = box(bw, h, bd, 0, bx, h / 2 + 0.3, bz, mat);
      group.add(bld);
      group.add(box(bw * 0.5, 1.6, bd * 0.5, pick(rng, ROOF_COLORS), bx, h + 1, bz));
      // window strips on the sun-facing and street-facing sides
      const winMat = new THREE.MeshBasicMaterial({ color: 0x2e4a58 });
      const stripS = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.62, Math.max(2.5, h * 0.5)), winMat);
      stripS.position.set(bx, h * 0.52 + 0.3, bz + bd / 2 + 0.06);
      group.add(stripS);
      if (h > 24) {
        const stripN = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.62, h * 0.55), winMat);
        stripN.position.set(bx, h * 0.5 + 0.3, bz - bd / 2 - 0.06);
        stripN.rotation.y = Math.PI;
        group.add(stripN);
      }
      towerCount++;
    }
    // corner shop awnings on street-facing edges
    if (chance(rng, 0.7)) {
      const awn = box(range(rng, 10, 18), 0.5, 4, pick(rng, [0xd95f4b, 0x3f7d5a, 0xe8a13c, 0x4b7fb8]), b.cx, 3.4, b.z0 + 2);
      group.add(awn);
    }
  }

  // --- landmark towers (north edge) + the Spire ---
  const spire = box(16, 110, 16, 0xe8e0cc, -90, 55, -215);
  group.add(spire);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff5a3c }));
  beacon.position.set(-90, 112, -215); group.add(beacon);
  group.add(box(24, 64, 24, 0x5f9db3, 0, 32, -215, pick(rng, glassMats)));
  group.add(box(20, 48, 20, 0xe8b48a, 90, 24, -215));
  group.add(box(28, 78, 22, 0xd98c5f, -180, 39, -215));

  // --- palms along avenues + marina ---
  for (const ax of AVENUES) for (let z = -200; z < 200; z += 60) {
    if (chance(prng, 0.75)) group.add(palm(ax + 10.5, z + range(prng, -8, 8), prng));
    if (chance(prng, 0.75)) group.add(palm(ax - 10.5, z + 30 + range(prng, -8, 8), prng));
  }
  // --- streetlights at intersections ---
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x44403c });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const sz of STREETS) for (const ax of AVENUES) {
    if ((ax + sz) % 120 !== 0) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), poleMat);
    pole.position.set(ax + 8.5, 3.5, sz + 8.5); group.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), lampMat);
    lamp.position.set(ax + 8.5, 7.2, sz + 8.5); group.add(lamp);
  }
  // --- distant skyline silhouettes ---
  const silMat = new THREE.MeshLambertMaterial({ color: 0xc98d5f });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const r = 460 + prng() * 80;
    const h = 40 + prng() * 90;
    const s = box(24 + prng() * 26, h, 24 + prng() * 26, 0, Math.cos(a) * r, h / 2, Math.sin(a) * r * 0.8 + 20, silMat);
    group.add(s);
  }
  // --- boats in the bay ---
  for (let i = 0; i < 6; i++) {
    const bx = -240 + i * 95 + prng() * 20, bz = SEA_Z + 24 + prng() * 40;
    const hull = box(14, 2.5, 5, pick(prng, [0xf3e2c7, 0xd95f4b, 0x4b7fb8]), bx, 1.2, bz);
    group.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 10, 6), poleMat);
    mast.position.set(bx, 7, bz); group.add(mast);
  }

  return {
    blocks, colliders, towerCount,
    spawn: {
      garage: { x: -180, z: 30 },       // player start, Palm Row garage
      safehouse: { x: -270, z: -180 },  // Harbor Heights safehouse
      docks: { x: 180, z: 190 },        // mission delivery point
      park: { x: 0, z: 0 },
      marina: { x: 90, z: 200 },
    },
  };
}

function tree(x, z, rng) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.5, 3.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x7a5230 }),
  );
  trunk.position.y = 1.7; g.add(trunk);
  const top = new THREE.Mesh(
    new THREE.SphereGeometry(2.6 + rng() * 1.2, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0x5d8f43 }),
  );
  top.position.y = 4.6; g.add(top);
  g.position.set(x, 0, z);
  return g;
}

function palm(x, z, rng) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.34, 6.5, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a6a45 }),
  );
  trunk.position.y = 3.25; trunk.rotation.z = (rng() - 0.5) * 0.14; g.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4d8a3f });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.4, 6.6, Math.sin(a) * 1.4);
    leaf.rotation.z = Math.cos(a) * 1.1; leaf.rotation.x = -Math.sin(a) * 1.1;
    g.add(leaf);
  }
  const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
  nuts.position.y = 6.2; g.add(nuts);
  g.position.set(x, 0, z);
  return g;
}
