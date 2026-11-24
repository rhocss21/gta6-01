// SOLMAR CITY — combat: pistol (12-round mag, tracer + muzzle flash +
// particles), punch, reload. Weapon slots feed the HUD; shooting raises the
// heat and makes pedestrians flee.
import * as THREE from 'three';

// The player's arsenal. Slots unlock as the story advances; locked slots
// stay visible in the HUD so the player can see what is coming.
export const WEAPONS = [
  { id: 'fists', name: 'FISTS', unlockJob: 0 },
  { id: 'pistol', name: 'PISTOL', unlockJob: 0 },
  { id: 'smg', name: 'SMG', unlockJob: 2 },
  { id: 'shotgun', name: 'SHOTGUN', unlockJob: 3 },
  { id: 'rifle', name: 'RIFLE', unlockJob: 4 },
];

export class Weapons {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.mag = 12;
    this.magSize = 12;
    this.reserve = 60;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.punchCooldown = 0;
    this.keepMuzzle = false; // staged shot: keep the flash lit for the frame
    this.onShoot = null; // (x, z, now) — traffic flees, wanted rises
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

  get ammoLabel() {
    return `PISTOL ${this.mag}/${this.magSize}`;
  }

  // Slot states for the HUD: owned / locked, with ammo where it applies.
  slotStates(jobsDone) {
    return WEAPONS.map((w) => ({
      ...w,
      locked: jobsDone < w.unlockJob,
      ammo: w.id === 'pistol' ? `${this.mag}/${this.magSize}` : w.id === 'fists' ? '—' : '0',
    }));
  }

  startReload() {
    if (this.reloadTimer > 0 || this.mag === this.magSize || this.reserve <= 0) return false;
    this.reloadTimer = 1.1;
    return true;
  }

  step(dt) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const need = this.magSize - this.mag;
        const take = Math.min(need, this.reserve);
        this.mag += take;
        this.reserve -= take;
      }
    }
    for (const t of this.tracers) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, Math.min(1, t.life / 0.09));
      if (t.life <= 0) this.scene.remove(t.line);
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
      if (this.keepMuzzle) {
        // staged shot: keep the flash lit for the frame
        this.muzzle.material.opacity = 1;
      } else {
        this.muzzle.material.opacity -= dt * 14;
        if (this.muzzle.material.opacity <= 0) this.muzzle.visible = false;
      }
    }
  }

  // Draw one tracer + muzzle flash without firing (staged mission shot).
  // life is in seconds; a staged shot passes a long life to hold the frame.
  drawTracer(origin, target, life) {
    const geo = new THREE.BufferGeometry().setFromPoints([origin, target]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 }));
    this.scene.add(line);
    this.tracers.push({ line, life: life || 0.09 });
    this.muzzle.position.copy(origin);
    this.muzzle.material.opacity = 1;
    this.muzzle.visible = true;
    this.burst(target, 0xff5a4e);
  }

  // Fire from the player's gun toward the camera aim. Returns true if a shot left the barrel.
  fire(origin, dir, camera, police, traffic, now) {
    if (this.fireCooldown > 0 || this.reloadTimer > 0 || this.mag <= 0) return false;
    this.fireCooldown = 0.22;
    this.mag -= 1;
    this.audio.unlock();
    this.audio.gunshot();

    const range = 70;
    const end = new THREE.Vector3().copy(origin).addScaledVector(dir, range);
    let hitPoint = end.clone();
    let hitCop = null;
    let hitPed = null;
    let hitD = range;

    // nearest foot cop roughly along the aim ray
    for (const cop of police.cops) {
      const to = new THREE.Vector3(cop.pos.x - origin.x, 1.2 - origin.y, cop.pos.z - origin.z);
      const along = to.dot(dir);
      if (along < 1 || along > range) continue;
      const perp = to.clone().addScaledVector(dir, -along).length();
      if (perp < 1.6 && along < hitD) {
        hitD = along;
        hitCop = cop;
        hitPed = null;
      }
    }
    // nearest pedestrian roughly along the aim ray
    for (const p of traffic.peds) {
      const to = new THREE.Vector3(p.pos.x - origin.x, 1.2 - origin.y, p.pos.z - origin.z);
      const along = to.dot(dir);
      if (along < 1 || along > range) continue;
      const perp = to.clone().addScaledVector(dir, -along).length();
      if (perp < 1.6 && along < hitD) {
        hitD = along;
        hitPed = p;
        hitCop = null;
      }
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
    if (hitD < range) this.burst(hitPoint, 0xff5a4e);

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
      this.burst(hitPoint, 0xff8a5c);
      if (this.onPedKilled) this.onPedKilled();
    }
    if (this.onShoot) this.onShoot(origin.x, origin.z, now);
    return true;
  }

  // F punch: 25 damage to the nearest cop or pedestrian within 2 m in front.
  punch(playerPos, heading, police, traffic) {
    if (this.punchCooldown > 0) return false;
    this.punchCooldown = 0.55;
    this.audio.unlock();
    this.audio.thud();
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    let best = null;
    let bestD = 2.2;
    let isCop = false;
    for (const cop of police.cops) {
      const dx = cop.pos.x - playerPos.x;
      const dz = cop.pos.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD && dx * fx + dz * fz > 0) {
        best = cop;
        bestD = d;
        isCop = true;
      }
    }
    for (const p of traffic.peds) {
      const dx = p.pos.x - playerPos.x;
      const dz = p.pos.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD && dx * fx + dz * fz > 0) {
        best = p;
        bestD = d;
        isCop = false;
      }
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
    this.burst(new THREE.Vector3(best.pos.x, 1.2, best.pos.z), 0xffffff);
    return true;
  }

  burst(point, color) {
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.14, 0.14),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
      );
      m.position.copy(point);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        life: 0.5,
        vx: (Math.random() - 0.5) * 7,
        vy: Math.random() * 5 + 1,
        vz: (Math.random() - 0.5) * 7,
      });
    }
  }
}
