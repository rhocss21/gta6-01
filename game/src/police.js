// Solmar City — the wanted system: police cars that chase and ram, foot cops
// who can arrest the player, and a circling helicopter at high wanted levels.
import * as THREE from 'three';
import { makeCarMesh, Car, POLICE_COLOR } from './vehicles.js';
import { roadCenters } from './city.js';
import { dist2, clamp } from './util.js';

export const WANTED_RANKS = ['ROOKIE', 'WHEELMAN', 'GETAWAY DRIVER', 'OUTFIT', 'KINGPIN', 'LEGEND'];

function makeCopMesh() {
  const g = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1d2f5b });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.5), navy);
  body.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), skin);
  head.position.y = 1.85;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.14, 10), navy);
  cap.position.y = 2.05;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, 0.34), navy);
  legL.position.set(-0.22, 0.43, 0);
  const legR = legL.clone(); legR.position.x = 0.22;
  g.add(body, head, cap, legL, legR);
  g.userData.legL = legL; g.userData.legR = legR;
  return g;
}

function makeHeliMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 4.6), new THREE.MeshLambertMaterial({ color: 0x1d2f5b }));
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.4), new THREE.MeshLambertMaterial({ color: 0x1d2f5b }));
  tail.position.set(0, 0.2, -3.6);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x111318 }));
  rotor.position.y = 0.85;
  const spot = new THREE.Mesh(new THREE.ConeGeometry(1.6, 8, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide }));
  spot.position.y = -4.5; spot.rotation.x = Math.PI;
  g.add(body, tail, rotor, spot);
  g.userData.rotor = rotor;
  return g;
}

export class Police {
  constructor(scene, rng, city) {
    this.scene = scene;
    this.rng = rng;
    this.city = city;
    this.cars = [];   // Car instances
    this.cops = [];   // {mesh, pos, heading, hp, arrestTimer, phase}
    this.heli = null;
    this.heliAngle = 0;
    this.onBusted = null;   // callback set by main.js
    this.onCopKilled = null;
  }

  wantedCarCount(wanted) { return Math.min(wanted, 5); }
  wantedCopCount(wanted) { return wanted >= 3 ? 2 : 0; }

  spawnPointNear(px, pz, minD, maxD) {
    for (let tries = 0; tries < 12; tries++) {
      const r = roadCenters()[Math.floor(this.rng() * roadCenters().length)];
      const along = -260 + this.rng() * 520;
      const p = this.rng() < 0.5 ? { x: r, z: along } : { x: along, z: r };
      const d = dist2(px, pz, p.x, p.z);
      if (d >= minD && d <= maxD) return p;
    }
    return { x: px + 70, z: pz };
  }

  // Place one foot cop at an exact spot (used by the staged mission screenshot).
  spawnFootCopAt(x, z) {
    const mesh = makeCopMesh();
    this.scene.add(mesh);
    const cop = { mesh, pos: new THREE.Vector3(x, 0, z), heading: 0, hp: 100, arrestTimer: 0, phase: 0 };
    this.cops.push(cop);
    return cop;
  }

  syncToWanted(wanted, playerPos) {
    // police cars
    const wantCars = this.wantedCarCount(wanted);
    while (this.cars.length < wantCars) {
      const p = this.spawnPointNear(playerPos.x, playerPos.z, 55, 110);
      const mesh = makeCarMesh(POLICE_COLOR, true);
      this.scene.add(mesh);
      this.cars.push(new Car(mesh, p.x, p.z, 0, { topSpeed: 32, accel: 17, isPolice: true }));
    }
    while (this.cars.length > wantCars) {
      const c = this.cars.pop();
      this.scene.remove(c.mesh);
    }
    // foot cops
    const wantCops = this.wantedCopCount(wanted);
    while (this.cops.length < wantCops) {
      const p = this.spawnPointNear(playerPos.x, playerPos.z, 25, 45);
      const mesh = makeCopMesh();
      this.scene.add(mesh);
      this.cops.push({ mesh, pos: new THREE.Vector3(p.x, 0, p.z), heading: 0, hp: 100, arrestTimer: 0, phase: 0 });
    }
    while (this.cops.length > wantCops) {
      const c = this.cops.pop();
      this.scene.remove(c.mesh);
    }
    // helicopter
    if (wanted >= 4 && !this.heli) {
      this.heli = makeHeliMesh();
      this.scene.add(this.heli);
    } else if (wanted < 4 && this.heli) {
      this.scene.remove(this.heli);
      this.heli = null;
    }
  }

