// SOLMAR CITY — vehicles: car models, parked stealable cars, arcade driving
// physics, enter / exit / steal. Cars are simple box-built groups so the whole
// fleet costs a handful of meshes each.
import * as THREE from 'three';
import { clamp, pick } from './util.js';
import { resolveCircle } from './city.js';

const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe8c832, 0x3aa655, 0xd8d8d8, 0x8a5ac2, 0xe07b28, 0x222831];

// Roadside parking spots (on a street edge, facing along the street).
const PARK_SPOTS = [
  { x: 10, z: 146, yaw: Math.PI / 2 },
  { x: -30, z: 146, yaw: Math.PI / 2 },
  { x: 60, z: 106, yaw: -Math.PI / 2 },
  { x: -90, z: 26, yaw: Math.PI / 2 },
  { x: 30, z: -54, yaw: -Math.PI / 2 },
  { x: 110, z: 66, yaw: Math.PI / 2 },
  { x: -130, z: -106, yaw: -Math.PI / 2 },
  { x: 150, z: 146, yaw: Math.PI / 2 },
  { x: -10, z: -134, yaw: Math.PI / 2 },
  { x: 90, z: -14, yaw: -Math.PI / 2 },
];

export function makeCarMesh(color, kind) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x18242e });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 4.4), bodyMat);
  body.position.y = 0.65;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 2.2), glassMat);
  cabin.position.set(0, 1.3, -0.2);
  g.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  const wheels = [];
  for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    g.add(w);
    wheels.push(w);
  }
  // Headlight bar + taillight bar (one mesh each, not four).
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.1), lightMat);
  hl.position.set(0, 0.7, 2.22);
  g.add(hl);
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.1), tailMat);
  tl.position.set(0, 0.7, -2.22);
  g.add(tl);
  if (kind === 'cop') {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }),
    );
    bar.position.set(0, 1.75, -0.2);
    g.add(bar);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.25, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffe135 }),
    );
    sign.position.set(0, 1.75, -0.2);
    g.add(sign);
  }
  g.userData.wheels = wheels;
  return g;
}

function newCar(G, color, kind, x, z, yaw) {
  const mesh = makeCarMesh(color, kind);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = yaw;
  G.scene.add(mesh);
  const car = {
    mesh,
    kind,
    color,
    speed: 0,
    steer: 0,
    parked: kind !== 'cop',
    maxSpeed: kind === 'sport' ? 34 : kind === 'cop' ? 30 : 26,
    hitCooldown: 0,
  };
  mesh.userData.car = car;
  linkCar(car);
  return car;
}

// A car object also answers as its mesh for outside readers (playtest/debug):
// .position is the mesh position, .userData.speed mirrors the car speed.
export function linkCar(car) {
  car.position = car.mesh.position;
  car.userData = car.mesh.userData;
  car.mesh.userData.speed = car.speed || 0;
  Object.defineProperty(car, 'speed', {
    get() { return car.mesh.userData.speed; },
    set(v) { car.mesh.userData.speed = v; },
    configurable: true,
  });
}

export function spawnParkedCars(G) {
  G.cars = [];
  const kinds = ['sedan', 'sedan', 'taxi', 'sport', 'sedan', 'taxi', 'sport', 'sedan', 'sedan', 'taxi'];
  PARK_SPOTS.forEach((s, i) => {
    const car = newCar(G, CAR_COLORS[i % CAR_COLORS.length], kinds[i], s.x, s.z, s.yaw);
    G.cars.push(car);
  });
}

