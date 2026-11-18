// SOLMAR CITY — entry point: wires the city, player, cars, traffic, police,
// combat, missions, HUD, audio and save together and runs the game loop.
//
// Story: Jax Marlowe, ex-wheelman, owes fixer Mara Voss $50,000. Five jobs
// stand between him and freedom. All names, places, art and sound are original.
import * as THREE from 'three';
import { mulberry32, clamp, dist2, angleDiff } from './util.js';
import { buildCity } from './city.js';
import { Player } from './player.js';
import { makeCarMesh, Car, CAR_COLORS } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { SolmarAudio } from './audio.js';
import { hasSave, saveGame, loadSave, clearSave, applySave } from './save.js';
import { applyShot } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '7', 10) || 7;
const shotName = params.get('shot') || '';
const rng = mulberry32(seed);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5dd);
scene.fog = new THREE.Fog(0x9fc7e8, 130, 560);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0c8, 1.6);
sun.position.set(180, 260, 120);
scene.add(sun);

// ---------- game state ----------
const G = {
  state: 'menu',           // menu | playing | paused | busted | wasted | complete
  now: 0,
  money: 0,
  wanted: 0,
  wantedDecayTimer: 0,
  shootWantedCooldown: 0,
  speedWantedCooldown: 0,
  lastWanted: 0,
  playerCar: null,
  cameraYaw: Math.PI,
  cameraPitch: 0.35,
  camOffset: 0,            // drag offset added to the chase-cam yaw
  menuOrbit: true,
  menuAngle: 0,
};
G.city = buildCity(scene, rng);
G.audio = new SolmarAudio();
G.player = new Player(scene);
G.combat = new Combat(scene, G.audio);
G.traffic = new Traffic(scene, rng, G.city);
G.police = new Police(scene, rng, G.city);
G.hud = new Hud();
G.missions = new Missions(scene, G.city, {
  onComplete: (m, reward) => {
    G.money += reward;
    G.audio.playMissionComplete();
    G.hud.toast(`JOB DONE: ${m.name} — +$${reward}`, 'gold');
    saveGame(G);
  },
  onToast: (text, kind) => G.hud.toast(text, kind),
  onPickup: () => G.audio.playPickup(),
  onRobbery: (shopName) => {
    G.money += 150;
    addWanted(1);
    G.audio.playPickup();
    G.hud.toast(`Robbed ${shopName} — +$150 cash`, 'gold');
  },
  onStoryComplete: () => {
    G.state = 'complete';
    G.hud.showOverlay('complete');
  },
});
G.player.setPosition(G.city.spawn.x, G.city.spawn.z, G.city.spawn.heading);

// ---------- parked cars ----------
const PARKED_SPOTS = [
  { x: 86, z: 18, h: 0 }, { x: 86, z: 60, h: 0 }, { x: 94, z: -30, h: Math.PI },
  { x: 86, z: -80, h: 0 }, { x: -120, z: -86, h: Math.PI / 2 }, { x: 60, z: -86, h: Math.PI / 2 },
  { x: 150, z: 94, h: -Math.PI / 2 }, { x: -150, z: 34, h: Math.PI / 2 },
];
let parkedCars = [];
function spawnParkedCar(x, z, heading, color) {
  const mesh = makeCarMesh(color, false);
  scene.add(mesh);
  const car = new Car(mesh, x, z, heading, {});
  car.owned = false;
  parkedCars.push(car);
  return car;
}
function respawnParkedCars() {
  for (const c of parkedCars) scene.remove(c.mesh);
  parkedCars = [];
  PARKED_SPOTS.forEach((s, i) => {
    spawnParkedCar(s.x, s.z, s.h, CAR_COLORS[(i * 3 + 1) % CAR_COLORS.length]);
  });
}
respawnParkedCars();
G.spawnParkedCar = spawnParkedCar;

