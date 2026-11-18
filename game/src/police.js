// Wanted system: heat 0-100, stars, police pursuit, escape and arrest.
// Heat rises with crimes and falls when the player breaks line of sight;
// police cars chase by road, police on foot chase when the player is on foot.
import { NODES, nearestNode } from './roads.js';
import { makeCarState, makePoliceMesh, pursueTarget, stepCar } from './vehicles.js';
import { makePolicePed, stepPolicePed } from './people.js';

export const STAR_NAMES = ['', 'One star', 'Two stars', 'Three stars', 'Four stars', 'Five stars'];

export function makeWanted() {
  return {
    heat: 0, stars: 0, escapeTimer: 0, seenTimer: 0,
    policeCars: [], policePeds: [], lastSpawn: 0,
  };
}

export function starsOf(heat) { return Math.min(5, Math.ceil(heat / 20)); }

export function addHeat(w, amount, reason, log) {
  w.heat = Math.min(100, w.heat + amount);
  const s = starsOf(w.heat);
  if (s > w.stars && log) log(`Wanted level up: ${STAR_NAMES[s]} — ${reason}`);
  w.stars = s;
}

export function spawnPoliceCar(w, scene, px, pz) {
  // spawn at a road node 160-250m away so the chase arrives, never on top;
  // slightly slower than the player's best car, so a clean getaway is possible
  const a = Math.random() * Math.PI * 2;
  const d = 160 + Math.random() * 90;
  let node = nearestNode(px + Math.cos(a) * d, pz + Math.sin(a) * d);
  const car = {
    ...makeCarState(NODES[node].x, NODES[node].z, 0, { name: 'Interceptor', top: 30, accel: 16 }),
    mesh: makePoliceMesh(), kind: 'police',
  };
  car.mesh.position.set(car.x, 0, car.z);
  scene.add(car.mesh);
  w.policeCars.push(car);
  return car;
}

export function spawnPolicePed(w, scene, px, pz) {
  const p = makePolicePed(px + (Math.random() - 0.5) * 30, pz + (Math.random() - 0.5) * 30, scene);
  w.policePeds.push(p);
  return p;
}

function removeCar(w, scene, car) {
  scene.remove(car.mesh);
  w.policeCars = w.policeCars.filter((c) => c !== car);
}
function removePed(w, scene, p) {
  scene.remove(p.mesh);
  w.policePeds = w.policePeds.filter((q) => q !== p);
}

// One step. Returns 'busted' | 'escaped' | null. `s` is the shared store.
export function stepWanted(w, dt, s, scene, log) {
  const px = s.player.x, pz = s.player.z;
  const inCar = !s.player.onFoot;
  const prevStars = w.stars;
  w.stars = starsOf(w.heat);
  // Staged scenes (screenshots) hold the wanted display steady: no spawning,
  // no pursuit, no decay — the chase shot runs the live system instead.
  if (s.holdPolice) return null;

  // --- spawning: keep police count matched to stars ---
  const wantCars = w.stars >= 2 ? Math.min(4, w.stars) : (w.stars === 1 ? 1 : 0);
  const wantPeds = (!inCar && w.stars >= 1) ? Math.min(3, w.stars + 1) : 0;
  w.lastSpawn += dt;
  if (w.policeCars.length < wantCars && w.lastSpawn > 1.2) {
    spawnPoliceCar(w, scene, px, pz); w.lastSpawn = 0;
  }
  if (w.policePeds.length < wantPeds && w.lastSpawn > 1.2) {
    spawnPolicePed(w, scene, px, pz); w.lastSpawn = 0;
  }
  if (w.stars === 0) {
    for (const c of [...w.policeCars]) removeCar(w, scene, c);
    for (const p of [...w.policePeds]) removePed(w, scene, p);
  }

  // --- pursuit ---
  let nearest = Infinity;
  for (const c of w.policeCars) {
    pursueTarget(c, px, pz, dt, s.colliders);
    const d = Math.hypot(c.x - px, c.z - pz);
    nearest = Math.min(nearest, d);
    // ramming the player car damages it; touching the player on foot busts
    if (!inCar && d < 3) return 'busted';
    if (inCar && d < 4.5) { s.playerCar.health -= 14 * dt; }
  }
  for (const p of [...w.policePeds]) {
    if (stepPolicePed(p, dt, px, pz)) return 'busted';
    nearest = Math.min(nearest, Math.hypot(p.x - px, p.z - pz));
    const d = Math.hypot(p.x - px, p.z - pz);
    if (d > 130) removePed(w, scene, p);
  }
  for (const c of [...w.policeCars]) {
    if (Math.hypot(c.x - px, c.z - pz) > 180) removeCar(w, scene, c);
  }

  // --- escape: unseen + far = heat decays; seen + near = escape timer resets ---
  const seen = nearest < 70;
  if (seen) { w.seenTimer = 0; w.escapeTimer = 0; }
  else {
    w.seenTimer += dt;
    if (w.seenTimer > 3) w.escapeTimer += dt;
  }
  if (w.escapeTimer > 0) {
    w.heat = Math.max(0, w.heat - 9 * dt);
    if (w.heat <= 0 && prevStars > 0) {
      w.stars = 0;
      if (log) log('You lost the cops. Heat is gone.');
      return 'escaped';
    }
  } else if (w.stars === 0 && w.heat > 0) {
    w.heat = Math.max(0, w.heat - 2 * dt);
  }
  w.stars = starsOf(w.heat);
  return null;
}