// Nearest drivable car within range of a point (parked cars + traffic cars).
export function nearestCar(G, x, z, range) {
  let best = null;
  let bestD = range;
  for (const car of [...G.cars, ...G.trafficCars]) {
    if (car.kind === 'cop') continue;
    const d = Math.hypot(car.mesh.position.x - x, car.mesh.position.z - z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

export function enterCar(G, car) {
  G.playerCar = car;
  G.inCar = true;
  car.parked = false;
  car.driver = 'player';
  G.playerMesh.visible = false;
  G.audio.setEngine(0, true);
}

export function exitCar(G) {
  if (!G.playerCar) return;
  const car = G.playerCar;
  car.driver = null;
  const yaw = car.mesh.rotation.y;
  // Step out on the driver's side.
  const px = car.mesh.position.x + Math.cos(yaw) * 2.6;
  const pz = car.mesh.position.z - Math.sin(yaw) * 2.6;
  const fixed = resolveCircle(G, px, pz, 0.9);
  G.playerMesh.position.set(fixed.x, 0, fixed.z);
  G.playerMesh.visible = true;
  G.playerCar = null;
  G.inCar = false;
  G.audio.setEngine(0, false);
}

// Stealing is a crime: +1 star, a shout, a siren chirp.
export function stealCar(G, car) {
  enterCar(G, car);
  G.police.addWanted(G, 1);
  G.hud.toast('You stole the car! The owner is calling the cops.', 'bad');
  G.audio.sirenChirp();
}

// Arcade driving: accelerate / brake / reverse, speed-scaled steering,
// handbrake slide, building collision, car-to-car shove.
export function updateDriving(G, dt) {
  const car = G.playerCar;
  if (!car) return;
  const k = G.keys;
  // In the cover-shot staging the car drives itself so the chase is live.
  const fwd = k.has('KeyW') || k.has('ArrowUp') || G.staging === 'cover';
  const back = k.has('KeyS') || k.has('ArrowDown');
  const left = k.has('KeyA') || k.has('ArrowLeft');
  const right = k.has('KeyD') || k.has('ArrowRight');
  const hand = k.has('Space');

  if (fwd) car.speed += 13 * dt;
  if (back) car.speed -= car.speed > 0.5 ? 22 * dt : 9 * dt;
  if (!fwd && !back) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
  if (hand) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed = clamp(car.speed, -10, car.maxSpeed);
  // Cover-shot staging cruises at a moderate speed so the pursuing police
  // hold a visible gap behind the player instead of running into the camera.
  if (G.staging === 'cover') car.speed = Math.min(car.speed, 12);

  const steerInput = (left ? 1 : 0) - (right ? 1 : 0);
  const steerAuthority = clamp(Math.abs(car.speed) / 10, 0, 1);
  car.steer = lerpSteer(car.steer, steerInput, dt);
  const yawRate = car.steer * 1.9 * steerAuthority * (hand ? 1.5 : 1) * Math.sign(car.speed || 1);
  car.mesh.rotation.y += yawRate * dt;

  const yaw = car.mesh.rotation.y;
  const nx = car.mesh.position.x + Math.sin(yaw) * car.speed * dt;
  const nz = car.mesh.position.z + Math.cos(yaw) * car.speed * dt;
  const fixed = resolveCircle(G, nx, nz, 2.1);
  if (Math.abs(fixed.x - nx) > 0.01 || Math.abs(fixed.z - nz) > 0.01) {
    car.speed *= 0.45; // bumped a building: lose speed, keep going
    G.audio.punch();
  }
  car.mesh.position.x = fixed.x;
  car.mesh.position.z = fixed.z;

  // Shove other cars out of the way.
  for (const other of [...G.cars, ...G.trafficCars, ...G.policeCars]) {
    if (other === car) continue;
    const dx = other.mesh.position.x - car.mesh.position.x;
    const dz = other.mesh.position.z - car.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 4.2 && d > 0.01) {
      const push = (4.2 - d) / 2;
      other.mesh.position.x += (dx / d) * push;
      other.mesh.position.z += (dz / d) * push;
      if (Math.abs(car.speed) > 8) {
        other.speed = (other.speed || 0) + Math.sign(car.speed) * 4;
      }
    }
  }

  // Spin the wheels to match speed.
  for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 1.2;
  G.audio.setEngine(Math.abs(car.speed) / car.maxSpeed, true);
}

function lerpSteer(cur, target, dt) {
  const rate = target === 0 ? 6 : 10;
  return clamp(cur + clamp(target - cur, -rate * dt, rate * dt), -1, 1);
}