function spawnPlayerCar(x, z, heading, color) {
  const mesh = makeCarMesh(color, false);
  scene.add(mesh);
  const car = new Car(mesh, x, z, heading, { isPlayer: true });
  car.owned = true;
  G.playerCar = car;
  G.player.inCar = true;
  return car;
}
G.spawnPlayerCar = spawnPlayerCar;

// ---------- wanted level ----------
function addWanted(n) {
  G.wanted = clamp(G.wanted + n, 0, 5);
  G.wantedDecayTimer = 0;
}
G.addWanted = addWanted;

// ---------- police callbacks ----------
G.police.onBusted = () => {
  if (G.state !== 'playing') return;
  G.money = Math.floor(G.money * 0.85);
  G.audio.playBusted();
  G.state = 'busted';
  G.hud.showOverlay('busted');
};
G.police.onCopKilled = () => { addWanted(2); G.hud.toast('Cop down — the heat is on!', ''); };
G.combat.onShoot = (x, z, now) => {
  G.traffic.reportGunfire(x, z, now);
  if (G.shootWantedCooldown <= 0) { addWanted(1); G.shootWantedCooldown = 3; }
};
G.combat.onCopKilled = () => { addWanted(2); G.hud.toast('Cop down — the heat is on!', ''); };
G.combat.onPedKilled = () => { addWanted(1); };

// ---------- input ----------
const keys = new Set();
let dragging = false, lastMX = 0, lastMY = 0;
const input = { forward: false, back: false, left: false, right: false, sprint: false, jump: false, handbrake: false };

function refreshInput() {
  input.forward = keys.has('KeyW') || keys.has('ArrowUp');
  input.back = keys.has('KeyS') || keys.has('ArrowDown');
  input.left = keys.has('KeyA') || keys.has('ArrowLeft');
  input.right = keys.has('KeyD') || keys.has('ArrowRight');
  input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  input.jump = keys.has('Space');
  input.handbrake = keys.has('Space');
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  G.audio.ensureAudio();
  keys.add(e.code);
  refreshInput();
  if (e.code === 'Escape') {
    if (G.state === 'playing') pauseGame();
    else if (G.state === 'paused') resumeGame();
  } else if (e.code === 'KeyM') {
    toggleMute();
  } else if (e.code === 'KeyR' && G.state === 'playing') {
    if (G.combat.startReload()) G.hud.toast('Reloading…', '');
  } else if (e.code === 'KeyF' && G.state === 'playing' && !G.playerCar) {
    G.combat.punch(G.player.pos, G.player.heading, G.police, G.traffic);
  } else if (e.code === 'KeyE' && G.state === 'playing') {
    if (G.playerCar) exitCar();
    else tryStealCar();
  }
});
window.addEventListener('keyup', (e) => { keys.delete(e.code); refreshInput(); });
window.addEventListener('blur', () => { keys.clear(); refreshInput(); });

const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', (e) => {
  G.audio.ensureAudio();
  if (e.button === 0) {
    if (G.state === 'playing' && !G.playerCar) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const origin = new THREE.Vector3(G.player.pos.x, 1.5, G.player.pos.z).addScaledVector(dir, 0.6);
      G.combat.shoot(origin, dir, camera, G.police, G.traffic, G.now);
    }
    dragging = true; lastMX = e.clientX; lastMY = e.clientY;
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMX, dy = e.clientY - lastMY;
  lastMX = e.clientX; lastMY = e.clientY;
  G.cameraYaw -= dx * 0.005;
  G.cameraPitch = clamp(G.cameraPitch + dy * 0.003, 0.08, 1.1);
  if (G.playerCar) G.camOffset -= dx * 0.005;
});
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- car enter / exit ----------
function nearestStealableCar(maxD) {
  let best = null, bestD = maxD;
  const px = G.player.pos.x, pz = G.player.pos.z;
  for (const c of parkedCars) {
    const d = dist2(px, pz, c.pos.x, c.pos.z);
    if (d < bestD) { best = c; bestD = d; }
  }
  for (const t of G.traffic.cars) {
    const d = dist2(px, pz, t.car.pos.x, t.car.pos.z);
    if (d < bestD) { best = t.car; bestD = d; }
  }
  return best;
}

