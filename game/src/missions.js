// Missions: a data-driven interpreter. Each mission is a list of steps;
// the interpreter watches the shared store and advances, fails or completes.
// Story spine: Dario Venn, a wheelman new to Solmarina, runs jobs for Sol
// Reyes to buy back his impounded garage — five jobs, one way out.
import * as THREE from 'three';

export const MISSIONS = [
  {
    id: 'first-wheels', name: 'First Wheels', giver: 'Sol Reyes', reward: 400,
    brief: 'Sol needs wheels. Take any car on the street and bring it to the garage on Palm Row.',
    steps: [
      { type: 'enterCar', label: 'Take a car (walk up and press E)' },
      { type: 'goto', x: -180, z: 30, r: 10, label: 'Drive to the garage on Palm Row' },
    ],
  },
  {
    id: 'harbor-run', name: 'Harbor Run', giver: 'Sol Reyes', reward: 800,
    brief: 'A package is hot. Drive it to the Docks before the buyer walks — 100 seconds.',
    steps: [
      { type: 'goto', x: 180, z: 190, r: 12, label: 'Deliver the package to the Docks', limit: 100 },
    ],
  },
  {
    id: 'hot-pursuit', name: 'Hot Pursuit', giver: 'Marisol', reward: 1000,
    brief: 'You lifted the wrong sedan — its owner called it in. Lose a three-star tail.',
    steps: [
      { type: 'gainHeat', amount: 55, label: 'The call is in — three stars on you' },
      { type: 'loseWanted', label: 'Lose the cops: break line of sight and stay gone' },
    ],
  },
  {
    id: 'the-pickup', name: 'The Pickup', giver: 'Sol Reyes', reward: 900,
    brief: 'Three drops stashed around Solmarina Park. Grab them all — on foot or by car.',
    steps: [
      { type: 'collect', points: [[-40, -30], [40, 30], [0, -50]], r: 5, label: 'Collect the stashes around the park (0/3)' },
    ],
  },
  {
    id: 'bayfront-getaway', name: 'Bayfront Getaway', giver: 'Sol Reyes', reward: 1500,
    brief: 'Final job: lift the courier sedan at the marina, shake the tail, reach the safehouse.',
    steps: [
      { type: 'goto', x: 90, z: 200, r: 10, label: 'Reach the courier sedan at the marina' },
      { type: 'gainHeat', amount: 45, label: 'The marina crew called it in' },
      { type: 'goto', x: -270, z: -180, r: 12, label: 'Reach the Harbor Heights safehouse' },
      { type: 'loseWanted', label: 'Lose the cops to finish the job' },
    ],
  },
];

export function makeMissionState() {
  return { active: null, stepIndex: 0, stepTimer: 0, collected: 0, marker: null, beacon: null, packages: [] };
}

export function missionById(id) { return MISSIONS.find((m) => m.id === id); }
export function unlockedMissions(done) {
  // linear chain: each job unlocks the next
  const idx = done.length;
  return MISSIONS.map((m, i) => ({ ...m, unlocked: i <= idx, done: done.includes(m.id) }));
}

function clearStepVisuals(ms, scene) {
  if (ms.beacon) { scene.remove(ms.beacon); ms.beacon = null; }
  for (const p of ms.packages) scene.remove(p);
  ms.packages = [];
}

export function startMission(ms, id, scene, store, log) {
  const def = missionById(id);
  if (!def) return false;
  clearStepVisuals(ms, scene);
  ms.active = def; ms.stepIndex = 0; ms.stepTimer = 0; ms.collected = 0;
  log(`Mission: ${def.name} — ${def.brief}`);
  setupStep(ms, scene, store);
  return true;
}

export function abortMission(ms, scene, log) {
  if (!ms.active) return;
  log(`Mission failed: ${ms.active.name} abandoned.`);
  clearStepVisuals(ms, scene);
  ms.active = null;
}

