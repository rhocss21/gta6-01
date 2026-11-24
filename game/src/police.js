// SOLMAR CITY — the wanted system: police cars that chase and ram, foot
// cops who can arrest the player on contact, and a helicopter with a
// spotlight at 4+ stars. Unit callsigns feed the dispatch panel.
import * as THREE from 'three';
import { makeCarMesh, Car, PD_PAINT } from './vehicles.js';
import { streetLines } from './city.js';
import { flatDist, clamp } from './util.js';

export const RANK_TITLES = ['ROOKIE', 'WHEELMAN', 'GETAWAY DRIVER', 'OUTFIT', 'KINGPIN', 'LEGEND'];

// Callsigns the Solmar PD dispatch panel shows, in spawn order.
export const CALLSIGNS = ['TARPON 38', 'BULWARK 2', 'KITE 7', 'REEF 12', 'SURGE 5', 'AIR ONE'];

function makeOfficerMesh() {
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
  const legR = legL.clone();
  legR.position.x = 0.22;
  g.add(body, head, cap, legL, legR);
  g.userData.legL = legL;
  g.userData.legR = legR;
  return g;
}

function makeHeliMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 4.6), new THREE.MeshLambertMaterial({ color: 0x1d2f5b }));
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.4), new THREE.MeshLambertMaterial({ color: 0x1d2f5b }));
  tail.position.set(0, 0.2, -3.6);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x111318 }));
  rotor.position.y = 0.85;
  // the spotlight cone, aimed straight down at the street — long enough
  // to reach the ground, with the lit pool it throws on the asphalt
  const spot = new THREE.Mesh(new THREE.ConeGeometry(3.5, 40, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.14, side: THREE.DoubleSide }));
  spot.position.y = -20;
  spot.rotation.x = Math.PI;
  // the lit pool the spotlight throws on the ground
  const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 20),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.3 }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = -41.5;
  g.add(body, tail, rotor, spot, pool);
  g.userData.rotor = rotor;
  return g;
}

export class Police {
  constructor(scene, rng, city) {
    this.scene = scene;
    this.rng = rng;
    this.city = city;
    this.cars = []; // Car instances (interceptors)
    this.cops = []; // {mesh, pos, heading, hp, arrestTimer, phase, hold}
    this.heli = null;
    this.heliAngle = 0;
    this.heliHold = false;
    this.onBusted = null; // callback set by main.js
    this.onCopKilled = null;
  }

  carsForWanted(wanted) {
    return Math.min(wanted, 5);
  }

  copsForWanted(wanted) {
    return wanted >= 3 ? 2 : 0;
  }

  spawnNear(px, pz, minD, maxD) {
    for (let tries = 0; tries < 12; tries++) {
      const r = streetLines()[Math.floor(this.rng() * streetLines().length)];
      const along = -260 + this.rng() * 520;
      const p = this.rng() < 0.5 ? { x: r, z: along } : { x: along, z: r };
      const d = flatDist(px, pz, p.x, p.z);
      if (d >= minD && d <= maxD) return p;
    }
    return { x: px + 70, z: pz };
  }

  // Place one interceptor at an exact spot (staged shots). Returns the Car.
  addInterceptor(x, z, heading, speed) {
    const mesh = makeCarMesh(PD_PAINT, true);
    this.scene.add(mesh);
    const car = new Car(mesh, x, z, heading, { topSpeed: 32, accel: 17, isPolice: true, color: PD_PAINT, name: 'Interceptor' });
    car.speed = speed || 0;
    car.hold = true;
    car.sync();
    this.cars.push(car);
    return car;
  }

  // Place one foot cop at an exact spot (staged shots).
  addFootCop(x, z, hold) {
    const mesh = makeOfficerMesh();
    this.scene.add(mesh);
    const cop = { mesh, pos: new THREE.Vector3(x, 0, z), heading: 0, hp: 100, arrestTimer: 0, phase: 0, hold: !!hold };
    mesh.position.copy(cop.pos);
    this.cops.push(cop);
    return cop;
  }

  // Bring the helicopter in at an exact spot above the player (staged shots).
  addHeli(x, z, height) {
    if (!this.heli) {
      this.heli = makeHeliMesh();
      this.scene.add(this.heli);
    }
    this.heli.position.set(x, height || 42, z);
    return this.heli;
  }

