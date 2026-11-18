// People: the player on foot, pedestrians, and police on foot.
// Pedestrians stroll the sidewalks and cross at intersections; they scatter
// when a car or a shot comes close. Police on foot chase and try to bust.
import * as THREE from 'three';
import { AVENUES, STREETS, ROAD_HALF, snapToRoad, onRoad } from './roads.js';
import { pick, range } from './rng.js';

const SHIRTS = [0xd95f4b, 0x4b7fb8, 0xe8a13c, 0x3f7d5a, 0xf3e2c7, 0x8a6fbf, 0xe8e8e8, 0x2e2e33];
const SKINS = [0xe8b48a, 0xc98d5f, 0x8a5a3b, 0xf3d0a8];

export function makePersonMesh(shirt, skin, scale = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.95, 8), new THREE.MeshLambertMaterial({ color: shirt }));
  body.position.y = 0.95; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.65; g.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.3), new THREE.MeshLambertMaterial({ color: 0x2e2e33 }));
  legs.position.y = 0.25; g.add(legs);
  g.scale.setScalar(scale);
  return g;
}

export function makePlayerMesh() {
  const g = makePersonMesh(0xe86a2a, 0xe8b48a, 1.05);
  // orange jacket + cap so the player reads at a glance
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0x1c2b3a }));
  cap.position.y = 1.9; g.add(cap);
  return g;
}

export function makePolicePersonMesh() {
  const g = makePersonMesh(0x1c2b3a, 0xc98d5f, 1.05);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0x101418 }));
  cap.position.y = 1.9; g.add(cap);
  return g;
}

export function makePlayer(x, z) {
  return {
    x, z, heading: 0, speed: 0, health: 100, onFoot: true,
    mesh: null, walkPhase: 0, armed: false, ammo: 24,
  };
}

// On-foot step: WASD relative to camera yaw; block push-out; beach/park open.
export function stepPlayer(p, input, camYaw, dt, colliders) {
  const run = input.run ? 8.5 : 4.6;
  let mx = 0, mz = 0;
  if (input.forward) { mx += -Math.sin(camYaw); mz += -Math.cos(camYaw); }
  if (input.back) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
  if (input.left) { mx += -Math.cos(camYaw); mz += Math.sin(camYaw); }
  if (input.right) { mx += Math.cos(camYaw); mz += -Math.sin(camYaw); }
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    mx /= len; mz /= len;
    p.x += mx * run * dt; p.z += mz * run * dt;
    p.heading = Math.atan2(mx, mz);
    p.walkPhase += dt * run * 1.6;
    p.speed = run;
  } else p.speed = 0;
  for (const b of colliders) {
    if (p.x > b.x0 - 0.5 && p.x < b.x1 + 0.5 && p.z > b.z0 - 0.5 && p.z < b.z1 + 0.5) {
      const dl = p.x - (b.x0 - 0.5), dr = (b.x1 + 0.5) - p.x;
      const dt2 = p.z - (b.z0 - 0.5), db = (b.z1 + 0.5) - p.z;
      const min = Math.min(dl, dr, dt2, db);
      if (min === dl) p.x = b.x0 - 0.5; else if (min === dr) p.x = b.x1 + 0.5;
      else if (min === dt2) p.z = b.z0 - 0.5; else p.z = b.z1 + 0.5;
    }
  }
  p.x = Math.max(-325, Math.min(325, p.x));
  p.z = Math.max(-235, Math.min(295, p.z));
  if (p.mesh) {
    p.mesh.position.set(p.x, Math.abs(Math.sin(p.walkPhase)) * 0.06, p.z);
    p.mesh.rotation.y = p.heading;
  }
}

export function makePed(rng, scene) {
  const mesh = makePersonMesh(pick(rng, SHIRTS), pick(rng, SKINS), range(rng, 0.92, 1.08));
  scene.add(mesh);
  // start on a sidewalk beside a random road
  const ax = pick(rng, AVENUES);
  const z = range(rng, -180, 180);
  const side = rng() < 0.5 ? 1 : -1;
  return {
    x: ax + side * (ROAD_HALF + 2.5), z, heading: rng() * Math.PI * 2,
    mesh, speed: range(rng, 1.1, 2.0), panic: 0, target: null,
    wander: range(rng, 4, 12),
  };
}

export function stepPed(ped, dt, player, cars) {
  // panic: flee from a fast car or the player when armed
  let fleeX = 0, fleeZ = 0;
  for (const c of cars) {
    const dx = ped.x - c.x, dz = ped.z - c.z, d = Math.hypot(dx, dz);
    if (d < 9 && Math.abs(c.speed) > 4) { fleeX += dx / d; fleeZ += dz / d; ped.panic = 2; }
  }
  if (player.armed) {
    const dx = ped.x - player.x, dz = ped.z - player.z, d = Math.hypot(dx, dz);
    if (d < 10) { fleeX += dx / d; fleeZ += dz / d; ped.panic = 1.5; }
  }
  ped.panic = Math.max(0, ped.panic - dt);
  if (ped.panic > 0) {
    const len = Math.hypot(fleeX, fleeZ) || 1;
    ped.x += (fleeX / len) * 4.5 * dt;
    ped.z += (fleeZ / len) * 4.5 * dt;
    ped.heading = Math.atan2(fleeX / len, fleeZ / len);
  } else {
    ped.wander -= dt;
    if (ped.wander <= 0) {
      ped.wander = range(Math.random, 4, 12);
      ped.heading += (Math.random() - 0.5) * 2.2;
    }
    // stay near sidewalks: steer back toward the nearest road edge
    const snap = snapToRoad(ped.x, ped.z);
    if (snap.d > ROAD_HALF + 6) {
      const hx = snap.x - ped.x, hz = snap.z - ped.z;
      ped.heading = Math.atan2(hx, hz) + (Math.random() - 0.5) * 0.6;
    }
    ped.x += Math.sin(ped.heading) * ped.speed * dt;
    ped.z += Math.cos(ped.heading) * ped.speed * dt;
  }
  ped.x = Math.max(-325, Math.min(325, ped.x));
  ped.z = Math.max(-235, Math.min(295, ped.z));
  if (ped.mesh) {
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.heading;
  }
}

export function makePolicePed(x, z, scene) {
  const mesh = makePolicePersonMesh();
  scene.add(mesh);
  return { x, z, heading: 0, mesh, bustTimer: 0, speed: 5.2 };
}

export function stepPolicePed(p, dt, tx, tz) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d > 0.1) {
    p.heading = Math.atan2(dx, dz);
    const sp = Math.min(p.speed, d / dt);
    p.x += Math.sin(p.heading) * sp * dt;
    p.z += Math.cos(p.heading) * sp * dt;
  }
  if (d < 2.2) p.bustTimer += dt; else p.bustTimer = Math.max(0, p.bustTimer - dt * 2);
  if (p.mesh) { p.mesh.position.set(p.x, 0, p.z); p.mesh.rotation.y = p.heading; }
  return p.bustTimer > 1.6; // busted
}

export function nearestCarToPlayer(cars, px, pz, maxDist) {
  let best = null, bd = maxDist;
  for (const c of cars) {
    const d = Math.hypot(c.x - px, c.z - pz);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
