// SOLMAR CITY — the wanted system: 0–5 stars, police cars that chase and ram,
// foot cops that chase and arrest, wanted decay when the player hides, and
// the Busted / Wasted consequences.
import * as THREE from 'three';
import { clamp, rand } from './util.js';
import { makeCarMesh, linkCar } from './vehicles.js';
import { resolveCircle } from './city.js';

const MAX_COPS = 3;
const MAX_FOOT_COPS = 2;

export function initPolice(G) {
  G.police = {
    wanted: 0,
    hiddenTimer: 0,
    bustTimer: 0,
    sirenWasOn: false,
  };
  G.policeCars = [];
  G.footCops = [];
}

export function addWanted(G, n) {
  const p = G.police;
  p.wanted = clamp(p.wanted + n, 0, 5);
  p.hiddenTimer = 0;
  G.hud.updateStars();
  if (p.wanted > 0) G.audio.setSiren(true);
}

function makeCopMesh() {
  const g = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1c2f4a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5e });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.0, 0.45), navy);
  torso.position.y = 1.25;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), skin);
  head.position.y = 2.0;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 10), navy);
  cap.position.y = 2.22;
  g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.85, 0.36), navy);
  legL.position.set(-0.22, 0.42, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.22;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.85, 0.3), navy);
  armL.position.set(-0.58, 1.3, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.58;
  g.add(armR);
  g.userData = { legL, legR };
  return g;
}

function spawnPoliceCar(G, near) {
  const mesh = makeCarMesh(0xf0f0f0, 'cop');
  const a = rand(0, Math.PI * 2);
  const x = near.x + Math.sin(a) * 45;
  const z = near.z + Math.cos(a) * 45;
  const fixed = resolveCircle(G, x, z, 2.2);
  mesh.position.set(fixed.x, 0, fixed.z);
  G.scene.add(mesh);
  const car = { mesh, kind: 'cop', speed: 0, parked: false, driver: 'police', maxSpeed: 30, hitCooldown: 0 };
  mesh.userData.car = car;
  linkCar(car);
  G.policeCars.push(car);
  return car;
}

export function spawnFootCop(G, near) {
  const mesh = makeCopMesh();
  const a = rand(0, Math.PI * 2);
  mesh.position.set(near.x + Math.sin(a) * 25, 0, near.z + Math.cos(a) * 25);
  G.scene.add(mesh);
  const cop = { mesh, speed: 5.2, arrestTimer: 0, walkPhase: 0 };
  G.footCops.push(cop);
  return cop;
}

function despawnPolice(G) {
  for (const car of G.policeCars) G.scene.remove(car.mesh);
  for (const cop of G.footCops) G.scene.remove(cop.mesh);
  G.policeCars = [];
  G.footCops = [];
}

