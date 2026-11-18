// Solmar City — the five-job story chain: Jax Marlowe pays off his $50,000 debt
// to Mara Voss, one job at a time. Each mission has a beacon, a minimap blip and
// a live HUD banner with the distance to the target.
import * as THREE from 'three';
import { dist2 } from './util.js';

export const MISSION_DEFS = [
  { name: 'Hot Wheels', reward: 500, desc: 'Steal a car — any car on Palm Row' },
  { name: 'The Pickup', reward: 750, desc: 'Collect the package at the docks' },
  { name: 'Lose the Heat', reward: 1000, desc: 'Reach 3 stars, then lose the cops' },
  { name: 'Coastal Run', reward: 1500, desc: 'Timed checkpoints along the coast' },
  { name: 'Three-Shop Heist', reward: 3000, desc: 'Rob 3 shops, then escape to Mara' },
];

export class Missions {
  constructor(scene, city, callbacks) {
    this.scene = scene;
    this.city = city;
    this.cb = callbacks; // {onComplete(mission, reward), onToast(text, kind), onPickup(), onRobbery(shop)}
    this.index = 0;       // current mission (0..4); 5 = story done
    this.phase = 0;       // sub-step inside the current mission
    this.completed = [];
    this.target = null;   // {x, z} or null
    this.robbed = new Set();
    this.robProgress = 0;
    this.robShop = null;
    this.coastTimer = 0;
    this.coastWp = 0;
    this.coastPoints = [
      { x: -240, z: 282 }, { x: -60, z: 282 }, { x: 120, z: 282 }, { x: 240, z: 282 },
    ];
    this.evadeSeen3 = false;
    this.finished = false;

    // beacon: a pulsing light cylinder + ground ring at the target
    this.beacon = new THREE.Group();
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
    );
    cyl.position.y = 30;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.2, 4.6, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15;
    this.beacon.add(cyl, ring);
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.setMission(0);
  }

  get current() { return this.index < MISSION_DEFS.length ? MISSION_DEFS[this.index] : null; }
  get done() { return this.index >= MISSION_DEFS.length; }

  setMission(i) {
    this.index = i;
    this.phase = 0;
    this.robbed = new Set();
    this.robProgress = 0;
    this.robShop = null;
    this.evadeSeen3 = false;
    this.coastWp = 0;
    this.coastTimer = 0;
    if (i >= MISSION_DEFS.length) { this.target = null; this.finished = true; return; }
    this.updateTarget();
  }

  updateTarget() {
    const S = this.city.shops;
    if (this.index === 0) this.target = this.phase === 0 ? null : { x: S.garage.pos.x, z: S.garage.pos.z };
    else if (this.index === 1) this.target = this.phase === 0 ? { x: S.docks.pos.x, z: S.docks.pos.z } : { x: S.maras.pos.x, z: S.maras.pos.z };
    else if (this.index === 2) this.target = null;
    else if (this.index === 3) this.target = this.coastPoints[this.coastWp];
    else if (this.index === 4) {
      if (this.robbed.size < 3) {
        const next = ['liquor', 'palmRow', 'coastMart'].find((k) => !this.robbed.has(k));
        this.target = next ? { x: S[next].pos.x, z: S[next].pos.z } : null;
      } else this.target = { x: S.maras.pos.x, z: S.maras.pos.z };
    }
  }

  // Human-readable banner line for the current step.
  bannerText() {
    if (this.done) return 'Solmar City is yours — free roam';
    const m = MISSION_DEFS[this.index];
    if (this.index === 0) return this.phase === 0
      ? 'Hot Wheels: Steal a car — any car on Palm Row'
      : 'Hot Wheels: Deliver the car to Sunset Garage';
    if (this.index === 1) return this.phase === 0
      ? 'The Pickup: Drive to the docks and collect the package'
      : 'The Pickup: Take the package back to Mara\'s office';
    if (this.index === 2) return this.evadeSeen3
      ? 'Lose the Heat: Stay out of sight — lose the cops!'
      : 'Lose the Heat: Get to 3 stars — steal, shoot, make noise';
    if (this.index === 3) return `Coastal Run: Checkpoint ${this.coastWp + 1} of 4 — ${Math.max(0, Math.ceil(this.coastTimer))}s left`;
    if (this.index === 4) {
      if (this.robbed.size < 3) {
        const next = ['liquor', 'palmRow', 'coastMart'].find((k) => !this.robbed.has(k));
        const name = { liquor: 'Sunset Liquor', palmRow: 'Palm Row', coastMart: 'Coast Mart' }[next];
        return `Three-Shop Heist: Rob ${name} — stand in the doorway (${this.robbed.size}/3 done)`;
      }
      return 'Three-Shop Heist: Escape — get to Mara\'s office!';
    }
    return m.desc;
  }

  completeMission() {
    const m = MISSION_DEFS[this.index];
    this.completed.push(this.index);
    if (this.cb.onComplete) this.cb.onComplete(m, m.reward);
    this.setMission(this.index + 1);
    if (this.done && this.cb.onStoryComplete) this.cb.onStoryComplete();
  }

  // Events the game feeds in: stealing a car, arriving somewhere, wanted changes.
  onCarStolen() {
    if (this.index === 0 && this.phase === 0) {
      this.phase = 1;
      this.updateTarget();
      if (this.cb.onToast) this.cb.onToast('Car stolen — deliver it to Sunset Garage!', 'gold');
    }
  }

  update(dt, G) {
    if (this.done || G.state !== 'playing') return;
    const px = G.playerCar ? G.playerCar.pos.x : G.player.pos.x;
    const pz = G.playerCar ? G.playerCar.pos.z : G.player.pos.z;

    if (this.index === 0 && this.phase === 1) {
      if (dist2(px, pz, this.target.x, this.target.z) < 12 && G.playerCar) this.completeMission();
    } else if (this.index === 1) {
      if (this.phase === 0 && dist2(px, pz, this.target.x, this.target.z) < 10) {
        this.phase = 1; this.updateTarget();
        if (this.cb.onPickup) this.cb.onPickup();
        if (this.cb.onToast) this.cb.onToast('Package collected — take it to Mara\'s!', 'gold');
      } else if (this.phase === 1 && dist2(px, pz, this.target.x, this.target.z) < 10) {
        this.completeMission();
      }
    } else if (this.index === 2) {
      if (!this.evadeSeen3 && G.wanted >= 3) {
        this.evadeSeen3 = true;
        if (this.cb.onToast) this.cb.onToast('3 stars! Now lose them — stay out of sight!', 'gold');
      } else if (this.evadeSeen3 && G.wanted === 0) {
        this.completeMission();
      }
    } else if (this.index === 3) {
      if (this.phase === 0) { this.phase = 1; this.coastTimer = 90; }
      this.coastTimer -= dt;
      if (this.target && dist2(px, pz, this.target.x, this.target.z) < 12) {
        this.coastWp += 1;
        if (this.coastWp >= this.coastPoints.length) { this.completeMission(); return; }
        this.updateTarget();
        if (this.cb.onToast) this.cb.onToast(`Checkpoint ${this.coastWp} of 4!`, 'gold');
      }
      if (this.coastTimer <= 0) {
        this.coastTimer = 90; this.coastWp = 0; this.updateTarget();
        if (this.cb.onToast) this.cb.onToast('Out of time — the coastal run restarts!', '');
      }
    } else if (this.index === 4) {
      if (this.robbed.size < 3) {
        // hold-up: stand in the doorway of the next shop (on foot)
        const next = ['liquor', 'palmRow', 'coastMart'].find((k) => !this.robbed.has(k));
        const shop = this.city.shops[next];
        const onFoot = !G.playerCar;
        if (onFoot && dist2(G.player.pos.x, G.player.pos.z, shop.pos.x, shop.pos.z) < 5) {
          this.robShop = next;
          this.robProgress += dt / 3;
          if (this.robProgress >= 1) {
            this.robbed.add(next);
            this.robProgress = 0; this.robShop = null;
            if (this.cb.onRobbery) this.cb.onRobbery(shop.name);
            this.updateTarget();
          }
        } else {
          this.robShop = null;
          this.robProgress = Math.max(0, this.robProgress - dt / 2);
        }
      } else if (dist2(px, pz, this.target.x, this.target.z) < 10) {
        this.completeMission();
      }
    }

    // beacon follows the target and pulses
    if (this.target) {
      this.beacon.visible = true;
      this.beacon.position.set(this.target.x, 0, this.target.z);
      const s = 1 + Math.sin(performance.now() * 0.004) * 0.12;
      this.beacon.scale.set(s, 1, s);
    } else {
      this.beacon.visible = false;
    }
  }
}
