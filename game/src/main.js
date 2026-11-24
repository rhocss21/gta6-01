// SOLMAR CITY — entry point: wires the city, Jax, cars, traffic, police,
// combat, jobs, HUD, dispatch, dialogue, audio and save together and runs
// the game loop. Golden-hour light is the default; ?shot=night switches to
// neon night.
//
// Story: Jax Marlowe, ex-wheelman, owes fixer Mara Voss $50,000. Five jobs
// stand between him and freedom. All names, places, art and sound are original.
import * as THREE from 'three';
import { makeRng, clamp, flatDist, angleDiff } from './util.js';
import { buildCity } from './city.js';
import { Walker } from './player.js';
import { makeCarMesh, Car, PAINTS, nameForColor } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Weapons } from './combat.js';
import { Story } from './missions.js';
import { Hud } from './hud.js';
import { SoundEngine } from './audio.js';
import { hasSave, saveGame, loadGame, clearSave, applySave } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '7', 10) || 7;
const shotName = params.get('shot') || '';
const rng = makeRng(seed);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

const hemi = new THREE.HemisphereLight(0xffd9a0, 0x7a5a40, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffc27a, 1.9);
sun.position.set(-260, 90, 180); // low in the west: golden hour, long light
scene.add(sun);

// ---------- game state ----------
const G = {
  state: 'menu', // menu | playing | paused | busted | wasted | complete
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
  camOffset: 0, // drag offset added to the chase-cam yaw
  menuOrbit: true,
  menuAngle: 0,
  clockMinutes: 18 * 60 + 47, // golden hour on the HUD clock
  radioStation: 0,
  dialogueOverride: null, // a shot can pin one dialogue line
  shotCam: null, // {dist, pitch} staged-camera override
  shotHoldCar: false, // staged shot: hold the player car still, speed kept
  freezeMissions: false, // staged shot: hold job state for the frame
  targetCar: null, // the car a shot stages as the steal target
  timeOfDay: 'golden',
};

// Two looks, one city: warm golden hour, or neon night.
G.setTimeOfDay = function setTimeOfDay(mode) {
  G.timeOfDay = mode;
  if (mode === 'night') {
    scene.background = new THREE.Color(0x0b1233);
    scene.fog = new THREE.Fog(0x0b1233, 100, 480);
    hemi.color.setHex(0x2a3a66);
    hemi.groundColor.setHex(0x0a0c14);
    hemi.intensity = 0.8;
    sun.color.setHex(0x9db8ff);
    sun.intensity = 0.55;
    sun.position.set(120, 220, -80);
  } else {
    scene.background = new THREE.Color(0xf7a85c);
    scene.fog = new THREE.Fog(0xf2a35e, 120, 520);
    hemi.color.setHex(0xffd9a0);
    hemi.groundColor.setHex(0x7a5a40);
    hemi.intensity = 0.95;
    sun.color.setHex(0xffc27a);
    sun.intensity = 1.9;
    sun.position.set(-260, 90, 180);
  }
};
G.setTimeOfDay('golden');

G.city = buildCity(scene, rng);
G.audio = new SoundEngine();
G.jax = new Walker(scene);
G.guns = new Weapons(scene, G.audio);
G.traffic = new Traffic(scene, rng, G.city);
G.pd = new Police(scene, rng, G.city);
G.hud = new Hud();
G.story = new Story(scene, G.city, {
  onComplete: (m, reward) => {
    G.money += reward;
    G.audio.fanfare();
    G.hud.toast(`JOB DONE: ${m.name} — +$${reward}`, 'gold');
    saveGame(G);
  },
  onToast: (text, kind) => G.hud.toast(text, kind),
  onPickup: () => G.audio.chime(),
  onRobbery: (shopName) => {
    G.money += 150;
    addHeat(1);
    G.audio.chime();
    G.hud.toast(`Robbed ${shopName} — +$150 cash`, 'gold');
  },
  onStoryComplete: () => {
    G.state = 'complete';
    G.hud.showOverlay('complete');
  },
});
G.jax.place(G.city.spawn.x, G.city.spawn.z, G.city.spawn.heading);

