// Solmarina — bootstrap. One loop owns the clock, input, camera and the
// shared state store; every feature module reads/writes the store only.
// Systems inventory: rng, roads, city, vehicles, people, police, missions,
// hud, audio, save, shots. Original city, story and art; no Rockstar IP.
import * as THREE from 'three';
import { makeStreams } from './rng.js';
import { buildCity, districtAt } from './city.js';
import { AVENUES, STREETS, NODES } from './roads.js';
import { CAR_MODELS, makeCarState, makeCarMesh, makeTrafficCar, stepCar, stepTraffic } from './vehicles.js';
import { makePlayer, makePlayerMesh, stepPlayer, makePed, stepPed, nearestCarToPlayer } from './people.js';
import { makeWanted, addHeat, stepWanted } from './police.js';
import { MISSIONS, makeMissionState, startMission, abortMission, stepMissions, unlockedMissions } from './missions.js';
import { initHud } from './hud.js';
import { makeAudio } from './audio.js';
import { saveGame, loadGame } from './save.js';
import { applyShot, runSelfTest } from './shots.js';

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') || 7);
const SHOT = params.get('shot');
const SELFTEST = params.get('selftest') === '1';

// --- error surface: any boot failure lands in #err for headless checks ---
window.addEventListener('error', (e) => {
  const el = document.getElementById('err');
  if (el) el.textContent += `\nERROR: ${e.message}`;
});

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
camera.position.set(0, 12, -40);

// --- shared state store ---
const store = {
  cash: 250, completedMissions: [], best: {},
  player: null, playerCar: null, traffic: [], peds: [],
  wanted: makeWanted(), missions: makeMissionState(),
  colliders: [], camera: { mode: 'chase', yaw: 0, pitch: 0.32, fixed: null },
  started: false, paused: false, shotMode: false, time: 0,
  log: () => {}, addHeat: (a, r) => {}, saveGame: () => {},
};
window.__store = store;

// --- world ---
const streams = makeStreams(SEED);
const city = buildCity(scene, streams);
store.colliders = city.colliders;

// --- player + his car ---
store.player = makePlayer(city.spawn.garage.x, city.spawn.garage.z);
store.player.mesh = makePlayerMesh();
scene.add(store.player.mesh);
store.playerCar = {
  ...makeCarState(city.spawn.garage.x + 4, city.spawn.garage.z, 0, CAR_MODELS[0]),
  mesh: makeCarMesh(CAR_MODELS[0], CAR_MODELS[0].color), kind: 'player',
};
store.playerCar.mesh.position.set(store.playerCar.x, 0, store.playerCar.z);
scene.add(store.playerCar.mesh);

// --- traffic + pedestrians ---
for (let i = 0; i < 14; i++) store.traffic.push(makeTrafficCar(streams.traffic, scene));
for (let i = 0; i < 18; i++) store.peds.push(makePed(streams.peds, scene));

// --- audio, hud, save ---
const audio = makeAudio();
store.audio = audio;
const hud = initHud(store, {});
store.log = (m) => hud.log(m);
store.addHeat = (amount, reason) => addHeat(store.wanted, amount, reason, store.log);
store.saveGame = () => saveGame(store);
const saved = loadGame();
if (saved) {
  store.cash = saved.cash;
  store.completedMissions = saved.completedMissions;
  store.best = saved.best || {};
}

