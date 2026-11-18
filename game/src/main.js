// SOLMAR CITY — orchestration: renderer, input, menus, game loop, and the
// window.__solmar debug handle the playtest scripts use.
import * as THREE from 'three';
import { clamp } from './util.js';
import { buildCity } from './city.js';
import { SolmarAudio } from './audio.js';
import { makePlayerMesh, spawnPlayer, updatePlayer, updateCamera } from './player.js';
import * as vehicles from './vehicles.js';
import * as traffic from './traffic.js';
import * as police from './police.js';
import * as combat from './combat.js';
import * as missions from './missions.js';
import { initHUD, updateHUD } from './hud.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { applyShotStaging } from './shots.js';

const G = {
  state: 'menu',
  time: 0,
  cash: 0,
  health: 100,
  inCar: false,
  playerCar: null,
  staging: null,
  keys: new Set(),
  camYaw: 0,
  camPitch: 0.32,
  menuOrbit: 0,
};

// --- Renderer / scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: false }); // no MSAA: SwiftShader software rendering
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('game').appendChild(renderer.domElement);

G.renderer = renderer;
G.scene = new THREE.Scene();
G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
G.camera.position.set(0, 60, 140);
G.clock = new THREE.Clock();
G.audio = new SolmarAudio();

// Cross-module API: every module reaches the others through these handles.
G.vehicles = vehicles;
G.traffic = traffic;
G.police = police;
G.combat = combat;
G.missions = missions;
G.saveGame = () => saveGame(G);

// --- World ------------------------------------------------------------------
buildCity(G);
G.playerMesh = makePlayerMesh();
G.scene.add(G.playerMesh);
vehicles.spawnParkedCars(G);
traffic.initTraffic(G);
police.initPolice(G);
combat.initCombat(G);
missions.initMissions(G);
initHUD(G);
spawnPlayer(G, 0, 134);

// Attach the raw module functions onto the sub-objects the other modules call.
G.police.addWanted = police.addWanted;
G.police.getWasted = police.getWasted;
G.police.getBusted = police.getBusted;
G.police.respawn = police.respawn;
G.police.spawnFootCop = police.spawnFootCop;
G.combat.damagePlayer = combat.damagePlayer;
G.combat.shoot = combat.shoot;
G.combat.punch = combat.punch;
G.combat.reload = combat.reload;
G.missions.currentObjective = missions.currentObjective;
G.missions.jumpTo = missions.jumpToMission;
G.missions.onCarEntered = missions.onCarEntered;
G.missions.startMissionStep = missions.startMissionStep;

// Pre-compile every shader up front: without this, SwiftShader (and any
// software renderer) compiles programs lazily as objects enter the frame,
// which stalls the first seconds of play at ~1 fps.
renderer.compile(G.scene, G.camera);
function resetRun() {
  G.cash = 0;
  G.health = 100;
  G.inCar = false;
  G.playerCar = null;
  G.combat.ammo = G.combat.magSize;
  G.combat.reloading = false;
  G.police.wanted = 0;
  G.police.hiddenTimer = 0;
  missions.initMissions(G);
  G.missions.currentObjective = missions.currentObjective;
  G.missions.jumpTo = missions.jumpToMission;
  G.missions.onCarEntered = missions.onCarEntered;
  G.missions.startMissionStep = missions.startMissionStep;
  spawnPlayer(G, 0, 134);
}

function startGame(fromSave = false) {
  resetRun();
  if (fromSave) {
    const data = loadGame();
    if (data) {
      G.cash = data.cash;
      G.health = data.health ?? 100;
      G.missions.index = Math.min(data.missionIndex ?? 0, G.missions.list.length - 1);
      G.missions.step = data.missionStep ?? 0;
      missions.startMissionStep(G);
    }
  }
  G.state = 'playing';
  G.hud.showScreen(null);
  G.audio.unlock();
  G.audio.click();
  if (!fromSave) G.hud.toast('Job 1: Hot Wheels — steal a car on Palm Row.');
}
G.startGame = startGame;

function quitToMenu() {
  G.state = 'menu';
  G.audio.setEngine(0, false);
  G.audio.setSiren(false);
  G.hud.showScreen('menu');
  document.getElementById('btn-continue').classList.toggle('hidden', !hasSave());
}

document.getElementById('btn-new').addEventListener('click', () => startGame(false));
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));
document.getElementById('btn-resume').addEventListener('click', () => {
  G.state = 'playing';
  G.hud.showScreen(null);
});
document.getElementById('btn-quit-menu').addEventListener('click', quitToMenu);
document.getElementById('btn-busted-retry').addEventListener('click', () => police.respawn(G));
document.getElementById('btn-wasted-retry').addEventListener('click', () => police.respawn(G));
document.getElementById('btn-continue').classList.toggle('hidden', !hasSave());