function tryStealCar() {
  const car = nearestStealableCar(4.5);
  if (!car) return;
  // pull it out of the parked / traffic lists — it is the player's now
  const pi = parkedCars.indexOf(car);
  if (pi >= 0) parkedCars.splice(pi, 1);
  const ti = G.traffic.cars.findIndex((t) => t.car === car);
  if (ti >= 0) G.traffic.cars.splice(ti, 1);
  car.isPlayer = true;
  G.playerCar = car;
  G.player.inCar = true;
  G.audio.playClick();
  if (!car.owned) {
    car.owned = true;
    addWanted(1);
    G.hud.toast('Car stolen — the cops noticed!', '');
    G.missions.onCarStolen();
  } else {
    G.hud.toast('Back behind the wheel.', '');
  }
}

function exitCar() {
  const car = G.playerCar;
  if (!car) return;
  const h = car.heading;
  const px = car.pos.x - Math.cos(h) * 2.6;
  const pz = car.pos.z + Math.sin(h) * 2.6;
  G.player.inCar = false;
  G.player.setPosition(px, pz, h);
  G.playerCar = null;
  car.isPlayer = false;
  car.speed = 0;
  if (!parkedCars.includes(car)) parkedCars.push(car);
}

// ---------- menus / flow ----------
function startPlaying() {
  G.state = 'playing';
  G.menuOrbit = false;
  G.hud.showHud(true);
  G.hud.hideOverlays();
  G.audio.ensureAudio();
}
function startNewGame() {
  clearSave();
  resetRun();
  startPlaying();
  G.hud.toast('New game — Mara is waiting. Five jobs. Go.', 'gold');
}
function continueGame() {
  const d = loadSave();
  resetRun();
  if (d) {
    applySave(G, d);
    G.hud.toast('Save loaded — welcome back to Solmar City.', 'gold');
  }
  startPlaying();
}
function resetRun() {
  if (G.playerCar) { scene.remove(G.playerCar.mesh); G.playerCar = null; }
  respawnParkedCars();
  G.player.inCar = false;
  G.player.health = 100;
  G.player.lastDamageAt = -99;
  G.player.setPosition(G.city.spawn.x, G.city.spawn.z, G.city.spawn.heading);
  G.combat.mag = 12; G.combat.reserve = 60; G.combat.reloadTimer = 0;
  G.money = 0; G.wanted = 0; G.wantedDecayTimer = 0;
  G.police.syncToWanted(0, G.player.pos);
  G.missions.setMission(0);
  G.cameraYaw = Math.PI; G.cameraPitch = 0.35; G.camOffset = 0;
}
function pauseGame() {
  G.state = 'paused';
  G.hud.showOverlay('pause');
}
function resumeGame() {
  G.state = 'playing';
  G.hud.hideOverlays();
}
function toggleMute() {
  G.audio.setMuted(!G.audio.muted);
  const b = document.getElementById('btn-mute');
  if (b) b.textContent = 'MUTE: ' + (G.audio.muted ? 'ON' : 'OFF');
}
function quitToMenu() {
  G.state = 'menu';
  G.menuOrbit = true;
  if (G.playerCar) { scene.remove(G.playerCar.mesh); G.playerCar = null; }
  G.player.inCar = false;
  G.player.setPosition(G.city.spawn.x, G.city.spawn.z, G.city.spawn.heading);
  G.police.syncToWanted(0, G.player.pos);
  G.hud.showHud(false);
  G.hud.showOverlay('menu');
  refreshContinueButton();
}
function refreshContinueButton() {
  document.getElementById('btn-continue').classList.toggle('hidden', !hasSave());
}
function respawnAfterBusted() {
  G.player.health = 100;
  G.wanted = 0;
  G.player.inCar = false;
  if (G.playerCar) { scene.remove(G.playerCar.mesh); G.playerCar = null; }
  G.player.setPosition(G.city.stationPos.x, G.city.stationPos.z, 0);
  G.police.syncToWanted(0, G.player.pos);
  startPlaying();
}
function respawnAfterWasted() {
  G.money = Math.floor(G.money * 0.9);
  G.player.health = 100;
  G.wanted = 0;
  G.player.inCar = false;
  if (G.playerCar) { scene.remove(G.playerCar.mesh); G.playerCar = null; }
  G.player.setPosition(G.city.hospitalPos.x, G.city.hospitalPos.z, 0);
  G.police.syncToWanted(0, G.player.pos);
  startPlaying();
}

