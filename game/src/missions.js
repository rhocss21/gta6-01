// SOLMAR CITY — the story: five jobs for fixer Mara Voss, from stealing a
// car to a three-shop heist. Each mission is steps with a beacon, a HUD
// objective, and a cash reward; finishing all five crowns the player
// "King of Solmar" and opens free roam.
import * as THREE from 'three';
import { LANDMARKS } from './city.js';
import { clamp } from './util.js';

const REWARDS = [500, 800, 1000, 1500, 3000];
const NAMES = ['Hot Wheels', 'The Pickup', 'Lose the Heat', 'Coastal Run', 'Three-Shop Heist'];
const ROB_TIME = 3;

function buildMissions() {
  const shops = LANDMARKS.shops;
  return [
    {
      name: NAMES[0],
      steps: [
        { text: 'Steal a car — any car on Palm Row', target: { x: 10, z: 146 }, radius: 5, type: 'steal' },
        { text: 'Deliver the car to Sunset Garage', target: LANDMARKS.garage, radius: 14, type: 'arrive' },
      ],
    },
    {
      name: NAMES[1],
      steps: [
        { text: 'Pick up the package at Neon Palms Club', target: LANDMARKS.club, radius: 9, type: 'arrive' },
      ],
    },
    {
      name: NAMES[2],
      steps: [
        { text: 'Lose the cops — get your wanted level to zero', target: null, radius: 0, type: 'loseHeat' },
      ],
      onStart(G) { G.police.addWanted(G, 3); },
    },
    {
      name: NAMES[3],
      steps: LANDMARKS.checkpoints.map((c, i) => ({
        text: `Coastal Run — reach checkpoint ${i + 1} of 3`,
        target: c, radius: 12, type: 'arrive',
      })),
    },
    {
      name: NAMES[4],
      steps: [
        ...shops.map((s) => ({
          text: `Rob ${s.name} — stand in the doorway`,
          target: s, radius: 7, type: 'rob',
        })),
        { text: 'Getaway! Reach Sunset Garage', target: LANDMARKS.garage, radius: 14, type: 'arrive' },
      ],
    },
  ];
}

export function initMissions(G) {
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffd23e, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    depthWrite: false,
  });
  const beacon = new THREE.Group();
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true), beaconMat);
  pillar.position.y = 30;
  beacon.add(pillar);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.5, 4, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  beacon.add(ring);
  beacon.visible = false;
  G.scene.add(beacon);

  G.missions = {
    list: buildMissions(),
    index: 0,
    step: 0,
    beacon,
    robTimer: 0,
    freeRoam: false,
  };
  startMissionStep(G);
}

export function missionName(G) {
  return G.missions.freeRoam ? 'King of Solmar' : G.missions.list[G.missions.index].name;
}

function currentStep(G) {
  if (G.missions.freeRoam) return null;
  return G.missions.list[G.missions.index].steps[G.missions.step];
}

export function currentObjective(G) {
  const step = currentStep(G);
  if (!step) return { text: 'Free roam — King of Solmar. The city is yours.', target: null };
  return { text: `${missionName(G)}: ${step.text}`, target: step.target ?? null };
}

export function startMissionStep(G) {
  const m = G.missions;
  m.robTimer = 0;
  const step = currentStep(G);
  if (step && step.target) {
    m.beacon.position.set(step.target.x, 0, step.target.z);
    m.beacon.visible = true;
  } else {
    m.beacon.visible = false;
  }
  if (step && step.type === 'loseHeat') {
    const mission = m.list[m.index];
    if (mission.onStart) mission.onStart(G);
  }
}

function completeMission(G) {
  const m = G.missions;
  const reward = REWARDS[m.index];
  G.cash += reward;
  G.hud.toast(`Job done: ${m.list[m.index].name} — +$${reward}`, 'gold');
  G.audio.missionDone();
  m.index += 1;
  m.step = 0;
  if (m.index >= m.list.length) {
    m.freeRoam = true;
    m.beacon.visible = false;
    G.hud.toast('KING OF SOLMAR — all five jobs done. The city is yours.', 'gold');
  } else {
    G.hud.toast(`New job: ${m.list[m.index].name}`);
    startMissionStep(G);
  }
  G.saveGame();
}

function advanceStep(G) {
  const m = G.missions;
  m.step += 1;
  m.robTimer = 0;
  if (m.step >= m.list[m.index].steps.length) {
    completeMission(G);
  } else {
    startMissionStep(G);
  }
}

export function onCarEntered(G) {
  const step = currentStep(G);
  if (step && step.type === 'steal') advanceStep(G);
}

// Jump straight to a mission (used by screenshot staging).
export function jumpToMission(G, index) {
  const m = G.missions;
  m.index = clamp(index, 0, m.list.length - 1);
  m.step = 0;
  m.freeRoam = false;
  startMissionStep(G);
}

export function updateMissions(G, dt) {
  const m = G.missions;
  if (G.state !== 'playing' || m.freeRoam) return;
  const step = currentStep(G);
  if (!step) return;

  // Beacon pulse.
  const pulse = 1 + Math.sin(G.time * 3) * 0.12;
  m.beacon.scale.set(pulse, 1, pulse);

  if (step.type === 'loseHeat') {
    if (G.police.wanted === 0) {
      G.hud.toast('Clean. No heat, no tail.');
      advanceStep(G);
    }
    return;
  }
  if (!step.target) return;
  const pos = G.inCar && G.playerCar ? G.playerCar.mesh.position : G.playerMesh.position;
  const d = Math.hypot(step.target.x - pos.x, step.target.z - pos.z);

  if (step.type === 'rob') {
    if (d <= step.radius && !G.inCar) {
      m.robTimer += dt;
      G.hud.showRobProgress(m.robTimer / ROB_TIME);
      if (m.robTimer >= ROB_TIME) {
        G.hud.showRobProgress(0);
        G.cash += 500;
        G.police.addWanted(G, 1);
        G.audio.pickup();
        G.hud.toast(`Robbed ${step.target.name}! +$500 — and the alarm is screaming.`, 'gold');
        advanceStep(G);
      }
    } else {
      if (m.robTimer > 0) G.hud.showRobProgress(0);
      m.robTimer = 0;
    }
    return;
  }

  // arrive / steal steps complete on proximity (steal also completes on entry).
  if (d <= step.radius) {
    if (step.type === 'arrive') {
      G.audio.pickup();
      advanceStep(G);
    }
  }
}