// --- Input ------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (G.state === 'playing') {
      G.state = 'paused';
      G.hud.showScreen('pause');
    } else if (G.state === 'paused') {
      G.state = 'playing';
      G.hud.showScreen(null);
    }
    return;
  }
  if (e.code === 'KeyM' && !e.repeat) {
    G.audio.setMuted(!G.audio.muted);
    G.hud.toast(G.audio.muted ? 'Sound muted (M to unmute).' : 'Sound on.');
    return;
  }
  G.keys.add(e.code);
  if (e.repeat) return;
  if (G.state !== 'playing') return;
  if (e.code === 'KeyE') {
    if (G.inCar) {
      vehicles.exitCar(G);
    } else {
      const p = G.playerMesh.position;
      const car = vehicles.nearestCar(G, p.x, p.z, 4.5);
      if (car) {
        // Stealing a moving traffic car takes it out of the traffic flow.
        const ti = G.trafficCars.indexOf(car);
        if (ti >= 0) G.trafficCars.splice(ti, 1);
        vehicles.stealCar(G, car);
        missions.onCarEntered(G);
      }
    }
  }
  if (e.code === 'KeyF') combat.punch(G);
  if (e.code === 'KeyR') combat.reload(G);
});
window.addEventListener('keyup', (e) => G.keys.delete(e.code));

let dragging = false;
let lastX = 0;
let lastY = 0;
renderer.domElement.addEventListener('mousedown', (e) => {
  if (G.state === 'playing' && !G.inCar) combat.shoot(G);
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  try {
    const p = renderer.domElement.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => {});
  } catch (err) { /* pointer lock unavailable — drag orbit still works */ }
});
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (G.state !== 'playing') return;
  let dx = 0;
  let dy = 0;
  if (document.pointerLockElement === renderer.domElement) {
    dx = e.movementX;
    dy = e.movementY;
  } else if (dragging) {
    dx = e.clientX - lastX;
    dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
  } else {
    return;
  }
  G.camYaw -= dx * 0.0042;
  G.camPitch = clamp(G.camPitch + dy * 0.003, -0.15, 0.85);
});

window.addEventListener('resize', () => {
  G.camera.aspect = window.innerWidth / window.innerHeight;
  G.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Main loop --------------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(G.clock.getDelta(), 0.2); // 0.2 keeps the game responsive on slow software renderers (SwiftShader)

  if (G.state === 'playing') {
    G.time += dt;
    if (G.inCar) vehicles.updateDriving(G, dt);
    else updatePlayer(G, dt);
    traffic.updateTraffic(G, dt);
    police.updatePolice(G, dt);
    missions.updateMissions(G, dt);
    combat.updateCombat(G, dt);
    updateCamera(G, dt);
    updateHUD(G);
    updatePrompt(G);
  } else if (G.state === 'menu') {
    // Slow cinematic orbit over the city behind the start screen.
    G.menuOrbit += dt * 0.045;
    const r = 150;
    G.camera.position.set(Math.sin(G.menuOrbit) * r, 70, Math.cos(G.menuOrbit) * r);
    G.camera.lookAt(0, 8, 0);
    traffic.updateTraffic(G, dt);
  } else {
    // Paused / busted / wasted: frozen scene, still rendered.
    renderer.render(G.scene, G.camera);
    return;
  }
  renderer.render(G.scene, G.camera);
}

function updatePrompt(G) {
  if (G.state !== 'playing') return;
  if (G.hudBustFrac > 0) return; // the bust warning owns the prompt line
  if (G.inCar) {
    const slow = !G.playerCar || Math.abs(G.playerCar.speed) < 3;
    G.hud.setPrompt(slow ? '<b>E</b> — exit car' : null);
    return;
  }
  const p = G.playerMesh.position;
  const car = vehicles.nearestCar(G, p.x, p.z, 4.5);
  if (car) {
    G.hud.setPrompt(car.parked ? '<b>E</b> — steal this car' : '<b>E</b> — get in the car');
  } else {
    G.hud.setPrompt(null);
  }
}

// --- Boot -------------------------------------------------------------------
const params = new URLSearchParams(window.location.search);
applyShotStaging(G, params.get('shot'));

// Debug / playtest handle (used by the scripted playtest, not by the game).
window.__solmar = G;

animate();
