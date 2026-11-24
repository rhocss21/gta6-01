// SOLMAR CITY — ambient life: 10 AI cars looping the roads and 16
// pedestrians strolling the sidewalks, fleeing gunfire and near-misses.
// Staged shots can place extra pedestrians and cars at exact spots.
import * as THREE from 'three';
import { makeCarMesh, Car, PAINTS } from './vehicles.js';
import { streetLines, blockSpots } from './city.js';
import { flatDist, pickOne } from './util.js';

function makePedMesh(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pickOne(rng, [0xe8e8e8, 0x3f6fb5, 0xc2a23e, 0x7a4a8f, 0x4a9f6b, 0xd86a8a]) });
  const pants = new THREE.MeshLambertMaterial({ color: 0x232830 });
  const skin = new THREE.MeshLambertMaterial({ color: pickOne(rng, [0xc98d64, 0x8a5a3b, 0xe8b98a]) });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.95, 0.42), shirt);
  body.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 7), skin);
  head.position.y = 1.72;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.28), pants);
  legL.position.set(-0.17, 0.38, 0);
  const legR = legL.clone();
  legR.position.x = 0.17;
  g.add(body, head, legL, legR);
  g.userData.legL = legL;
  g.userData.legR = legR;
  return g;
}

export class Traffic {
  constructor(scene, rng, city) {
    this.scene = scene;
    this.rng = rng;
    this.city = city;
    this.cars = [];
    this.peds = [];
    this.lastShot = null; // {x, z, at} — pedestrians flee the last shot

    // 10 AI cars, each looping the rectangle of roads around one block
    const blocks = [];
    for (const bx of blockSpots()) {
      for (const bz of blockSpots()) blocks.push([bx, bz]);
    }
    for (let i = 0; i < 10; i++) {
      const [bx, bz] = blocks[Math.floor(rng() * blocks.length)];
      const color = PAINTS[Math.floor(rng() * PAINTS.length)];
      const mesh = makeCarMesh(color, false);
      scene.add(mesh);
      const loop = [
        { x: bx - 30, z: bz - 30 },
        { x: bx + 30, z: bz - 30 },
        { x: bx + 30, z: bz + 30 },
        { x: bx - 30, z: bz + 30 },
      ];
      const car = new Car(mesh, loop[0].x, loop[0].z, 0, { topSpeed: 13, color });
      this.cars.push({ car, loop, wp: 1, speed: 8 + rng() * 4, stopped: 0 });
    }

    // 16 pedestrians strolling the sidewalks
    for (let i = 0; i < 16; i++) {
      const mesh = makePedMesh(rng);
      scene.add(mesh);
      const r = streetLines()[Math.floor(rng() * streetLines().length)];
      const along = -250 + rng() * 500;
      const side = rng() < 0.5 ? -1 : 1;
      const onVertical = rng() < 0.5;
      const pos = onVertical
        ? { x: r + side * 10.5, z: along }
        : { x: along, z: r + side * 10.5 };
      this.peds.push({
        mesh,
        pos: new THREE.Vector3(pos.x, 0, pos.z),
        heading: rng() * Math.PI * 2,
        speed: 1.1 + rng() * 0.8,
        fleeUntil: 0,
        phase: rng() * 6,
        hold: false,
      });
    }
  }

  noteShot(x, z, now) {
    this.lastShot = { x, z, at: now };
  }

  // Staged-shot helpers: place a pedestrian / a looping car at an exact spot.
  addPedestrian(x, z, heading) {
    const mesh = makePedMesh(this.rng);
    this.scene.add(mesh);
    const ped = {
      mesh,
      pos: new THREE.Vector3(x, 0, z),
      heading: heading === undefined ? 0 : heading,
      speed: 1.4,
      fleeUntil: 0,
      phase: this.rng() * 6,
      hold: true,
    };
    mesh.position.copy(ped.pos);
    mesh.rotation.y = ped.heading;
    this.peds.push(ped);
    return ped;
  }

  addCar(x, z, heading, color) {
    const mesh = makeCarMesh(color || PAINTS[2], false);
    this.scene.add(mesh);
    const car = new Car(mesh, x, z, heading, { topSpeed: 13, color: color || PAINTS[2] });
    car.hold = true;
    this.cars.push({ car, loop: [{ x, z }], wp: 0, speed: 0, stopped: 0 });
    return car;
  }

