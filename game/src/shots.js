// Screenshot staging + scripted self-test.
// ?shot=cover|street|drive|chase stages the real game into a dense,
// deterministic scene (real systems, real HUD) and ?selftest=1 runs the
// playthrough checklist headlessly, writing results into #testout.
import { CAR_MODELS, makeCarState, makeCarMesh, makePoliceMesh } from './vehicles.js';
import { AVENUES, nodeIndex } from './roads.js';
import { startMission } from './missions.js';
import { addHeat, spawnPoliceCar } from './police.js';
import { saveGame, loadGame } from './save.js';

function placePlayerCar(store, x, z, heading, speed) {
  const car = store.playerCar;
  car.x = x; car.z = z; car.heading = heading; car.speed = speed || 0;
  car.mesh.position.set(x, 0, z); car.mesh.rotation.y = heading;
  store.player.onFoot = false;
  store.player.x = x; store.player.z = z;
}

function placePlayerOnFoot(store, x, z, heading) {
  store.player.onFoot = true;
  store.player.x = x; store.player.z = z; store.player.heading = heading || 0;
  store.player.mesh.position.set(x, 0, z);
  const car = store.playerCar;
  car.x = x + 6; car.z = z + 4; car.heading = 0;
  car.mesh.position.set(car.x, 0, car.z);
}

function scatterTraffic(store, spots) {
  // spots: [[x,z,heading,speed,target?], ...] — park traffic cars from the
  // pool; target is the road-graph node they drive toward (default 0)
  spots.forEach(([x, z, h, sp, target], i) => {
    const c = store.traffic[i % store.traffic.length];
    c.x = x; c.z = z; c.heading = h; c.speed = sp; c.cruise = sp;
    c.target = target ?? 0;
    c.mesh.position.set(x, 0, z); c.mesh.rotation.y = h;
  });
}

function scatterPeds(store, cx, cz, n) {
  for (let i = 0; i < n && i < store.peds.length; i++) {
    const p = store.peds[i];
    const a = (i / n) * Math.PI * 2;
    // keep peds on sidewalks: snap x to the nearest avenue edge
    const near = AVENUES.reduce((b, ax) => (Math.abs(ax - (cx + Math.cos(a) * 8)) < Math.abs(b - (cx + Math.cos(a) * 8)) ? ax : b), AVENUES[0]);
    p.x = near + (i % 2 ? 10.5 : -10.5);
    p.z = cz + Math.sin(a) * (6 + (i % 4) * 4);
    p.mesh.position.set(p.x, 0, p.z);
  }
}

export function applyShot(name, store, scene) {
  const s = store;
  s.shotMode = true;
  s.started = true;
  if (name === 'cover') {
    // player car parked close to camera, facing the bay: skyline behind it,
    // traffic + peds + a staged police car in frame, HUD on.
    placePlayerCar(s, 0, 128, 0, 0);
    s.camera.fixed = { pos: [4, 5.5, 110], look: [0, 2, 152] };
    scatterTraffic(s, [[-3, 152, 0, 9], [3, 168, 0, 10], [0, 186, 0, 8], [-90, 120, Math.PI / 2, 8], [90, 120, -Math.PI / 2, 8], [-180, 180, 0, 9]]);
    scatterPeds(s, 10, 142, 10);
    addHeat(s.wanted, 22, 'cover staging', () => {});
    s.holdPolice = true; // freeze the wanted display; stage one police car by hand
    const cop = makePoliceMesh();
    cop.position.set(-16, 0, 148); cop.rotation.y = 0.5;
    scene.add(cop);
    startMission(s.missions, 'harbor-run', scene, s, () => {});
    s.log('Harbor Run — deliver the package to the Docks.');
  } else if (name === 'street') {
    placePlayerOnFoot(s, -12, -52, Math.PI);
    s.camera.fixed = { pos: [-12, 4.5, -38], look: [-14, 2, -70] };
    scatterPeds(s, -12, -60, 14);
    scatterTraffic(s, [[-90, -60, 0, 7], [0, -60, Math.PI, 7], [90, -60, 0, 6]]);
    startMission(s.missions, 'the-pickup', scene, s, () => {});
    s.log('Solmarina Park — meet Sol at the north gate.');
  } else if (name === 'drive') {
    placePlayerCar(s, 90, -120, 0, 12);
    s.camera.fixed = null; // chase cam follows
    s.camera.mode = 'chase';
    s.shotDrive = true; // autopilot throttle so the speedometer reads live
    // traffic ahead of where the car is at capture time (it starts behind
    // the player and is overtaken otherwise, leaving an empty road):
    // three southbound cars ahead on the avenue, one oncoming, one crossing
    const southEnd = nodeIndex(4, 6), northEnd = nodeIndex(4, 0), eastEnd = nodeIndex(6, 4);
    scatterTraffic(s, [[90, -20, 0, 10, southEnd], [87, 10, 0, 9, southEnd], [93, 40, 0, 11, southEnd], [94, 120, Math.PI, 10, northEnd], [30, 60, Math.PI / 2, 9, eastEnd]]);
    scatterPeds(s, 100, 50, 6);
    startMission(s.missions, 'first-wheels', scene, s, () => {});
    s.log('First Wheels — take the Vela GT to the garage.');
  } else if (name === 'chase') {
    // Head-on shot: the car drives east toward a fixed camera on the road
    // edge (z=-4.5 stays inside the road half-width of 7, never in a block),
    // with two LIVE police cars in pursuit behind it — spawned by the real
    // wanted system, placed on the same street, then steered by the live
    // pursuit from there on, so the stars hold while they stay in sight.
    placePlayerCar(s, -180, 0, Math.PI / 2, 12);
    s.camera.fixed = { pos: [-32, 5.5, -4.5], look: [-80, 1.5, 0] };
    s.shotDrive = true;
    startMission(s.missions, 'hot-pursuit', scene, s, () => {});
    const cops = [spawnPoliceCar(s.wanted, scene, s.player.x, s.player.z), spawnPoliceCar(s.wanted, scene, s.player.x, s.player.z)];
    [[-212, 2], [-222, -2]].forEach(([x, z], i) => {
      const c = cops[i];
      c.x = x; c.z = z; c.heading = Math.PI / 2; c.speed = 12;
      c.mesh.position.set(x, 0, z); c.mesh.rotation.y = c.heading;
    });
    s.wanted.lastSpawn = 0;
    scatterTraffic(s, [[20, 0, Math.PI / 2, 10], [-100, 0, Math.PI / 2, 9], [0, 60, 0, 8]]);
    scatterPeds(s, -60, 0, 6);
    s.log('Three stars — lose them before the safehouse.');
  }
  return true;
}

