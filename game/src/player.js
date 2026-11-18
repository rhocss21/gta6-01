// Solmar City — Jax Marlowe on foot: third-person walker with jump, sprint and punch.
import * as THREE from 'three';
import { clamp } from './util.js';

export class Player {
  constructor(scene) {
    this.pos = new THREE.Vector3(84, 0, 20);
    this.heading = Math.PI;      // facing direction (radians, 0 = +z)
    this.velY = 0;
    this.onGround = true;
    this.health = 100;
    this.lastDamageAt = -99;
    this.punchCooldown = 0;
    this.walkPhase = 0;
    this.inCar = false;
    this.speed2d = 0;

    const g = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: 0xd8542e });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1e2430 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
    this.body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.5), jacket);
    this.body.position.y = 1.05;
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), skin);
    this.head.position.y = 1.85;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.31, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), dark);
    cap.position.y = 1.9;
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, 0.34), dark);
    this.legL.position.set(-0.22, 0.43, 0);
    this.legR = this.legL.clone(); this.legR.position.x = 0.22;
    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.85, 0.3), jacket);
    this.armL.position.set(-0.58, 1.05, 0);
    this.armR = this.armL.clone(); this.armR.position.x = 0.58;
    // pistol in the right hand, visible when armed
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.42), new THREE.MeshLambertMaterial({ color: 0x111318 }));
    this.gun.position.set(0.58, 0.72, 0.3);
    g.add(this.body, this.head, cap, this.legL, this.legR, this.armL, this.armR, this.gun);
    this.mesh = g;
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  setPosition(x, z, heading) {
    this.pos.set(x, 0, z);
    if (heading !== undefined) this.heading = heading;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }

  takeDamage(amount, now) {
    if (this.health <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.lastDamageAt = now;
  }

  // input: {forward, back, left, right, sprint, jump} in camera space; camYaw is the camera orbit yaw.
  update(dt, input, camYaw, city, now) {
    if (this.inCar) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);

    // camera-relative move direction
    const fwdX = Math.sin(camYaw), fwdZ = Math.cos(camYaw);
    const rgtX = Math.cos(camYaw), rgtZ = -Math.sin(camYaw);
    let mx = 0, mz = 0;
    if (input.forward) { mx += fwdX; mz += fwdZ; }
    if (input.back) { mx -= fwdX; mz -= fwdZ; }
    if (input.right) { mx += rgtX; mz += rgtZ; }
    if (input.left) { mx -= rgtX; mz -= rgtZ; }
    const len = Math.hypot(mx, mz);
    const speed = input.sprint ? 9 : 6;
    if (len > 0.01) {
      mx /= len; mz /= len;
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
      this.heading = Math.atan2(mx, mz);
      this.speed2d = speed;
      this.walkPhase += dt * speed * 1.6;
    } else {
      this.speed2d = 0;
      this.walkPhase *= 0.85;
    }

    // jump + gravity
    if (input.jump && this.onGround) { this.velY = 8.5; this.onGround = false; }
    if (!this.onGround) {
      this.velY -= 22 * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.velY = 0; this.onGround = true; }
    }

    // keep inside the playable area and out of buildings
    this.pos.x = clamp(this.pos.x, -305, 305);
    this.pos.z = clamp(this.pos.z, -305, 312);
    city.resolveCircle(this.pos, 0.7);

    // health regen: 4/s after 6 s without damage
    if (this.health > 0 && now - this.lastDamageAt > 6) {
      this.health = Math.min(100, this.health + 4 * dt);
    }

    // animate the walk
    const swing = this.speed2d > 0 ? Math.sin(this.walkPhase) * 0.5 : 0;
    this.legL.rotation.x = swing; this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8; this.armR.rotation.x = swing * 0.8;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }
}