// ---------- parked cars ----------
const PARKED_SPOTS = [
  { x: 86, z: 18, h: 0 },
  { x: 86, z: 60, h: 0 },
  { x: 94, z: -30, h: Math.PI },
  { x: 86, z: -80, h: 0 },
  { x: -120, z: -86, h: Math.PI / 2 },
  { x: 60, z: -86, h: Math.PI / 2 },
  { x: 150, z: 94, h: -Math.PI / 2 },
  { x: -150, z: 34, h: Math.PI / 2 },
];
let parkedCars = [];

function parkCar(x, z, heading, color) {
  const mesh = makeCarMesh(color, false);
  scene.add(mesh);
  const car = new Car(mesh, x, z, heading, { color });
  car.owned = false;
  parkedCars.push(car);
  return car;
}

// A staged shot places one named car at an exact spot (the steal target).
G.parkRideAt = function parkRideAt(x, z, heading, color, name) {
  const mesh = makeCarMesh(color, false);
  scene.add(mesh);
  const car = new Car(mesh, x, z, heading, { color, name: name || nameForColor(color) });
  car.owned = false;
  parkedCars.push(car);
  return car;
};

function respawnParkedCars() {
  for (const c of parkedCars) scene.remove(c.mesh);
  parkedCars = [];
  PARKED_SPOTS.forEach((s, i) => {
    parkCar(s.x, s.z, s.h, PAINTS[(i * 3 + 1) % PAINTS.length]);
  });
}
respawnParkedCars();
G.parkRide = parkCar;

function givePlayerCar(x, z, heading, color, name) {
  const mesh = makeCarMesh(color, false);
  scene.add(mesh);
  const car = new Car(mesh, x, z, heading, { isPlayer: true, color, name: name || nameForColor(color) });
  car.owned = true;
  G.playerCar = car;
  G.jax.inCar = true;
  return car;
}
G.givePlayerCar = givePlayerCar;

// ---------- wanted level ----------
function addHeat(n) {
  G.wanted = clamp(G.wanted + n, 0, 5);
  G.wantedDecayTimer = 0;
}
G.addHeat = addHeat;

// ---------- police callbacks ----------
G.pd.onBusted = () => {
  if (G.state !== 'playing') return;
  G.money = Math.floor(G.money * 0.85);
  G.audio.bustedSting();
  G.state = 'busted';
  G.hud.showOverlay('busted');
};
G.pd.onCopKilled = () => {
  addHeat(2);
  G.hud.toast('Cop down — the heat is on!', '');
};
G.guns.onShoot = (x, z, now) => {
  G.traffic.noteShot(x, z, now);
  if (G.shootWantedCooldown <= 0) {
    addHeat(1);
    G.shootWantedCooldown = 3;
  }
};
G.guns.onCopKilled = () => {
  addHeat(2);
  G.hud.toast('Cop down — the heat is on!', '');
};
G.guns.onPedKilled = () => {
  addHeat(1);
};

// ---------- input ----------
const keys = new Set();
let dragging = false;
let lastMX = 0;
let lastMY = 0;
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
  G.audio.unlock();
  keys.add(e.code);
  refreshInput();
  if (e.code === 'Escape') {
    if (G.state === 'playing') pauseGame();
    else if (G.state === 'paused') resumeGame();
  } else if (e.code === 'KeyM') {
    flipMute();
  } else if (e.code === 'KeyR' && G.state === 'playing') {
    if (G.guns.startReload()) G.hud.toast('Reloading…', '');
  } else if (e.code === 'KeyF' && G.state === 'playing' && !G.playerCar) {
    G.guns.punch(G.jax.pos, G.jax.heading, G.pd, G.traffic);
  } else if (e.code === 'KeyE' && G.state === 'playing') {
    if (G.playerCar) leaveCar();
    else stealNearbyCar();
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  refreshInput();
});
window.addEventListener('blur', () => {
  keys.clear();
  refreshInput();
});