export function shotNames() { return ['cover', 'street', 'drive', 'chase']; }

// --- scripted playthrough of every claimed system ---
export function runSelfTest(store, scene) {
  const out = [];
  const check = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail || '' });
  try {
    check('world: blocks collide', store.colliders.length > 20, `${store.colliders.length} solid blocks`);
    check('world: traffic alive', store.traffic.length >= 10, `${store.traffic.length} traffic cars`);
    check('world: pedestrians alive', store.peds.length >= 12, `${store.peds.length} peds`);
    // enter + exit a car
    const car = store.traffic[0];
    store.player.x = car.x + 2; store.player.z = car.z; store.player.onFoot = true;
    const entered = store.api.enterCar();
    check('enter car', entered && !store.player.onFoot, entered ? 'in driver seat' : 'enter failed');
    const exited = store.api.exitCar();
    check('exit car', exited && store.player.onFoot, exited ? 'back on foot' : 'exit failed');
    // wanted rises and police spawn (note: stealing the car above already
    // added heat, so assert a floor, not an exact star count)
    addHeat(store.wanted, 60, 'self-test', () => {});
    check('wanted rises', store.wanted.stars >= 3, `${store.wanted.stars} stars at heat ${store.wanted.heat.toFixed(0)}`);
    // mission 1 completes end to end
    const cashBefore = store.cash;
    startMission(store.missions, 'first-wheels', scene, store, () => {});
    store.api.enterCar();
    store.playerCar.x = -180; store.playerCar.z = 30;
    store.player.x = -180; store.player.z = 30;
    store.api.stepMissionsOnly(0.1); // enterCar step advances
    store.api.stepMissionsOnly(0.1); // goto step sees the garage, completes
    check('mission completes', store.completedMissions.includes('first-wheels'), `cash ${cashBefore} -> ${store.cash}`);
    check('mission pays', store.cash === cashBefore + 400, `+$400`);
    // save / load round trip
    saveGame(store);
    const loaded = loadGame();
    check('save/load', loaded && loaded.cash === store.cash && loaded.completedMissions.includes('first-wheels'), 'slot round-trips');
    // escape by driving: full speed east for 60 sim-seconds with a live
    // pursuit — heat must clear (parked, the cops converge; driving wins)
    for (const c of [...store.wanted.policeCars]) { scene.remove(c.mesh); }
    store.wanted.policeCars = [];
    for (const p of [...store.wanted.policePeds]) { scene.remove(p.mesh); }
    store.wanted.policePeds = [];
    store.wanted.heat = 55;
    store.playerCar.x = -270; store.playerCar.z = 0;
    store.playerCar.heading = Math.PI / 2; store.playerCar.speed = 20;
    store.player.onFoot = false;
    for (let i = 0; i < 600; i++) {
      store.api.driveStep(0.1);
      store.api.stepWantedOnly(0.1);
    }
    check('escape by driving', store.wanted.heat <= 0, `heat ${store.wanted.heat.toFixed(1)} after 60s getaway`);
    check('player health sane', store.player.health > 0, `${store.player.health}`);
  } catch (e) {
    out.push({ name: 'selftest exception', pass: false, detail: String(e && e.stack || e) });
  }
  const el = document.getElementById('testout');
  if (el) el.textContent = out.map((r) => `${r.pass ? 'PASS' : 'FAIL'} ${r.name} — ${r.detail}`).join('\n');
  window.__testResults = out;
  return out;
}
