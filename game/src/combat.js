// Solmar City — combat: pistol (12-round mag, tracer + muzzle flash + particles),
// punch, reload. Hits foot cops and pedestrians; shooting raises the heat.
import * as THREE from 'three';
import { dist2 } from './util.js';

export class Combat {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.mag = 12;
    this.magSize = 12;
    this.reserve = 60;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.punchCooldown = 0;
    this.onShoot = null;   // (x, z, now) — traffic flees, wanted rises
    this.onCopKilled = null;
    this.onPedKilled = null;

    // tracer lines + hit particles, pooled and short-lived
    this.tracers = [];
    this.particles = [];
    this.muzzle = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    this.muzzle.visible = false;
    scene.add(this.muzzle);
  }

  get ammoText() { return `PISTOL ${this.mag}/${this.magSize}`; }

  startReload() {
    if (this.reloadTimer > 0 || this.mag === this.magSize || this.reserve <= 0) return false;
    this.reloadTimer = 1.1;
    return true;
  }

  update(dt) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const need = this.magSize - this.mag;
        const take = Math.min(need, this.reserve);
        this.mag += take; this.reserve -= take;
      }
    }
    for (const t of this.tracers) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09);
      if (t.life <= 0) { this.scene.remove(t.line); }
    }
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const p of this.particles) {
      p.life -= dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy -= 9 * dt;
      p.mesh.material.opacity = Math.max(0, p.life / 0.5);
      if (p.life <= 0) this.scene.remove(p.mesh);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.muzzle.visible) {
      this.muzzle.material.opacity -= dt * 14;
      if (this.muzzle.material.opacity <= 0) this.muzzle.visible = false;
    }
  }

  // Fire from the player's gun toward the camera aim. Returns true if a shot left the barrel.
  shoot(origin, dir, camera, police, traffic, now) {
    if (this.fireCooldown > 0 || this.reloadTimer > 0 || this.mag <= 0) return false;
    this.fireCooldown = 0.22;
    this.mag -= 1;
    this.audio.ensureAudio();
    this.audio.playGunshot();

    const range = 70;
    const end = new THREE.Vector3().copy(origin).addScaledVector(dir, range);
    let hitPoint = end.clone();
    let hitCop = null, hitPed = null, hitD = range;

    // nearest foot cop roughly along the aim ray
    for (const cop of police.cops) {
      const to = new THREE.Vector3(cop.pos.x - origin.x, 1.2 - origin.y, cop.pos.z - origin.z);
      const along = to.dot(dir);
      if (along < 1 || along > range) continue;
      const perp = to.clone().addScaledVector(dir, -along).length();
      if (perp < 1.6 && along < hitD) { hitD = along; hitCop = cop; hitPed = null; }
    }
    // nearest pedestrian roughly along the aim ray
    for (const p of traffic.peds) {
      const to = new THREE.Vector3(p.pos.x - origin.x, 1.2 - origin.y, p.pos.z - origin.z);
      const along = to.dot(dir);
      if (along < 1 || along > range) continue;
      const perp = to.clone().addScaledVector(dir, -along).length();
      if (perp < 1.6 && along < hitD) { hitD = along; hitPed = p; hitCop = null; }
    }
    if (hitD < range) hitPoint = new THREE.Vector3().copy(origin).addScaledVector(dir, hitD);

    // tracer
    const geo = new THREE.BufferGeometry().setFromPoints([origin, hitPoint]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
    // muzzle flash at the gun
    this.muzzle.position.copy(origin).addScaledVector(dir, 0.8);
    this.muzzle.lookAt(camera.position);
    this.muzzle.material.opacity = 1;
    this.muzzle.visible = true;
    // hit particles
    if (hitD < range) this.burstParticles(hitPoint, 0xff5a4e);

    if (hitCop) {
      hitCop.hp -= 34;
      if (hitCop.hp <= 0) {
        this.scene.remove(hitCop.mesh);
        police.cops.splice(police.cops.indexOf(hitCop), 1);
        if (this.onCopKilled) this.onCopKilled();
      }
    } else if (hitPed) {
      traffic.peds.splice(traffic.peds.indexOf(hitPed), 1);
      this.scene.remove(hitPed.mesh);
      this.burstParticles(hitPoint, 0xff8a5c);
      if (this.onPedKilled) this.onPedKilled();
    }
    if (this.onShoot) this.onShoot(origin.x, origin.z, now);
    return true;
  }

  // F punch: 25 damage to the nearest cop or pedestrian within 2 m in front.
  punch(playerPos, heading, police, traffic) {
    if (this.punchCooldown > 0) return false;
    this.punchCooldown = 0.55;
    this.audio.ensureAudio();
    this.audio.playPunch();
    const fx = Math.sin(heading), fz = Math.cos(heading);
    let best = null, bestD = 2.2, isCop = false;
    for (const cop of police.cops) {
      const dx = cop.pos.x - playerPos.x, dz = cop.pos.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD && dx * fx + dz * fz > 0) { best = cop; bestD = d; isCop = true; }
    }
    for (const p of traffic.peds) {
      const dx = p.pos.x - playerPos.x, dz = p.pos.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD && dx * fx + dz * fz > 0) { best = p; bestD = d; isCop = false; }
    }
    if (!best) return true;
    if (isCop) {
      best.hp -= 25;
      if (best.hp <= 0) {
        this.scene.remove(best.mesh);
        police.cops.splice(police.cops.indexOf(best), 1);
        if (this.onCopKilled) this.onCopKilled();
      }
    } else {
      traffic.peds.splice(traffic.peds.indexOf(best), 1);
      this.scene.remove(best.mesh);
      if (this.onPedKilled) this.onPedKilled();
    }
    this.burstParticles(new THREE.Vector3(best.pos.x, 1.2, best.pos.z), 0xffffff);
    return true;
  }

  burstParticles(point, color) {
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.14, 0.14),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
      );
      m.position.copy(point);
      this.scene.add(m);
      this.particles.push({
        mesh: m, life: 0.5,
        vx: (Math.random() - 0.5) * 7, vy: Math.random() * 5 + 1, vz: (Math.random() - 0.5) * 7,
      });
    }
  }
}