// --- input ---
const keys = {};
let mouseDX = 0, mouseDY = 0, pointerLocked = false;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE') tryEnterExit();
  if (e.code === 'KeyF') punch();
  if (e.code === 'KeyM') toggleMissionMenu();
  if (e.code === 'KeyN') { audio.setMuted(!audio.isMuted()); store.log(audio.isMuted() ? 'Sound off.' : 'Sound on.'); }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'Digit1') { store.player.armed = false; }
  if (e.code === 'Digit2') { store.player.armed = true; store.log('Pistol out. Click to fire.'); }
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('click', () => {
  audio.unlock();
  if (store.started && !pointerLocked) lockPointer();
});
function lockPointer() {
  try {
    const r = canvas.requestPointerLock?.();
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch (e) { /* pointer lock unavailable (headless) — mouse look just stays off */ }
}
function releasePointer() {
  // Clickable overlays must release the lock: while the canvas holds pointer
  // lock, every mouse event retargets to the canvas, so overlay buttons
  // (Start job, Resume, Walk free) never receive a real mouse click.
  try { document.exitPointerLock?.(); } catch (e) { /* no lock held */ }
}
document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === canvas; });
document.addEventListener('mousemove', (e) => {
  if (!pointerLocked) return;
  mouseDX += e.movementX; mouseDY += e.movementY;
});
canvas.addEventListener('mousedown', (e) => { if (e.button === 0) shoot(); });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function driveInput() {
  return {
    throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 0.7 : 0),
    steer: (keys.KeyA || keys.ArrowLeft ? -1 : 0) + (keys.KeyD || keys.ArrowRight ? 1 : 0),
    brake: !!keys.Space,
  };
}
function footInput() {
  return {
    forward: !!(keys.KeyW || keys.ArrowUp), back: !!(keys.KeyS || keys.ArrowDown),
    left: !!(keys.KeyA || keys.ArrowLeft), right: !!(keys.KeyD || keys.ArrowRight),
    run: !!keys.ShiftLeft || !!keys.ShiftRight,
  };
}

function tryEnterExit() {
  if (!store.started || store.paused) return;
  if (store.player.onFoot) enterCar();
  else exitCar();
}
function enterCar() {
  const car = nearestCarToPlayer([...store.traffic, store.playerCar], store.player.x, store.player.z, 4.5);
  if (!car) { store.log('No car close enough.'); return false; }
  if (car === store.playerCar) {
    // getting back into your own parked car: reuse it, no new mesh
    store.player.onFoot = false;
    store.camera.mode = 'chase';
    audio.click();
    return true;
  }
  if (car.kind === 'traffic') {
    store.addHeat(12, 'car stolen');
    store.log(`You took the ${car.model.name}. The owner called it in.`);
    store.traffic = store.traffic.filter((c) => c !== car);
    scene.remove(car.mesh);
  }
  store.playerCar = {
    ...makeCarState(car.x, car.z, car.heading, car.model),
    mesh: makeCarMesh(car.model, car.model.color || 0xd95f4b), kind: 'player',
  };
  store.playerCar.mesh.position.set(car.x, 0, car.z);
  scene.add(store.playerCar.mesh);
  store.player.onFoot = false;
  store.camera.mode = 'chase';
  audio.click();
  return true;
}
function exitCar() {
  if (store.player.onFoot) return false;
  store.player.onFoot = true;
  store.player.x = store.playerCar.x - Math.sin(store.playerCar.heading) * 3;
  store.player.z = store.playerCar.z - Math.cos(store.playerCar.heading) * 3;
  store.player.heading = store.playerCar.heading;
  store.camera.mode = 'orbit';
  audio.click();
  return true;
}

function punch() {
  if (!store.started || !store.player.onFoot) return;
  const p = store.player;
  for (let i = store.peds.length - 1; i >= 0; i--) {
    const ped = store.peds[i];
    const d = Math.hypot(ped.x - p.x, ped.z - p.z);
    if (d < 2.4) {
      scene.remove(ped.mesh);
      store.peds.splice(i, 1);
      store.peds.push(makePed(streams.peds, scene));
      store.addHeat(8, 'assault');
      store.log('You knocked a pedestrian flat. Someone saw that.');
      audio.thud();
      return;
    }
  }
}

const raycaster = new THREE.Raycaster();
function shoot() {
  if (!store.started || !store.player.onFoot || !store.player.armed) return;
  if (store.player.ammo <= 0) { store.log('Out of ammo — finish a job to restock.'); return; }
  store.player.ammo -= 1;
  audio.shot();
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const targets = [];
  for (const ped of store.peds) targets.push({ obj: ped.mesh, kind: 'ped', ref: ped });
  for (const c of store.traffic) targets.push({ obj: c.mesh, kind: 'car', ref: c });
  const hits = raycaster.intersectObjects(targets.map((t) => t.obj), true);
  if (hits.length) {
    let o = hits[0].object;
    while (o.parent && o.parent !== scene) o = o.parent;
    const t = targets.find((x) => x.obj === o);
    if (t && t.kind === 'ped') {
      scene.remove(t.ref.mesh);
      store.peds = store.peds.filter((q) => q !== t.ref);
      store.peds.push(makePed(streams.peds, scene));
      store.addHeat(14, 'shots fired');
      store.log('Shots fired. The whole block heard that.');
    } else if (t) {
      t.ref.health = (t.ref.health ?? 100) - 34;
      store.addHeat(10, 'shots fired');
      if (t.ref.health <= 0) { scene.remove(t.ref.mesh); store.traffic = store.traffic.filter((q) => q !== t.ref); }
    }
  }
}