  step(dt, now, playerPos, playerSpeed, allCars) {
    // ---- AI cars: follow their loop, stop for the car ahead ----
    for (const t of this.cars) {
      if (t.car.hold) {
        t.car.sync();
        continue;
      }
      const target = t.loop[t.wp];
      const d = flatDist(t.car.pos.x, t.car.pos.z, target.x, target.z);
      if (d < 6) t.wp = (t.wp + 1) % t.loop.length;
      // stop if another car is close ahead
      let blocked = false;
      for (const other of allCars) {
        if (other === t.car) continue;
        const dd = flatDist(t.car.pos.x, t.car.pos.z, other.pos.x, other.pos.z);
        if (dd < 11) {
          const fx = Math.sin(t.car.heading);
          const fz = Math.cos(t.car.heading);
          const dot = (other.pos.x - t.car.pos.x) * fx + (other.pos.z - t.car.pos.z) * fz;
          if (dot > 0) {
            blocked = true;
            break;
          }
        }
      }
      t.stopped = blocked ? t.stopped + dt : 0;
      const want = blocked ? 0 : t.speed;
      t.car.chase(dt, t.loop[t.wp].x, t.loop[t.wp].z, want, this.city);
    }

    // ---- pedestrians: stroll, turn at intersections, flee danger ----
    for (const p of this.peds) {
      if (p.hold) {
        // staged pedestrians stand (or shuffle) in place for the screenshot
        p.phase += dt * 2;
        const sw = Math.sin(p.phase) * 0.08;
        p.mesh.userData.legL.rotation.x = sw;
        p.mesh.userData.legR.rotation.x = -sw;
        p.mesh.position.copy(p.pos);
        p.mesh.rotation.y = p.heading;
        continue;
      }
      let fleeing = now < p.fleeUntil;
      const shotFresh = this.lastShot && now - this.lastShot.at < 4;
      if (shotFresh && flatDist(p.pos.x, p.pos.z, this.lastShot.x, this.lastShot.z) < 55) {
        p.fleeUntil = now + 3;
        fleeing = true;
      }
      if (!fleeing && playerSpeed > 12) {
        if (flatDist(p.pos.x, p.pos.z, playerPos.x, playerPos.z) < 9) {
          p.fleeUntil = now + 2.5;
          fleeing = true;
        }
      }
      if (fleeing) {
        // run away from the threat
        const tx = shotFresh ? this.lastShot.x : playerPos.x;
        const tz = shotFresh ? this.lastShot.z : playerPos.z;
        p.heading = Math.atan2(p.pos.x - tx, p.pos.z - tz);
        p.pos.x += Math.sin(p.heading) * 5 * dt;
        p.pos.z += Math.cos(p.heading) * 5 * dt;
      } else {
        // stroll along the sidewalk; turn at random at intersections
        p.pos.x += Math.sin(p.heading) * p.speed * dt;
        p.pos.z += Math.cos(p.heading) * p.speed * dt;
        if (Math.abs(p.pos.x) > 262 || Math.abs(p.pos.z) > 262) p.heading += Math.PI;
        if (this.rng() < dt * 0.05) p.heading += (this.rng() - 0.5) * 1.2;
        // stay near a sidewalk line: nudge back toward the nearest road offset
        const roads = streetLines();
        let best = null;
        let bestD = 1e9;
        for (const r of roads) {
          const d1 = Math.abs(p.pos.x - (r + 10.5));
          const d2 = Math.abs(p.pos.z - (r + 10.5));
          if (d1 < bestD) { bestD = d1; best = { axis: 'x', v: r + 10.5 }; }
          if (d2 < bestD) { bestD = d2; best = { axis: 'z', v: r + 10.5 }; }
        }
        if (best && bestD < 6) {
          if (best.axis === 'x') p.pos.x += (best.v - p.pos.x) * Math.min(1, dt * 0.5);
          else p.pos.z += (best.v - p.pos.z) * Math.min(1, dt * 0.5);
        }
      }
      p.pos.x = Math.max(-268, Math.min(268, p.pos.x));
      p.pos.z = Math.max(-268, Math.min(268, p.pos.z));
      p.phase += dt * (fleeing ? 11 : 5);
      const swing = Math.sin(p.phase) * 0.45;
      p.mesh.userData.legL.rotation.x = swing;
      p.mesh.userData.legR.rotation.x = -swing;
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.y = p.heading;
    }
  }
}