function setupStep(ms, scene, store) {
  const step = ms.active.steps[ms.stepIndex];
  ms.stepTimer = 0;
  clearStepVisuals(ms, scene);
  if (step.type === 'goto') {
    ms.beacon = makeBeacon(step.x, step.z);
    scene.add(ms.beacon);
    ms.marker = { x: step.x, z: step.z };
  } else if (step.type === 'collect') {
    ms.marker = null;
    for (const [x, z] of step.points) {
      const pkg = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.2, 1.2),
        new THREE.MeshLambertMaterial({ color: 0xffd23c, emissive: 0x7a5c00 }),
      );
      pkg.position.set(x, 1.6, z);
      scene.add(pkg);
      ms.packages.push(pkg);
    }
  } else if (step.type === 'gainHeat') {
    store.addHeat(step.amount, 'the job went loud');
    advance(ms, scene, store);
  } else if (step.type === 'loseWanted' || step.type === 'enterCar') {
    ms.marker = null;
  }
}

export function makeBeacon(x, z) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 2.4, 42, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  );
  beam.position.y = 21; g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3, 0.3, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23c }),
  );
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.4; g.add(ring);
  g.position.set(x, 0, z);
  return g;
}

function advance(ms, scene, store) {
  ms.stepIndex += 1;
  if (ms.stepIndex >= ms.active.steps.length) {
    completeMission(ms, scene, store);
    return;
  }
  setupStep(ms, scene, store);
}

function completeMission(ms, scene, store) {
  const def = ms.active;
  clearStepVisuals(ms, scene);
  store.cash += def.reward;
  store.completedMissions.push(def.id);
  store.log(`Job done: ${def.name} — +$${def.reward}.`);
  store.audio?.jingle();
  ms.active = null;
  store.saveGame();
}

export function stepMissions(ms, dt, scene, store) {
  if (!ms.active) return;
  const step = ms.active.steps[ms.stepIndex];
  if (!step) return;
  ms.stepTimer += dt;
  const px = store.player.x, pz = store.player.z;
  if (step.limit && ms.stepTimer > step.limit) {
    store.log(`Mission failed: ${ms.active.name} — out of time.`);
    clearStepVisuals(ms, scene);
    ms.active = null;
    return;
  }
  if (ms.beacon) ms.beacon.rotation.y += dt * 1.2;
  for (const p of ms.packages) { p.rotation.y += dt * 2; p.position.y = 1.6 + Math.sin(ms.stepTimer * 3 + p.position.x) * 0.25; }
  switch (step.type) {
    case 'enterCar':
      if (!store.player.onFoot) advance(ms, scene, store);
      break;
    case 'goto': {
      const d = Math.hypot(px - step.x, pz - step.z);
      if (d < step.r) advance(ms, scene, store);
      break;
    }
    case 'collect': {
      for (let i = ms.packages.length - 1; i >= 0; i--) {
        const p = ms.packages[i];
        if (Math.hypot(px - p.position.x, pz - p.position.z) < step.r) {
          scene.remove(p); ms.packages.splice(i, 1);
          ms.collected += 1;
          store.log(`Stash collected (${ms.collected}/${step.points.length}).`);
          store.audio?.pickup();
        }
      }
      if (ms.collected >= step.points.length) advance(ms, scene, store);
      break;
    }
    case 'loseWanted':
      if (store.wanted.heat <= 0 && store.wanted.stars === 0) advance(ms, scene, store);
      break;
    default: break;
  }
}

export function currentObjective(ms) {
  if (!ms.active) return null;
  const step = ms.active.steps[ms.stepIndex];
  if (!step) return null;
  let label = step.label;
  if (step.type === 'collect') label = label.replace(/\(\d\/\d\)/, `(${ms.collected}/${step.points.length})`);
  if (step.limit) label += ` — ${Math.max(0, Math.ceil(step.limit - ms.stepTimer))}s left`;
  return { mission: ms.active.name, label, marker: ms.marker };
}