  update(dt, now, wanted, player, playerCar, onRam) {
    // ---- chase cars (a car with hold=true stays parked: used by the staged cover shot) ----
    for (const car of this.cars) {
      if (!car.hold) {
        const tx = playerCar ? playerCar.pos.x : player.pos.x;
        const tz = playerCar ? playerCar.pos.z : player.pos.z;
        // aim slightly ahead of a moving target
        const lead = playerCar ? 0.6 : 0;
        const lx = tx + (playerCar ? Math.sin(playerCar.heading) * playerCar.speed * lead : 0);
        const lz = tz + (playerCar ? Math.cos(playerCar.heading) * playerCar.speed * lead : 0);
        car.steerToward(dt, lx, lz, 30, this.city);
        // ram: damage on impact
        const d = dist2(car.pos.x, car.pos.z, tx, tz);
        if (d < 4.2 && car.ramCooldown <= 0) {
          car.ramCooldown = 1.0;
          if (onRam) onRam(8);
          // bounce the police car off a little so it does not stick
          car.speed = Math.max(4, car.speed * 0.4);
        }
      }
      // flashing light bar
      if (car.mesh.userData.lightBar) {
        const on = Math.floor(now * 6) % 2 === 0;
        car.mesh.userData.lightBar[0].material.color.setHex(on ? 0x2244ff : 0x112266);
        car.mesh.userData.lightBar[1].material.color.setHex(on ? 0x661111 : 0xff2222);
      }
    }

    // ---- foot cops: run the player down, arrest on contact ----
    for (const cop of this.cops) {
      const d = dist2(cop.pos.x, cop.pos.z, player.pos.x, player.pos.z);
      if (player.inCar) {
        // run at the car, stop at 4 m — they cannot catch a car
        if (d > 4) {
          cop.heading = Math.atan2(player.pos.x - cop.pos.x, player.pos.z - cop.pos.z);
          cop.pos.x += Math.sin(cop.heading) * 7 * dt;
          cop.pos.z += Math.cos(cop.heading) * 7 * dt;
        }
        cop.arrestTimer = 0;
      } else {
        cop.heading = Math.atan2(player.pos.x - cop.pos.x, player.pos.z - cop.pos.z);
        cop.pos.x += Math.sin(cop.heading) * 7 * dt;
        cop.pos.z += Math.cos(cop.heading) * 7 * dt;
        if (d < 2) {
          cop.arrestTimer += dt;
          if (cop.arrestTimer >= 2.5 && this.onBusted) this.onBusted();
        } else {
          cop.arrestTimer = Math.max(0, cop.arrestTimer - dt * 2);
        }
      }
      this.city.resolveCircle(cop.pos, 0.7);
      cop.phase += dt * 9;
      const swing = Math.sin(cop.phase) * 0.5;
      cop.mesh.userData.legL.rotation.x = swing;
      cop.mesh.userData.legR.rotation.x = -swing;
      cop.mesh.position.copy(cop.pos);
      cop.mesh.rotation.y = cop.heading;
    }

    // ---- helicopter: circle above the player, spotlight down ----
    if (this.heli) {
      this.heliAngle += dt * 0.5;
      this.heli.position.set(
        player.pos.x + Math.cos(this.heliAngle) * 26,
        42,
        player.pos.z + Math.sin(this.heliAngle) * 26
      );
      this.heli.rotation.y = -this.heliAngle;
      this.heli.userData.rotor.rotation.y += dt * 22;
    }
  }

  // Damage the nearest foot cop within range of a point; returns the cop hit or null.
  damageCopAt(x, z, range, dmg) {
    let best = null, bestD = 1e9;
    for (const cop of this.cops) {
      const d = dist2(x, z, cop.pos.x, cop.pos.z);
      if (d < range && d < bestD) { best = cop; bestD = d; }
    }
    if (!best) return null;
    best.hp -= dmg;
    if (best.hp <= 0) {
      this.scene.remove(best.mesh);
      this.cops.splice(this.cops.indexOf(best), 1);
      if (this.onCopKilled) this.onCopKilled();
    }
    return best;
  }
}