document.getElementById('btn-new').addEventListener('click', () => { G.audio.ensureAudio(); startNewGame(); });
document.getElementById('btn-continue').addEventListener('click', () => { G.audio.ensureAudio(); continueGame(); });
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-save').addEventListener('click', () => {
  if (saveGame(G)) G.hud.toast('Game saved.', 'gold'); else G.hud.toast('Save failed.', '');
});
document.getElementById('btn-restart').addEventListener('click', () => { resetRun(); startPlaying(); });
document.getElementById('btn-mute').addEventListener('click', toggleMute);
document.getElementById('btn-quit').addEventListener('click', quitToMenu);
document.getElementById('btn-respawn-busted').addEventListener('click', respawnAfterBusted);
document.getElementById('btn-respawn-wasted').addEventListener('click', respawnAfterWasted);
document.getElementById('btn-free-roam').addEventListener('click', () => { G.state = 'playing'; G.hud.hideOverlays(); });
document.getElementById('btn-menu-complete').addEventListener('click', quitToMenu);

// ---------- camera ----------
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  if (G.state === 'menu') {
    G.menuAngle += dt * 0.045;
    const r = 250;
    camera.position.set(Math.cos(G.menuAngle) * r, 130, Math.sin(G.menuAngle) * r);
    camera.lookAt(0, 10, 0);
    return;
  }
  let tx, ty, tz, dist, pitch;
  if (G.playerCar) {
    // chase cam: ease the yaw toward the car's heading plus any drag offset
    const want = G.playerCar.heading + G.camOffset;
    G.cameraYaw += angleDiff(want, G.cameraYaw) * Math.min(1, dt * 4);
    G.camOffset *= Math.max(0, 1 - dt * 0.8);
    tx = G.playerCar.pos.x; ty = 2.2; tz = G.playerCar.pos.z;
    dist = G.shotCam ? G.shotCam.dist : 12;
    pitch = G.shotCam ? G.shotCam.pitch : 0.3;
  } else {
    tx = G.player.pos.x; ty = 1.7 + G.player.pos.y; tz = G.player.pos.z;
    dist = 8.5; pitch = G.cameraPitch;
  }
  camTarget.set(tx, ty, tz);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  camera.position.set(
    tx - Math.sin(G.cameraYaw) * dist * cp,
    ty + dist * sp,
    tz - Math.cos(G.cameraYaw) * dist * cp
  );
  camera.lookAt(camTarget);
}

// ---------- debug hook (read-only, for the playtest) ----------
window.__solmar = {
  get state() { return G.state; },
  get money() { return G.money; },
  get wanted() { return G.wanted; },
  get health() { return G.player.health; },
  get ammo() { return G.combat.mag; },
  get reserve() { return G.combat.reserve; },
  get drawCalls() { return renderer.info.render.calls; },
  get player() {
    return { x: G.player.pos.x, z: G.player.pos.z, y: G.player.pos.y, heading: G.player.heading, inCar: G.player.inCar, speed: G.player.speed2d };
  },
  get car() {
    const c = G.playerCar;
    return c ? { x: c.pos.x, z: c.pos.z, heading: c.heading, speed: c.speed } : null;
  },
  get mission() {
    return {
      index: G.missions.index,
      name: G.missions.current ? G.missions.current.name : null,
      phase: G.missions.phase,
      target: G.missions.target,
      robbed: [...G.missions.robbed],
    };
  },
  version: 'solmar-city-attempt3',
};