const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', (e) => {
  G.audio.unlock();
  if (e.button === 0) {
    if (G.state === 'playing' && !G.playerCar) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const origin = new THREE.Vector3(G.jax.pos.x, 1.5, G.jax.pos.z).addScaledVector(dir, 0.6);
      G.guns.fire(origin, dir, camera, G.pd, G.traffic, G.now);
    }
    dragging = true;
    lastMX = e.clientX;
    lastMY = e.clientY;
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMX;
  const dy = e.clientY - lastMY;
  lastMX = e.clientX;
  lastMY = e.clientY;
  G.cameraYaw -= dx * 0.005;
  G.cameraPitch = clamp(G.cameraPitch + dy * 0.003, 0.08, 1.1);
  if (G.playerCar) G.camOffset -= dx * 0.005;
});
window.addEventListener('pointerup', () => {
  dragging = false;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- car enter / exit ----------
function nearestStealableCar(maxD) {
  let best = null;
  let bestD = maxD;
  const px = G.jax.pos.x;
  const pz = G.jax.pos.z;
  for (const c of parkedCars) {
    const d = flatDist(px, pz, c.pos.x, c.pos.z);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  for (const t of G.traffic.cars) {
    const d = flatDist(px, pz, t.car.pos.x, t.car.pos.z);
    if (d < bestD) {
      best = t.car;
      bestD = d;
    }
  }
  return best;
}

function stealNearbyCar() {
  const car = nearestStealableCar(4.5);
  if (!car) return;
  // pull it out of the parked / traffic lists — it is the player's now
  const pi = parkedCars.indexOf(car);
  if (pi >= 0) parkedCars.splice(pi, 1);
  const ti = G.traffic.cars.findIndex((t) => t.car === car);
  if (ti >= 0) G.traffic.cars.splice(ti, 1);
  car.isPlayer = true;
  G.playerCar = car;
  G.jax.inCar = true;
  G.audio.click();
  if (!car.owned) {
    car.owned = true;
    addHeat(1);
    G.hud.toast('Car stolen — the cops noticed!', '');
    G.story.noteStolen();
  } else {
    G.hud.toast('Back behind the wheel.', '');
  }
}

function leaveCar() {
  const car = G.playerCar;
  if (!car) return;
  const h = car.heading;
  const px = car.pos.x - Math.cos(h) * 2.6;
  const pz = car.pos.z + Math.sin(h) * 2.6;
  G.jax.inCar = false;
  G.jax.place(px, pz, h);
  G.playerCar = null;
  car.isPlayer = false;
  car.speed = 0;
  if (!parkedCars.includes(car)) parkedCars.push(car);
}

// ---------- menus / flow ----------
function startPlay() {
  G.state = 'playing';
  G.menuOrbit = false;
  G.hud.setHudVisible(true);
  G.hud.hideOverlays();
  G.audio.unlock();
}

function newRun() {
  clearSave();
  resetRun();
  startPlay();
  G.hud.toast('New game — Mara is waiting. Five jobs. Go.', 'gold');
}

function continueRun() {
  const d = loadGame();
  resetRun();
  if (d) {
    applySave(G, d);
    G.hud.toast('Save loaded — welcome back to Solmar City.', 'gold');
  }
  startPlay();
}

function resetRun() {
  if (G.playerCar) {
    scene.remove(G.playerCar.mesh);
    G.playerCar = null;
  }
  respawnParkedCars();
  G.jax.inCar = false;
  G.jax.health = 100;
  G.jax.armor = 0;
  G.jax.lastHurtAt = -99;
  G.jax.place(G.city.spawn.x, G.city.spawn.z, G.city.spawn.heading);
  G.guns.mag = 12;
  G.guns.reserve = 60;
  G.guns.reloadTimer = 0;
  G.money = 0;
  G.wanted = 0;
  G.wantedDecayTimer = 0;
  G.story.finished = [];
  G.pd.syncToWanted(0, G.jax.pos);
  G.story.startJob(0);
  G.cameraYaw = Math.PI;
  G.cameraPitch = 0.35;
  G.camOffset = 0;
}

function pauseGame() {
  G.state = 'paused';
  G.hud.showOverlay('pause');
}

function resumeGame() {
  G.state = 'playing';
  G.hud.hideOverlays();
}

function flipMute() {
  G.audio.setMuted(!G.audio.muted);
  const b = document.getElementById('btn-mute');
  if (b) b.textContent = 'MUTE: ' + (G.audio.muted ? 'ON' : 'OFF');
}

function toMenu() {
  G.state = 'menu';
  G.menuOrbit = true;
  if (G.playerCar) {
    scene.remove(G.playerCar.mesh);
    G.playerCar = null;
  }
  G.jax.inCar = false;
  G.jax.place(G.city.spawn.x, G.city.spawn.z, G.city.spawn.heading);
  G.pd.syncToWanted(0, G.jax.pos);
  G.hud.setHudVisible(false);
  G.hud.showOverlay('menu');
  refreshContinue();
}

function refreshContinue() {
  document.getElementById('btn-continue').classList.toggle('hidden', !hasSave());
}

function afterBusted() {
  G.jax.health = 100;
  G.jax.armor = 25;
  G.wanted = 0;
  G.jax.inCar = false;
  if (G.playerCar) {
    scene.remove(G.playerCar.mesh);
    G.playerCar = null;
  }
  G.jax.place(G.city.stationPos.x, G.city.stationPos.z, 0);
  G.pd.syncToWanted(0, G.jax.pos);
  startPlay();
}

function afterWasted() {
  G.money = Math.floor(G.money * 0.9);
  G.jax.health = 100;
  G.jax.armor = 0;
  G.wanted = 0;
  G.jax.inCar = false;
  if (G.playerCar) {
    scene.remove(G.playerCar.mesh);
    G.playerCar = null;
  }
  G.jax.place(G.city.hospitalPos.x, G.city.hospitalPos.z, 0);
  G.pd.syncToWanted(0, G.jax.pos);
  startPlay();
}

document.getElementById('btn-new').addEventListener('click', () => {
  G.audio.unlock();
  newRun();
});
document.getElementById('btn-continue').addEventListener('click', () => {
  G.audio.unlock();
  continueRun();
});
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-save').addEventListener('click', () => {
  if (saveGame(G)) G.hud.toast('Game saved.', 'gold');
  else G.hud.toast('Save failed.', '');
});
document.getElementById('btn-restart').addEventListener('click', () => {
  resetRun();
  startPlay();
});
document.getElementById('btn-mute').addEventListener('click', flipMute);
document.getElementById('btn-quit').addEventListener('click', toMenu);
document.getElementById('btn-respawn-busted').addEventListener('click', afterBusted);
document.getElementById('btn-respawn-wasted').addEventListener('click', afterWasted);
document.getElementById('btn-free-roam').addEventListener('click', () => {
  G.state = 'playing';
  G.hud.hideOverlays();
});
document.getElementById('btn-menu-complete').addEventListener('click', toMenu);

// ---------- camera ----------
const camTarget = new THREE.Vector3();

function moveCamera(dt) {
  if (G.state === 'menu') {
    G.menuAngle += dt * 0.045;
    const r = 250;
    camera.position.set(Math.cos(G.menuAngle) * r, 130, Math.sin(G.menuAngle) * r);
    camera.lookAt(0, 10, 0);
    return;
  }
  let tx;
  let ty;
  let tz;
  let dist;
  let pitch;
  if (G.playerCar) {
    // chase cam: ease the yaw toward the car's heading plus any drag offset
    const want = G.playerCar.heading + G.camOffset;
    G.cameraYaw += angleDiff(want, G.cameraYaw) * Math.min(1, dt * 4);
    G.camOffset *= Math.max(0, 1 - dt * 0.8);
    tx = G.playerCar.pos.x;
    ty = 2.2;
    tz = G.playerCar.pos.z;
    dist = G.shotCam ? G.shotCam.dist : 12;
    pitch = G.shotCam ? G.shotCam.pitch : 0.3;
  } else {
    tx = G.jax.pos.x;
    ty = 1.7 + G.jax.pos.y;
    tz = G.jax.pos.z;
    dist = G.shotCam ? G.shotCam.dist : 8.5;
    pitch = G.shotCam ? G.shotCam.pitch : G.cameraPitch;
  }
  camTarget.set(tx, ty, tz);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
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
  get health() { return G.jax.health; },
  get armor() { return G.jax.armor; },
  get ammo() { return G.guns.mag; },
  get reserve() { return G.guns.reserve; },
  get drawCalls() { return renderer.info.render.calls; },
  get timeOfDay() { return G.timeOfDay; },
  get input() { return { forward: input.forward, back: input.back, left: input.left, right: input.right }; },
  get keysSize() { return keys.size; },
  get player() {
    return { x: G.jax.pos.x, z: G.jax.pos.z, y: G.jax.pos.y, heading: G.jax.heading, inCar: G.jax.inCar, speed: G.jax.speed2d };
  },
  get car() {
    const c = G.playerCar;
    return c ? { x: c.pos.x, z: c.pos.z, heading: c.heading, speed: c.speed, name: c.name, condition: c.condition } : null;
  },
  get mission() {
    return {
      index: G.story.index,
      name: G.story.current ? G.story.current.name : null,
      step: G.story.step,
      target: G.story.target,
      robbed: [...G.story.robbed],
      debtPaid: G.story.debtPaid,
      debtAfterJob: G.story.debtAfterJob,
    };
  },
  version: 'solmar-city-attempt11',
};

// ---------- main loop ----------
const clock = new THREE.Clock();
let firstFrame = true;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.1);
  G.now += dt;
  G.clockMinutes += dt * 0.5; // one game minute every two real seconds
  G.shootWantedCooldown = Math.max(0, G.shootWantedCooldown - dt);
  G.speedWantedCooldown = Math.max(0, G.speedWantedCooldown - dt);

  if (G.state === 'playing') {
    // move
    if (G.playerCar) {
      G.jax.mesh.visible = false;
      // a staged shot holds the car still and keeps its staged speed
      if (!G.shotHoldCar) G.playerCar.drive(dt, input, G.city);
      else G.playerCar.sync();
      // speed near cops raises the heat
      if (Math.abs(G.playerCar.speed) > 28 && G.speedWantedCooldown <= 0) {
        for (const pc of G.pd.cars) {
          if (flatDist(pc.pos.x, pc.pos.z, G.playerCar.pos.x, G.playerCar.pos.z) < 30) {
            addHeat(1);
            G.speedWantedCooldown = 8;
            G.hud.toast('Speeding past the cops — wanted up!', '');
            break;
          }
        }
      }
    } else {
      G.jax.step(dt, input, G.cameraYaw, G.city, G.now);
    }

    // steal prompt
    if (!G.playerCar) {
      const near = nearestStealableCar(4.5);
      G.hud.setPrompt(near ? `<b>E</b> — steal the ${near.name}` : '');
    } else {
      G.hud.setPrompt('');
    }

    // world systems
    const allCars = [...parkedCars, ...G.traffic.cars.map((t) => t.car)];
    if (G.playerCar) allCars.push(G.playerCar);
    G.traffic.step(dt, G.now, G.jax.pos, G.playerCar ? Math.abs(G.playerCar.speed) : G.jax.speed2d, allCars);
    G.pd.step(dt, G.now, G.wanted, G.jax, G.playerCar, (dmg) => G.jax.takeHit(dmg, G.now));
    G.guns.step(dt);
    G.story.update(dt, G);

    // wanted decay: -1 per 25 s while no police car is close
    if (G.wanted > 0) {
      const px = G.playerCar ? G.playerCar.pos.x : G.jax.pos.x;
      const pz = G.playerCar ? G.playerCar.pos.z : G.jax.pos.z;
      let seen = false;
      for (const pc of G.pd.cars) {
        if (flatDist(pc.pos.x, pc.pos.z, px, pz) < 60) {
          seen = true;
          break;
        }
      }
      if (seen) G.wantedDecayTimer = 0;
      else {
        G.wantedDecayTimer += dt;
        if (G.wantedDecayTimer >= 25) {
          G.wantedDecayTimer = 0;
          addHeat(-1);
        }
      }
    }
    if (G.wanted !== G.lastWanted) {
      G.lastWanted = G.wanted;
      G.pd.syncToWanted(G.wanted, G.jax.pos);
    }

    // audio follows the action
    const speedNorm = G.playerCar ? Math.abs(G.playerCar.speed) / 38 : G.jax.speed2d / 9;
    G.audio.setEngine(speedNorm, !G.playerCar);
    G.audio.updateSiren(dt, G.wanted);
    G.audio.updatePad(dt);

    // death → WASTED
    if (G.jax.health <= 0) {
      G.state = 'wasted';
      G.hud.showOverlay('wasted');
      G.audio.bustedSting();
    }

    G.hud.refresh(G, dt);
  } else if (G.state === 'menu') {
    // living backdrop behind the start screen
    G.traffic.step(dt, G.now, G.jax.pos, 0, [...parkedCars, ...G.traffic.cars.map((t) => t.car)]);
    G.audio.updatePad(dt);
  }

  moveCamera(dt);
  renderer.render(scene, camera);

  if (firstFrame) {
    firstFrame = false;
    if (shotName) stageShot(shotName, G);
  }
}

refreshContinue();
tick();
