// Vehicles: one arcade car model shared by the player, traffic and police.
// Physics is deliberately simple — speed, heading, grip-limited steering —
// so a car never flips, never tunnels, and always answers the keys.
import * as THREE from 'three';
import { NODES, neighbours, findPath, nearestNode, snapToRoad, onRoad } from './roads.js';
import { pick, range } from './rng.js';

export const CAR_COLORS = [0xd95f4b, 0x4b7fb8, 0xe8a13c, 0x3f7d5a, 0xf3e2c7, 0x8a6fbf, 0x2e2e33, 0xc9c9c9];
export const CAR_MODELS = [
  { name: 'Vela GT', top: 34, accel: 16, color: 0xe86a2a },
  { name: 'Corto', top: 26, accel: 13, color: 0x4b7fb8 },
  { name: 'Canyon', top: 24, accel: 11, color: 0x3f7d5a },
  { name: 'Marlin', top: 30, accel: 14, color: 0xd95f4b },
  { name: 'Solstice', top: 28, accel: 13, color: 0xe8a13c },
];

export function makeCarMesh(model, color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), paint);
  body.position.y = 0.55; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 2.2), new THREE.MeshLambertMaterial({ color: 0x22323c }));
  cabin.position.set(0, 1.1, -0.2); g.add(cabin);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.18, 4.42), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  trim.position.y = 0.3; g.add(trim);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
  for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.38, wz); g.add(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b8 });
  for (const lx of [-0.7, 0.7]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    l.position.set(lx, 0.62, 2.21); g.add(l);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd92b1f });
  for (const lx of [-0.7, 0.7]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tailMat);
    l.position.set(lx, 0.62, -2.21); g.add(l);
  }
  g.userData.modelName = model.name;
  return g;
}

export function makePoliceMesh() {
  const g = makeCarMesh({ name: 'Interceptor' }, 0x1c2b3a);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2b6fd9 }));
  bar.position.set(0, 1.45, -0.2); g.add(bar);
  const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xd92b1f }));
  bar2.position.set(0.7, 1.45, -0.2); g.add(bar2);
  return g;
}

// --- arcade driving state ---
export function makeCarState(x, z, heading, model) {
  return { x, z, heading, speed: 0, model, health: 100, mesh: null, steering: 0 };
}

// One fixed step of arcade driving. Input: {throttle -1..1, steer -1..1, brake}.
// Returns collisions with block rects resolved by push-out.
export function stepCar(car, input, dt, colliders, cars) {
  const m = car.model;
  const accel = input.throttle * m.accel;
  car.speed += accel * dt;
  if (input.brake) car.speed -= Math.sign(car.speed) * 30 * dt;
  car.speed -= car.speed * 0.55 * dt;              // rolling drag
  car.speed = Math.max(-m.top * 0.4, Math.min(m.top, car.speed));
  if (Math.abs(car.speed) < 0.05 && input.throttle === 0) car.speed = 0;
  const steerAuthority = Math.min(1, Math.abs(car.speed) / 6);
  const targetSteer = input.steer * steerAuthority;
  car.steering += (targetSteer - car.steering) * Math.min(1, dt * 8);
  car.heading += car.steering * 1.9 * dt * Math.sign(car.speed || 1) * Math.min(1, Math.abs(car.speed) / 8 + 0.25);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  car.x = nx; car.z = nz;
  // block collision: push out of any block rect (radius 2.2)
  for (const b of colliders) {
    if (car.x > b.x0 - 2.2 && car.x < b.x1 + 2.2 && car.z > b.z0 - 2.2 && car.z < b.z1 + 2.2) {
      const dl = car.x - (b.x0 - 2.2), dr = (b.x1 + 2.2) - car.x;
      const dt2 = car.z - (b.z0 - 2.2), db = (b.z1 + 2.2) - car.z;
      const min = Math.min(dl, dr, dt2, db);
      if (min === dl) car.x = b.x0 - 2.2; else if (min === dr) car.x = b.x1 + 2.2;
      else if (min === dt2) car.z = b.z0 - 2.2; else car.z = b.z1 + 2.2;
      if (Math.abs(car.speed) > 6) car.health -= 2;
      car.speed *= 0.55;
    }
  }
  // soft car-car push
  if (cars) {
    for (const o of cars) {
      if (o === car || !o.mesh) continue;
      const dx = car.x - o.x, dz = car.z - o.z, d2 = dx * dx + dz * dz;
      if (d2 < 16 && d2 > 0.01) {
        const d = Math.sqrt(d2), push = (4 - d) / 2;
        car.x += (dx / d) * push; car.z += (dz / d) * push;
        car.speed *= 0.9;
      }
    }
  }
  // world bounds
  car.x = Math.max(-325, Math.min(325, car.x));
  car.z = Math.max(-235, Math.min(295, car.z));
  if (car.mesh) {
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    // body roll + pitch for feel
    car.mesh.rotation.z = -car.steering * 0.05 * Math.sign(car.speed || 1);
  }
}

// --- traffic: cars that follow the road graph, stop for red lights ---
export function makeTrafficCar(rng, scene) {
  const model = pick(rng, CAR_MODELS.slice(1));
  const color = pick(rng, CAR_COLORS);
  const mesh = makeCarMesh(model, color);
  scene.add(mesh);
  const node = Math.floor(rng() * NODES.length);
  const car = {
    ...makeCarState(NODES[node].x, NODES[node].z, rng() * Math.PI * 2, model),
    mesh, target: node, path: [], speed: range(rng, 7, 11), cruise: range(rng, 7, 11),
    wait: 0, kind: 'traffic',
  };
  return car;
}

export function stepTraffic(car, dt, colliders, playerCar, trafficLight) {
  const target = NODES[car.target];
  const dx = target.x - car.x, dz = target.z - car.z;
  const dist = Math.hypot(dx, dz);
  const wantHeading = Math.atan2(dx, dz);
  let dh = wantHeading - car.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  // red light: stop before the intersection
  const atLight = dist < 14 && trafficLight && trafficLight(car.target);
  const speedTarget = atLight ? 0 : car.cruise;
  car.speed += (speedTarget - car.speed) * Math.min(1, dt * 1.5);
  car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, dh));
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  if (dist < 3 || (atLight && car.speed < 0.5 && dist < 14)) {
    // pick a next node: continue straight if possible, else turn
    const next = neighbours(car.target);
    car.target = next[Math.floor(Math.random() * next.length)];
  }
  if (car.mesh) { car.mesh.position.set(car.x, 0, car.z); car.mesh.rotation.y = car.heading; }
  return car;
}

// Route helper: steer a pursuing car along the graph toward a target point.
export function pursueTarget(car, tx, tz, dt, colliders) {
  const from = nearestNode(car.x, car.z);
  const to = nearestNode(tx, tz);
  const path = findPath(from, to);
  const next = NODES[path.length > 1 ? path[1] : path[0]];
  const dx = next.x - car.x, dz = next.z - car.z;
  const wantHeading = Math.atan2(dx, dz);
  let dh = wantHeading - car.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, dh * 1.5));
  const dist = Math.hypot(tx - car.x, tz - car.z);
  const throttle = dist > 12 ? 1 : 0.4;
  stepCar(car, { throttle, steer, brake: false }, dt, colliders, null);
}