// ---------- main loop ----------
const clock = new THREE.Clock();
let firstFrame = true;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  G.now += dt;
  G.shootWantedCooldown = Math.max(0, G.shootWantedCooldown - dt);
  G.speedWantedCooldown = Math.max(0, G.speedWantedCooldown - dt);

  if (G.state === 'playing') {
    // move
    if (G.playerCar) {
      G.player.mesh.visible = false;
      G.playerCar.drive(dt, input, G.city);
      // speed near cops raises the heat
      if (Math.abs(G.playerCar.speed) > 28 && G.speedWantedCooldown <= 0) {
        for (const pc of G.police.cars) {
          if (dist2(pc.pos.x, pc.pos.z, G.playerCar.pos.x, G.playerCar.pos.z) < 30) {
            addWanted(1); G.speedWantedCooldown = 8;
            G.hud.toast('Speeding past the cops — wanted up!', '');
            break;
          }
        }
      }
    } else {
      G.player.update(dt, input, G.cameraYaw, G.city, G.now);
    }

    // steal prompt
    if (!G.playerCar) {
      const near = nearestStealableCar(4.5);
      G.hud.setPrompt(near ? '<b>E</b> — steal this car' : '');
    } else {
      G.hud.setPrompt('');
    }

    // world systems
    const allCars = [...parkedCars, ...G.traffic.cars.map((t) => t.car)];
    if (G.playerCar) allCars.push(G.playerCar);
    G.traffic.update(dt, G.now, G.player.pos, G.playerCar ? Math.abs(G.playerCar.speed) : G.player.speed2d, allCars);
    G.police.update(dt, G.now, G.wanted, G.player, G.playerCar, (dmg) => G.player.takeDamage(dmg, G.now));
    G.combat.update(dt);
    G.missions.update(dt, G);

    // wanted decay: -1 per 25 s while no police car is close
    if (G.wanted > 0) {
      const px = G.playerCar ? G.playerCar.pos.x : G.player.pos.x;
      const pz = G.playerCar ? G.playerCar.pos.z : G.player.pos.z;
      let seen = false;
      for (const pc of G.police.cars) {
        if (dist2(pc.pos.x, pc.pos.z, px, pz) < 60) { seen = true; break; }
      }
      if (seen) G.wantedDecayTimer = 0;
      else {
        G.wantedDecayTimer += dt;
        if (G.wantedDecayTimer >= 25) { G.wantedDecayTimer = 0; addWanted(-1); }
      }
    }
    if (G.wanted !== G.lastWanted) {
      G.lastWanted = G.wanted;
      G.police.syncToWanted(G.wanted, G.player.pos);
    }

    // audio follows the action
    const speedNorm = G.playerCar ? Math.abs(G.playerCar.speed) / 38 : G.player.speed2d / 9;
    G.audio.setEngine(speedNorm, !G.playerCar);
    G.audio.updateSiren(dt, G.wanted);
    G.audio.updatePad(dt);

    // death → WASTED
    if (G.player.health <= 0) {
      G.state = 'wasted';
      G.hud.showOverlay('wasted');
      G.audio.playBusted();
    }

    G.hud.update(G, dt);
  } else if (G.state === 'menu') {
    // living backdrop behind the start screen
    G.traffic.update(dt, G.now, G.player.pos, 0, [...parkedCars, ...G.traffic.cars.map((t) => t.car)]);
    G.audio.updatePad(dt);
  }

  updateCamera(dt);
  renderer.render(scene, camera);

  if (firstFrame) {
    firstFrame = false;
    if (shotName) applyShot(shotName, G);
  }
}

refreshContinueButton();
frame();