// --- menus ---
const $ = (id) => document.getElementById(id);
function toggleMissionMenu() {
  if (!store.started) return;
  const menu = $('missionMenu');
  if (menu.style.display === 'flex') { hud.hideMenu(); store.paused = false; lockPointer(); return; }
  const list = unlockedMissions(store.completedMissions);
  const html = list.map((m) => `
    <div class="mission-row">
      <b>${m.done ? '✓ ' : ''}${m.name}</b> — ${m.giver} — $${m.reward}
      <div class="mission-brief">${m.brief}</div>
      ${m.unlocked && !m.done && !store.missions.active
        ? `<button data-mission="${m.id}">Start job</button>`
        : m.done ? '<span class="done">Done</span>' : '<span class="locked">Finish the previous job first</span>'}
    </div>`).join('');
  hud.showMenu(html);
  store.paused = true;
  releasePointer();
  document.querySelectorAll('[data-mission]').forEach((b) => b.addEventListener('click', () => {
    hud.hideMenu(); store.paused = false; lockPointer();
    startMission(store.missions, b.dataset.mission, scene, store, store.log);
    audio.click();
  }));
}
function togglePause() {
  if (!store.started || $('missionMenu').style.display === 'flex') return;
  store.paused = !store.paused;
  hud.showPause(store.paused);
  if (store.paused) releasePointer(); else lockPointer();
}
function startGame(fromSave) {
  audio.unlock();
  if (fromSave && saved) {
    store.player.x = saved.player.x; store.player.z = saved.player.z;
    store.player.onFoot = true;
  }
  store.started = true;
  hud.hideStart();
  lockPointer();
  store.log('Welcome to Solmarina. Press M for jobs, E to take a car.');
  if (!store.completedMissions.length) store.log('Sol Reyes is waiting — open the jobs menu (M).');
}
$('startBtn').addEventListener('click', () => startGame(false));
$('continueBtn').addEventListener('click', () => startGame(true));
$('resumeBtn').addEventListener('click', togglePause);
$('bustedBtn').addEventListener('click', () => {
  hud.hideBusted();
  lockPointer();
  store.player.x = city.spawn.safehouse.x; store.player.z = city.spawn.safehouse.z;
  store.player.health = 100; store.player.onFoot = true;
  store.started = true;
});
if (!saved) $('continueBtn').style.display = 'none';

// --- camera rig: chase cam for driving, orbit cam on foot, fixed for shots ---
const camPos = new THREE.Vector3(0, 12, -40);
const camLook = new THREE.Vector3();
function updateCamera(dt) {
  const p = store.player;
  if (store.camera.fixed) {
    const f = store.camera.fixed;
    camera.position.set(f.pos[0], f.pos[1], f.pos[2]);
    camera.lookAt(f.look[0], f.look[1], f.look[2]);
    return;
  }
  if (!p.onFoot && store.playerCar) {
    const c = store.playerCar;
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    const tx = c.x - fx * 11, tz = c.z - fz * 11;
    camPos.x += (tx - camPos.x) * Math.min(1, dt * 5);
    camPos.y += (4.6 - camPos.y) * Math.min(1, dt * 5);
    camPos.z += (tz - camPos.z) * Math.min(1, dt * 5);
    camera.position.copy(camPos);
    camLook.set(c.x + fx * 9, 1.8, c.z + fz * 9);
    camera.lookAt(camLook);
  } else {
    store.camera.yaw -= mouseDX * 0.0032;
    store.camera.pitch = Math.max(0.08, Math.min(1.1, store.camera.pitch + mouseDY * 0.0024));
    mouseDX = 0; mouseDY = 0;
    const yaw = store.camera.yaw, pitch = store.camera.pitch;
    const d = 7.5;
    const cx = p.x + Math.sin(yaw) * Math.cos(pitch) * d;
    const cz = p.z + Math.cos(yaw) * Math.cos(pitch) * d;
    const cy = 1.6 + Math.sin(pitch) * d;
    camPos.x += (cx - camPos.x) * Math.min(1, dt * 10);
    camPos.y += (cy - camPos.y) * Math.min(1, dt * 10);
    camPos.z += (cz - camPos.z) * Math.min(1, dt * 10);
    camera.position.copy(camPos);
    camera.lookAt(p.x, 1.7, p.z);
  }
}

