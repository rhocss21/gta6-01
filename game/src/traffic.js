// Solmar City — ambient life: 10 AI cars looping the roads and 14 pedestrians
// who stroll the sidewalks and flee gunfire and near-misses.
import * as THREE from 'three';
import { makeCarMesh, Car, CAR_COLORS } from './vehicles.js';
import { roadCenters, blockCenters } from './city.js';
import { dist2, pickRandom } from './util.js';

function makePedestrianMesh(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pickRandom(rng, [0xe8e8e8, 0x3f6fb5, 0xc2a23e, 0x7a4a8f, 0x4a9f6b, 0xd86a8a]) });
  const pants = new THREE.MeshLambertMaterial({ color: 0x232830 });
  const skin = new THREE.MeshLambertMaterial({ color: pickRandom(rng, [0xc98d64, 0x8a5a3b, 0xe8b98a]) });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.95, 0.42), shirt);
  body.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 7), skin);
  head.position.y = 1.72;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.28), pants);
  legL.position.set(-0.17, 0.38, 0);
  const legR = legL.clone(); legR.position.x = 0.17;
  g.add(body, head, legL, legR);
  g.userData.legL = legL; g.userData.legR = legR;
  return g;
}

export class Traffic {
  constructor(scene, rng, city) {
    this.scene = scene;
    this.rng = rng;
    this.city = city;
    this.cars = [];
    this.peds = [];
    this.gunfireAt = null; // {x, z, at} — pedestrians flee from the last shot

    // 10 AI cars, each looping the rectangle of roads around one block
    const blocks = [];
    for (const bx of blockCenters()) for (const bz of blockCenters()) blocks.push([bx, bz]);
    for (let i = 0; i < 10; i++) {
      const [bx, bz] = blocks[Math.floor(rng() * blocks.length)];
      const color = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
      const mesh = makeCarMesh(color, false);
      scene.add(mesh);
      const loop = [
        { x: bx - 30, z: bz - 30 }, { x: bx + 30, z: bz - 30 },
        { x: bx + 30, z: bz + 30 }, { x: bx - 30, z: bz + 30 },
      ];
      const car = new Car(mesh, loop[0].x, loop[0].z, 0, { topSpeed: 13 });
      this.cars.push({ car, loop, wp: 1, speed: 8 + rng() * 4, stopped: 0 });
    }

    // 14 pedestrians strolling the sidewalks
    for (let i = 0; i < 14; i++) {
      const mesh = makePedestrianMesh(rng);
      scene.add(mesh);
      const r = roadCenters()[Math.floor(rng() * roadCenters().length)];
      const along = -250 + rng() * 500;
      const side = rng() < 0.5 ? -1 : 1;
      const onVertical = rng() < 0.5;
      const pos = onVertical
        ? { x: r + side * 10.5, z: along }
        : { x: along, z: r + side * 10.5 };
      this.peds.push({
        mesh, pos: new THREE.Vector3(pos.x, 0, pos.z),
        heading: rng() * Math.PI * 2, speed: 1.1 + rng() * 0.8,
        fleeUntil: 0, phase: rng() * 6,
      });
    }
  }

  reportGunfire(x, z, now) { this.gunfireAt = { x, z, at: now }; }

  update(dt, now, playerPos, playerSpeed, allCars) {
    // ---- AI cars: follow their loop, stop for the car ahead ----
    for (const t of this.cars) {
      const target = t.loop[t.wp];
      const d = dist2(t.car.pos.x, t.car.pos.z, target.x, target.z);
      if (d < 6) t.wp = (t.wp + 1) % t.loop.length;
      // stop if another car is close ahead
      let blocked = false;
      for (const other of allCars) {
        if (other === t.car) continue;
        const dd = dist2(t.car.pos.x, t.car.pos.z, other.pos.x, other.pos.z);
        if (dd < 11) {
          const fx = Math.sin(t.car.heading), fz = Math.cos(t.car.heading);
          const dot = (other.pos.x - t.car.pos.x) * fx + (other.pos.z - t.car.pos.z) * fz;
          if (dot > 0) { blocked = true; break; }
        }
      }
      t.stopped = blocked ? t.stopped + dt : 0;
      const want = blocked ? 0 : t.speed;
      t.car.steerToward(dt, t.loop[t.wp].x, t.loop[t.wp].z, want, this.city);
    }

    // ---- pedestrians: stroll, turn at intersections, flee danger ----
    for (const p of this.peds) {
      let fleeing = now < p.fleeUntil;
      if (this.gunfireAt && now - this.gunfireAt.at < 4) {
        if (dist2(p.pos.x, p.pos.z, this.gunfireAt.x, this.gunfireAt.z) < 55) {
          p.fleeUntil = now + 3; fleeing = true;
        }
      }
      if (!fleeing && playerSpeed > 12) {
        if (dist2(p.pos.x, p.pos.z, playerPos.x, playerPos.z) < 9) {
          p.fleeUntil = now + 2.5; fleeing = true;
        }
      }
      if (fleeing) {
        // run away from the threat
        const tx = this.gunfireAt && now - this.gunfireAt.at < 4 ? this.gunfireAt.x : playerPos.x;
        const tz = this.gunfireAt && now - this.gunfireAt.at < 4 ? this.gunfireAt.z : playerPos.z;
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
        const roads = roadCenters();
        let best = null, bestD = 1e9;
        for (const r of roads) {
          const d1 = Math.abs(Math.abs(p.pos.x - (r + 10.5)) - 0);
          const d2 = Math.abs(Math.abs(p.pos.z - (r + 10.5)) - 0);
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
