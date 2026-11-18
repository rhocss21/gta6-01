// Solmar City — cars: mesh factory plus arcade driving physics (player + AI share it).
import * as THREE from 'three';
import { clamp, angleDiff } from './util.js';

export const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xd8a928, 0x3f8f5a, 0x8a8f96, 0x5b2e7a, 0xd8d8d8, 0x22262e, 0x2ea8a0, 0xc26a2e];
export const POLICE_COLOR = 0x14181f;

export function makeCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x0e1a24 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x0c0d0f });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.55;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.55, 2.1), glass);
  cabin.position.set(0, 1.12, -0.25);
  g.add(body, cabin);
  if (isPolice) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    stripe.position.y = 0.72;
    g.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), new THREE.MeshLambertMaterial({ color: 0x2244ff }));
    bar.position.set(0, 1.48, -0.25);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), new THREE.MeshLambertMaterial({ color: 0xff2222 }));
    bar2.position.set(0, 1.48, 0.25);
    g.add(bar, bar2);
    g.userData.lightBar = [bar, bar2];
  } else {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.1, 0.7), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    stripe.position.set(0, 0.62, 1.4);
    g.add(stripe);
  }
  // headlights + taillights
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tl = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  for (const sx of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), hl);
    h.position.set(sx, 0.6, 2.22); g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), tl);
    t.position.set(sx, 0.6, -2.22); g.add(t);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, tyre);
    w.position.set(wx, 0.38, wz);
    g.add(w); wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}

export class Car {
  constructor(mesh, x, z, heading, opts = {}) {
    this.mesh = mesh;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.topSpeed = opts.topSpeed || 38;
    this.accel = opts.accel || 14;
    this.isPolice = !!opts.isPolice;
    this.isPlayer = !!opts.isPlayer;
    this.ramCooldown = 0;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }

  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  // Arcade drive: W/S accel + brake/reverse, A/D steering, Space handbrake.
  drive(dt, input, city) {
    this.ramCooldown = Math.max(0, this.ramCooldown - dt);
    const handbrake = input.handbrake;
    if (input.forward) this.speed += this.accel * dt * (this.speed < 0 ? 2.2 : 1);
    if (input.back) {
      if (this.speed > 0.6) this.speed -= 26 * dt;          // brake
      else this.speed -= this.accel * 0.7 * dt;              // reverse
    }
    if (!input.forward && !input.back) this.speed -= this.speed * 0.55 * dt; // coast drag
    if (handbrake) this.speed -= this.speed * 1.1 * dt;
    this.speed = clamp(this.speed, -10, this.topSpeed);
    if (Math.abs(this.speed) < 0.05 && !input.forward && !input.back) this.speed = 0;

    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const steerMax = 0.55 * (1 - Math.min(Math.abs(this.speed) / this.topSpeed, 1) * 0.55);
    this.steer += (steerTarget * steerMax - this.steer) * Math.min(1, dt * 9);
    const grip = handbrake ? 1.7 : 1;
    this.heading += this.steer * clamp(this.speed, -25, 25) * 0.16 * grip * dt;
    const f = this.forward();
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    this.pos.x = clamp(this.pos.x, -305, 305);
    this.pos.z = clamp(this.pos.z, -305, 312);
    city.resolveCircle(this.pos, 2.2);
    this.syncMesh();
  }

  // Simple pursuit steering toward a point, used by police and traffic.
  steerToward(dt, tx, tz, targetSpeed, city) {
    const desired = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    const diff = angleDiff(desired, this.heading);
    this.steer = clamp(diff * 1.4, -0.55, 0.55);
    this.speed += ((targetSpeed - this.speed) * Math.min(1, dt * 1.2));
    this.heading += this.steer * clamp(this.speed, 0, 25) * 0.16 * dt;
    const f = this.forward();
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    this.pos.x = clamp(this.pos.x, -305, 305);
    this.pos.z = clamp(this.pos.z, -305, 312);
    city.resolveCircle(this.pos, 2.2);
    this.ramCooldown = Math.max(0, this.ramCooldown - dt);
    this.syncMesh();
  }

  syncMesh() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    const spin = this.speed * 0.016;
    for (const w of this.mesh.userData.wheels || []) w.rotation.x += spin;
  }
}