// --- traffic lights: alternating phases per orientation ---
function trafficLight(nodeIdx) {
  const phase = Math.floor(store.time / 6) % 2;
  const n = NODES[nodeIdx];
  const ns = (n.x + 270) % 180 === 0; // avenue-aligned intersections
  return ns ? phase === 0 : phase === 1;
}

// --- main loop: fixed-step simulation, render every frame ---
let last = performance.now(), acc = 0, saveTimer = 0;
const STEP = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!store.paused && store.started) {
    acc += dtReal;
    while (acc >= STEP) {
      acc -= STEP;
      step(STEP);
    }
  }
  renderer.render(scene, camera);
  if (!window.__ready) { window.__ready = true; }
}

function step(dt) {
  store.time += dt;
  const p = store.player;
  if (p.onFoot) {
    stepPlayer(p, footInput(), store.camera.yaw, dt, store.colliders);
  } else {
    const car = store.playerCar;
    const before = car.speed;
    // screenshot autopilot: full throttle, straight down the road
    const din = store.shotDrive ? { throttle: 1, steer: 0, brake: false } : driveInput();
    stepCar(car, din, dt, store.colliders, store.traffic);
    if (Math.abs(car.speed) > 12 && Math.abs(car.speed - before) > 6) audio.thud();
    if (car.health <= 0) {
      scene.remove(car.mesh);
      store.log('Your car is wrecked. On foot again.');
      store.addHeat(10, 'wrecked car');
      p.health = Math.max(20, p.health - 20);
      p.onFoot = true;
      p.x = car.x + 3; p.z = car.z + 3;
      audio.thud();
    }
    p.x = car.x; p.z = car.z;
  }
  for (const c of store.traffic) stepTraffic(c, dt, store.colliders, null, trafficLight);
  for (const ped of store.peds) stepPed(ped, dt, p, [...store.traffic, store.playerCar].filter(Boolean));
  stepMissions(store.missions, dt, scene, store);
  const busted = stepWanted(store.wanted, dt, store, scene, store.log);
  if (busted === 'busted') {
    const fine = Math.min(store.cash, 200);
    store.cash -= fine;
    store.wanted.heat = 0; store.wanted.stars = 0;
    if (store.missions.active) abortMission(store.missions, scene, store.log);
    store.log(`Busted! The Solmarina PD took $${fine} and your morning.`);
    audio.fail();
    hud.showBusted();
    releasePointer();
    store.started = false;
    store.saveGame();
  }
  updateCamera(dt);
  audio.update(dt, p.onFoot ? 0 : store.playerCar.speed, store.wanted.stars);
  hud.update(dt);
  saveTimer += dt;
  if (saveTimer > 20) { saveTimer = 0; store.saveGame(); }
}

// --- debug / shot / self-test hooks (used by the audit, not by players) ---
store.api = {
  enterCar, exitCar,
  stepMissionsOnly: (dt) => stepMissions(store.missions, dt, scene, store),
  stepWantedOnly: (dt) => stepWanted(store.wanted, dt, store, scene, store.log),
  driveStep: (dt) => {
    stepCar(store.playerCar, { throttle: 1, steer: 0, brake: false }, dt, store.colliders, store.traffic);
    store.player.x = store.playerCar.x; store.player.z = store.playerCar.z;
  },
  teleport: (x, z) => { store.player.x = x; store.player.z = z; },
};
window.__game = { store, api: store.api };

// --- boot ---
if (SHOT) {
  applyShot(SHOT, store, scene);
  hud.hideStart();
  store.log(`Solmarina — ${districtAt(store.player.x, store.player.z)}. Press M for jobs.`);
}
if (SELFTEST) {
  store.started = true;
  hud.hideStart();
  setTimeout(() => runSelfTest(store, scene), 300);
} else if (!SHOT) {
  hud.showStart();
}
requestAnimationFrame(frame);