  syncToWanted(wanted, playerPos) {
    // interceptors
    const wantCars = this.carsForWanted(wanted);
    while (this.cars.length < wantCars) {
      const p = this.spawnNear(playerPos.x, playerPos.z, 55, 110);
      const mesh = makeCarMesh(PD_PAINT, true);
      this.scene.add(mesh);
      this.cars.push(new Car(mesh, p.x, p.z, 0, { topSpeed: 32, accel: 17, isPolice: true, color: PD_PAINT, name: 'Interceptor' }));
    }
    while (this.cars.length > wantCars) {
      const c = this.cars.pop();
      this.scene.remove(c.mesh);
    }
    // foot cops
    const wantCops = this.copsForWanted(wanted);
    while (this.cops.length < wantCops) {
      const p = this.spawnNear(playerPos.x, playerPos.z, 25, 45);
      const mesh = makeOfficerMesh();
      this.scene.add(mesh);
      this.cops.push({ mesh, pos: new THREE.Vector3(p.x, 0, p.z), heading: 0, hp: 100, arrestTimer: 0, phase: 0, hold: false });
    }
    while (this.cops.length > wantCops) {
      const c = this.cops.pop();
      this.scene.remove(c.mesh);
    }
    // helicopter at 4+ stars
    if (wanted >= 4 && !this.heli) {
      this.heli = makeHeliMesh();
      this.scene.add(this.heli);
    } else if (wanted < 4 && this.heli) {
      this.scene.remove(this.heli);
      this.heli = null;
    }
  }

  step(dt, now, wanted, player, playerCar, onRam) {
    // ---- interceptors chase; a held car stays parked for the staged shot ----
    for (const car of this.cars) {
      if (!car.hold) {
        const tx = playerCar ? playerCar.pos.x : player.pos.x;
        const tz = playerCar ? playerCar.pos.z : player.pos.z;
        // aim slightly ahead of a moving target
        const lead = playerCar ? 0.6 : 0;
        const lx = tx + (playerCar ? Math.sin(playerCar.heading) * playerCar.speed * lead : 0);
        const lz = tz + (playerCar ? Math.cos(playerCar.heading) * playerCar.speed * lead : 0);
        car.chase(dt, lx, lz, 30, this.city);
        // ram: damage on impact, then bounce off a little
        const d = flatDist(car.pos.x, car.pos.z, tx, tz);
        if (d < 4.2 && car.ramCooldown <= 0) {
          car.ramCooldown = 1.0;
          if (onRam) onRam(8);
          car.speed = Math.max(4, car.speed * 0.4);
          if (playerCar) playerCar.condition = Math.max(20, playerCar.condition - 4);
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
      if (!cop.hold) {
        const d = flatDist(cop.pos.x, cop.pos.z, player.pos.x, player.pos.z);
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
        this.city.pushOut(cop.pos, 0.7);
        cop.phase += dt * 9;
        const swing = Math.sin(cop.phase) * 0.5;
        cop.mesh.userData.legL.rotation.x = swing;
        cop.mesh.userData.legR.rotation.x = -swing;
      }
      cop.mesh.position.copy(cop.pos);
      cop.mesh.rotation.y = cop.heading;
    }

    // ---- helicopter: circle above the player, spotlight down ----
    // (a staged shot can hold it in place with heliHold)
    if (this.heli) {
      if (!this.heliHold) {
        this.heliAngle += dt * 0.5;
        this.heli.position.set(
          player.pos.x + Math.cos(this.heliAngle) * 26,
          42,
          player.pos.z + Math.sin(this.heliAngle) * 26
        );
        this.heli.rotation.y = -this.heliAngle;
      }
      this.heli.userData.rotor.rotation.y += dt * 22;
    }
  }

  // Damage the nearest foot cop within range of a point; returns the cop hit or null.
  hurtCopNear(x, z, range, dmg) {
    let best = null;
    let bestD = 1e9;
    for (const cop of this.cops) {
      const d = flatDist(x, z, cop.pos.x, cop.pos.z);
      if (d < range && d < bestD) {
        best = cop;
        bestD = d;
      }
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