export function updatePolice(G, dt) {
  const p = G.police;
  const playerPos = G.inCar && G.playerCar ? G.playerCar.mesh.position : G.playerMesh.position;

  // Match the response to the wanted level.
  const wantCars = p.wanted === 0 ? 0 : Math.min(MAX_COPS, Math.ceil(p.wanted / 2));
  const wantFoot = p.wanted >= 2 ? Math.min(MAX_FOOT_COPS, p.wanted - 1) : 0;
  while (G.policeCars.length < wantCars) spawnPoliceCar(G, playerPos);
  while (G.footCops.length < wantFoot) spawnFootCop(G, playerPos);
  if (p.wanted === 0 && (G.policeCars.length || G.footCops.length)) {
    despawnPolice(G);
    G.audio.setSiren(false);
  }

  // Police cars chase and ram. They are a touch slower than a good getaway
  // car, so escaping is possible.
  for (const car of G.policeCars) {
    const dx = playerPos.x - car.mesh.position.x;
    const dz = playerPos.z - car.mesh.position.z;
    const d = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    // Steer toward the player, limited turn rate.
    let dy = yaw - car.mesh.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    car.mesh.rotation.y += clamp(dy, -2.4 * dt, 2.4 * dt);
    const targetSpeed = d > 6 ? 24 + p.wanted * 1.5 : 10;
    car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);
    const nx = car.mesh.position.x + Math.sin(car.mesh.rotation.y) * car.speed * dt;
    const nz = car.mesh.position.z + Math.cos(car.mesh.rotation.y) * car.speed * dt;
    const fixed = resolveCircle(G, nx, nz, 2.1);
    car.mesh.position.x = fixed.x;
    car.mesh.position.z = fixed.z;
    for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 1.2;
    // Ram: damage the player (car or on foot) on contact, with a cooldown.
    car.hitCooldown -= dt;
    if (d < 4.5 && car.hitCooldown <= 0) {
      car.hitCooldown = 1.2;
      G.combat.damagePlayer(G, G.inCar ? 4 : 10);
      G.hud.flashDamage();
      G.audio.punch();
      if (G.inCar && G.playerCar) G.playerCar.speed *= 0.7;
    }
  }

  // Foot cops run the player down and arrest (bust timer at close range).
  for (const cop of G.footCops) {
    const dx = playerPos.x - cop.mesh.position.x;
    const dz = playerPos.z - cop.mesh.position.z;
    const d = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    cop.mesh.rotation.y = yaw;
    const speed = G.inCar ? cop.speed * 1.15 : cop.speed;
    // In screenshot staging the cop holds at 7 units: menacing, visible, and
    // never overlapping the player in the frame.
    const holdDist = G.staging ? 7 : 0;
    const stepLen = Math.min(speed * dt, Math.max(0, d - holdDist));
    cop.mesh.position.x += Math.sin(yaw) * stepLen;
    cop.mesh.position.z += Math.cos(yaw) * stepLen;
    cop.walkPhase += dt * 10;
    cop.mesh.userData.legL.rotation.x = Math.sin(cop.walkPhase) * 0.5;
    cop.mesh.userData.legR.rotation.x = -Math.sin(cop.walkPhase) * 0.5;
    if (d < 2.4 && !G.inCar) {
      cop.arrestTimer += dt;
      G.hud.showBustProgress(cop.arrestTimer / 2.5);
      if (cop.arrestTimer >= 2.5 && !G.staging) {
        G.hud.showBustProgress(0);
        getBusted(G);
        return;
      }
    } else {
      cop.arrestTimer = Math.max(0, cop.arrestTimer - dt * 2);
      if (cop === G.footCops[0]) G.hud.showBustProgress(0);
    }
  }

  // Wanted decay: no police unit within 45 units for 6 seconds = one star gone.
  if (p.wanted > 0) {
    let nearest = Infinity;
    for (const car of G.policeCars) {
      nearest = Math.min(nearest, Math.hypot(car.mesh.position.x - playerPos.x, car.mesh.position.z - playerPos.z));
    }
    for (const cop of G.footCops) {
      nearest = Math.min(nearest, Math.hypot(cop.mesh.position.x - playerPos.x, cop.mesh.position.z - playerPos.z));
    }
    if (nearest > 45) {
      p.hiddenTimer += dt;
      if (p.hiddenTimer >= 6) {
        p.hiddenTimer = 0;
        p.wanted -= 1;
        G.hud.updateStars();
        G.hud.toast(p.wanted === 0 ? 'You lost them. The heat is off.' : `Heat dropping — ${p.wanted} star${p.wanted > 1 ? 's' : ''} left.`);
        if (p.wanted === 0) G.audio.setSiren(false);
      }
    } else {
      p.hiddenTimer = 0;
    }
  }
}

export function getBusted(G) {
  if (G.state !== 'playing') return;
  G.state = 'busted';
  G.cash = Math.max(0, G.cash - 200);
  G.audio.busted();
  G.audio.setSiren(false);
  G.audio.setEngine(0, false);
  G.hud.showScreen('busted');
}

export function getWasted(G) {
  if (G.state !== 'playing') return;
  G.state = 'wasted';
  G.audio.busted();
  G.audio.setSiren(false);
  G.audio.setEngine(0, false);
  G.hud.showScreen('wasted');
}

// Back on the street: fresh spawn, clean slate, keep cash and mission.
export function respawn(G) {
  if (G.inCar) {
    G.playerCar = null;
    G.inCar = false;
  }
  G.playerMesh.visible = true;
  G.health = 100;
  G.combat.ammo = G.combat.magSize;
  G.police.wanted = 0;
  G.police.hiddenTimer = 0;
  G.police.bustTimer = 0;
  despawnPolice(G);
  G.playerMesh.position.set(0, 0, 134);
  G.playerMesh.rotation.y = 0;
  G.player.yaw = 0;
  G.camYaw = 0;
  G.camPitch = 0.32;
  G.state = 'playing';
  G.hud.showScreen(null);
  G.hud.toast('Back on the street. Stay sharp, Jax.');
}
