// SOLMAR CITY — living streets: civilian cars looping the road grid and
// pedestrians on the sidewalks who flee from speeding cars and gunfire.
import * as THREE from 'three';
import { pick, rand, randi } from './util.js';
import { makeCarMesh, linkCar } from './vehicles.js';
import { resolveCircle } from './city.js';

const TRAFFIC_COLORS = [0x9aa5ad, 0x4a6a8a, 0xb07840, 0x6a8a4a, 0x8a4a6a, 0xc2b280];
const SHIRT_COLORS = [0xe8e8e8, 0x3a7bd5, 0xe86a5a, 0x7bc23a, 0xf2c14e, 0x9a5ac2, 0x2a9d8f];

function makePedMesh(shirtColor) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: pick([0xc98a5e, 0x8a5a3a, 0xe8b88a, 0x6a4a30]) });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2e3a4a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.95, 0.42), shirt);
  torso.position.y = 1.2;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), skin);
  head.position.y = 1.95;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.34), pants);
  legL.position.set(-0.2, 0.4, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.2;
  g.add(legR);
  g.userData = { legL, legR };
  return g;
}

// A rectangular loop around one city block, on the road centre lines.
function blockLoop(cx, cz) {
  const r = 20;
  return [
    { x: cx - r, z: cz - r }, { x: cx + r, z: cz - r },
    { x: cx + r, z: cz + r }, { x: cx - r, z: cz + r },
  ];
}

export function initTraffic(G) {
  G.trafficCars = [];
  const blocks = [];
  for (let bx = -160; bx <= 160; bx += 40) {
    for (let bz = -160; bz <= 160; bz += 40) blocks.push([bx, bz]);
  }
  for (let i = 0; i < 10; i++) {
    const [bx, bz] = blocks[i * 7 % blocks.length];
    const route = blockLoop(bx, bz);
    const start = route[i % 4];
    const mesh = makeCarMesh(TRAFFIC_COLORS[i % TRAFFIC_COLORS.length], 'sedan');
    mesh.position.set(start.x, 0, start.z);
    G.scene.add(mesh);
    const car = {
      mesh, kind: 'sedan', speed: 8, parked: false, driver: 'traffic',
      route, wp: (i + 1) % 4, maxSpeed: 9,
    };
    mesh.userData.car = car;
    linkCar(car);
    G.trafficCars.push(car);
  }

  G.peds = [];
  for (let i = 0; i < 14; i++) {
    const mesh = makePedMesh(SHIRT_COLORS[i % SHIRT_COLORS.length]);
    const x = rand(-180, 180);
    const z = rand(-180, 180);
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    G.peds.push({
      mesh, speed: 1.6, target: null, fleeUntil: 0, dead: false,
      walkPhase: rand(0, Math.PI * 2), state: 'walk',
    });
  }
}

function pedTarget(G, ped) {
  // New sidewalk target near the ped's current block.
  const bx = Math.round(ped.mesh.position.x / 40) * 40;
  const bz = Math.round(ped.mesh.position.z / 40) * 40;
  return { x: bx + rand(-16, 16), z: bz + rand(-16, 16) };
}

export function scarePeds(G, x, z, radius) {
  for (const ped of G.peds) {
    if (ped.dead) continue;
    const d = Math.hypot(ped.mesh.position.x - x, ped.mesh.position.z - z);
    if (d < radius) ped.fleeUntil = G.time + 3;
  }
}

export function updateTraffic(G, dt) {
  const playerPos = G.inCar && G.playerCar ? G.playerCar.mesh.position : G.playerMesh.position;
  const playerSpeed = G.inCar && G.playerCar ? Math.abs(G.playerCar.speed) : 0;

  for (const car of G.trafficCars) {
    const wp = car.route[car.wp];
    const dx = wp.x - car.mesh.position.x;
    const dz = wp.z - car.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 3) {
      car.wp = (car.wp + 1) % car.route.length;
      continue;
    }
    // Stop-and-go: brake if another car is right ahead.
    let blocked = false;
    for (const other of [...G.trafficCars, ...G.cars]) {
      if (other === car) continue;
      const odx = other.mesh.position.x - car.mesh.position.x;
      const odz = other.mesh.position.z - car.mesh.position.z;
      const od = Math.hypot(odx, odz);
      if (od < 7 && odx * dx + odz * dz > 0) { blocked = true; break; }
    }
    const targetSpeed = blocked ? 0 : 8;
    car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 2);
    const yaw = Math.atan2(dx, dz);
    car.mesh.rotation.y = yaw;
    car.mesh.position.x += Math.sin(yaw) * car.speed * dt;
    car.mesh.position.z += Math.cos(yaw) * car.speed * dt;
    for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 1.2;
  }

  for (const ped of G.peds) {
    if (ped.dead) continue;
    const m = ped.mesh;
    const fleeing = G.time < ped.fleeUntil;
    let tx, tz, speed;
    if (fleeing) {
      // Run away from the player.
      const dx = m.position.x - playerPos.x;
      const dz = m.position.z - playerPos.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = m.position.x + (dx / d) * 20;
      tz = m.position.z + (dz / d) * 20;
      speed = 4.2;
    } else {
      if (!ped.target || Math.hypot(ped.target.x - m.position.x, ped.target.z - m.position.z) < 2) {
        ped.target = pedTarget(G, ped);
      }
      tx = ped.target.x;
      tz = ped.target.z;
      speed = ped.speed;
    }
    const dx = tx - m.position.x;
    const dz = tz - m.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.1) {
      const yaw = Math.atan2(dx, dz);
      m.rotation.y = yaw;
      const nx = m.position.x + Math.sin(yaw) * speed * dt;
      const nz = m.position.z + Math.cos(yaw) * speed * dt;
      const fixed = resolveCircle(G, nx, nz, 0.7);
      m.position.x = fixed.x;
      m.position.z = fixed.z;
      ped.walkPhase += dt * (fleeing ? 14 : 8);
      const swing = Math.sin(ped.walkPhase) * 0.5;
      m.userData.legL.rotation.x = swing;
      m.userData.legR.rotation.x = -swing;
    }
    // Flee from a speeding player car nearby even without a gunshot.
    if (playerSpeed > 10) {
      const pd = Math.hypot(m.position.x - playerPos.x, m.position.z - playerPos.z);
      if (pd < 8) ped.fleeUntil = G.time + 2;
    }
  }
}
