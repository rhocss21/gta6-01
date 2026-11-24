// SOLMAR CITY — the five-job story chain: Jax Marlowe pays off his $50,000
// debt to fixer Mara Voss, one job at a time. Each job has a beacon, a
// minimap blip, a live HUD banner with the distance to the target, a stage
// counter and a par-time countdown.
import * as THREE from 'three';
import { flatDist, fmtTimer } from './util.js';

export const DEBT_TOTAL = 50000;

export const JOBS = [
  { name: 'Hot Wheels', reward: 4800, par: 480, desc: 'Steal a car — any car on Palm Row' },
  { name: 'The Pickup', reward: 4000, par: 720, desc: 'Collect the package at the docks' },
  { name: 'Lose the Heat', reward: 6500, par: 600, desc: 'Reach 3 stars, then lose the cops' },
  { name: 'Coastal Run', reward: 9000, par: 90, desc: 'Timed checkpoints along the coast' },
  { name: 'Three-Shop Heist', reward: 26000, par: 900, desc: 'Rob 3 shops, then escape to Mara' },
];

const HEIST_SHOPS = ['liquor', 'palmRow', 'coastMart'];
const HEIST_NAMES = { liquor: 'Sunset Liquor', palmRow: 'Palm Row', coastMart: 'Coast Mart' };

export class Story {
  constructor(scene, city, hooks) {
    this.scene = scene;
    this.city = city;
    this.hooks = hooks; // {onComplete(job, reward), onToast(text, kind), onPickup(), onRobbery(shop)}
    this.index = 0; // current job (0..4); 5 = story done
    this.step = 0; // sub-step inside the current job
    this.finished = [];
    this.target = null; // {x, z} or null
    this.robbed = new Set();
    this.robProgress = 0;
    this.robShop = null;
    this.coastTimer = 0;
    this.coastWp = 0;
    this.coastPoints = [
      { x: -240, z: 282 },
      { x: -60, z: 282 },
      { x: 120, z: 282 },
      { x: 240, z: 282 },
    ];
    this.evadeSeen3 = false;
    this.done = false;
    this.timeLeft = JOBS[0].par; // par-time countdown for the HUD

    // beacon: a slim pulsing light column + small ground ring at the target —
    // kept narrow so it reads from afar without blocking the street up close
    this.beacon = new THREE.Group();
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 60, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
    );
    cyl.position.y = 30;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.0, 2.8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    this.beacon.add(cyl, ring);
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.startJob(0);
  }

  get current() {
    return this.index < JOBS.length ? JOBS[this.index] : null;
  }

  get storyDone() {
    return this.index >= JOBS.length;
  }

  // How much of the debt is already paid, from finished job rewards.
  get debtPaid() {
    return this.finished.reduce((sum, i) => sum + JOBS[i].reward, 0);
  }

  // Debt left after the current job pays out.
  get debtAfterJob() {
    const reward = this.current ? this.current.reward : 0;
    return Math.max(0, DEBT_TOTAL - this.debtPaid - reward);
  }

  startJob(i) {
    this.index = i;
    this.step = 0;
    this.robbed = new Set();
    this.robProgress = 0;
    this.robShop = null;
    this.evadeSeen3 = false;
    this.coastWp = 0;
    this.coastTimer = 0;
    if (i >= JOBS.length) {
      this.target = null;
      this.done = true;
      this.timeLeft = 0;
      return;
    }
    this.done = false;
    this.timeLeft = JOBS[i].par;
    this.retarget();
  }

  retarget() {
    const S = this.city.shops;
    if (this.index === 0) {
      this.target = this.step === 0 ? null : { x: S.garage.pos.x, z: S.garage.pos.z };
    } else if (this.index === 1) {
      this.target = this.step === 0 ? { x: S.docks.pos.x, z: S.docks.pos.z } : { x: S.maras.pos.x, z: S.maras.pos.z };
    } else if (this.index === 2) {
      this.target = null;
    } else if (this.index === 3) {
      this.target = this.coastPoints[this.coastWp];
    } else if (this.index === 4) {
      if (this.robbed.size < 3) {
        const next = HEIST_SHOPS.find((k) => !this.robbed.has(k));
        this.target = next ? { x: S[next].pos.x, z: S[next].pos.z } : null;
      } else {
        this.target = { x: S.maras.pos.x, z: S.maras.pos.z };
      }
    }
  }

  // "JOB 2/5 · STAGE 2/3" for the HUD header.
  stageLabel() {
    if (this.storyDone) return 'FREE ROAM';
    const stages = this.index === 1 ? 2 : this.index === 4 ? 4 : this.index === 3 ? 4 : 2;
    let stage;
    if (this.index === 0 || this.index === 1) stage = this.step + 1;
    else if (this.index === 3) stage = this.coastWp + 1;
    else if (this.index === 4) stage = this.robbed.size + 1;
    else stage = 1;
    return `JOB ${this.index + 1}/${JOBS.length} · STAGE ${Math.min(stage, stages)}/${stages}`;
  }

  // The next concrete action, for the HUD's NEXT line.
  nextLabel() {
    if (this.storyDone) return 'The city is yours — free roam';
    if (this.index === 0) return this.step === 0 ? 'NEXT: steal any car on Palm Row' : 'NEXT: deliver it to Sunset Garage';
    if (this.index === 1) return this.step === 0 ? 'NEXT: grab the package at the docks' : 'NEXT: take it back to Mara';
    if (this.index === 2) return this.evadeSeen3 ? 'NEXT: break line of sight — vanish' : 'NEXT: get to 3 stars — steal, shoot, make noise';
    if (this.index === 3) return `NEXT: checkpoint ${this.coastWp + 1} of 4 on the beach road`;
    if (this.index === 4) {
      if (this.robbed.size < 3) {
        const next = HEIST_SHOPS.find((k) => !this.robbed.has(k));
        return `NEXT: hold up ${HEIST_NAMES[next]} — stand in the doorway`;
      }
      return "NEXT: escape to Mara's office";
    }
    return this.current.desc;
  }

  // Human-readable banner line for the current step.
  bannerLine() {
    if (this.storyDone) return 'Solmar City is yours — free roam';
    if (this.index === 0) {
      return this.step === 0
        ? 'Hot Wheels: Steal a car — any car on Palm Row'
        : 'Hot Wheels: Deliver the car to Sunset Garage';
    }
    if (this.index === 1) {
      return this.step === 0
        ? 'The Pickup: Drive to the docks and collect the package'
        : "The Pickup: Take the package back to Mara's office";
    }
    if (this.index === 2) {
      return this.evadeSeen3
        ? 'Lose the Heat: Stay out of sight — lose the cops!'
        : 'Lose the Heat: Get to 3 stars — steal, shoot, make noise';
    }
    if (this.index === 3) {
      return `Coastal Run: Checkpoint ${this.coastWp + 1} of 4 — ${Math.max(0, Math.ceil(this.coastTimer))}s left`;
    }
    if (this.index === 4) {
      if (this.robbed.size < 3) {
        const next = HEIST_SHOPS.find((k) => !this.robbed.has(k));
        return `Three-Shop Heist: Rob ${HEIST_NAMES[next]} — stand in the doorway (${this.robbed.size}/3 done)`;
      }
      return "Three-Shop Heist: Escape — get to Mara's office!";
    }
    return this.current.desc;
  }

  timerLabel() {
    return this.storyDone ? '' : fmtTimer(this.timeLeft);
  }

  finishJob() {
    const m = JOBS[this.index];
    this.finished.push(this.index);
    if (this.hooks.onComplete) this.hooks.onComplete(m, m.reward);
    this.startJob(this.index + 1);
    if (this.storyDone && this.hooks.onStoryComplete) this.hooks.onStoryComplete();
  }

  // Events the game feeds in: stealing a car, arriving somewhere, wanted changes.
  noteStolen() {
    if (this.index === 0 && this.step === 0) {
      this.step = 1;
      this.retarget();
      if (this.hooks.onToast) this.hooks.onToast('Car stolen — deliver it to Sunset Garage!', 'gold');
    }
  }

  update(dt, W) {
    if (this.storyDone || W.state !== 'playing') return;
    if (W.freezeMissions) return; // staged shot: hold the job state for the frame
    const px = W.playerCar ? W.playerCar.pos.x : W.jax.pos.x;
    const pz = W.playerCar ? W.playerCar.pos.z : W.jax.pos.z;
    // par-time countdown (the Coastal Run has its own tighter timer)
    if (this.index !== 3) this.timeLeft = Math.max(0, this.timeLeft - dt);

    if (this.index === 0 && this.step === 1) {
      if (flatDist(px, pz, this.target.x, this.target.z) < 12 && W.playerCar) this.finishJob();
    } else if (this.index === 1) {
      if (this.step === 0 && flatDist(px, pz, this.target.x, this.target.z) < 10) {
        this.step = 1;
        this.retarget();
        if (this.hooks.onPickup) this.hooks.onPickup();
        if (this.hooks.onToast) this.hooks.onToast("Package collected — take it to Mara's!", 'gold');
      } else if (this.step === 1 && flatDist(px, pz, this.target.x, this.target.z) < 10) {
        this.finishJob();
      }
    } else if (this.index === 2) {
      if (!this.evadeSeen3 && W.wanted >= 3) {
        this.evadeSeen3 = true;
        if (this.hooks.onToast) this.hooks.onToast('3 stars! Now lose them — stay out of sight!', 'gold');
      } else if (this.evadeSeen3 && W.wanted === 0) {
        this.finishJob();
      }
    } else if (this.index === 3) {
      if (this.step === 0) {
        this.step = 1;
        this.coastTimer = 90;
      }
      this.coastTimer -= dt;
      if (this.target && flatDist(px, pz, this.target.x, this.target.z) < 12) {
        this.coastWp += 1;
        if (this.coastWp >= this.coastPoints.length) {
          this.finishJob();
          return;
        }
        this.retarget();
        if (this.hooks.onToast) this.hooks.onToast(`Checkpoint ${this.coastWp} of 4!`, 'gold');
      }
      if (this.coastTimer <= 0) {
        this.coastTimer = 90;
        this.coastWp = 0;
        this.retarget();
        if (this.hooks.onToast) this.hooks.onToast('Out of time — the coastal run restarts!', '');
      }
    } else if (this.index === 4) {
      if (this.robbed.size < 3) {
        // hold-up: stand in the doorway of the next shop (on foot)
        const next = HEIST_SHOPS.find((k) => !this.robbed.has(k));
        const shop = this.city.shops[next];
        const onFoot = !W.playerCar;
        if (onFoot && flatDist(W.jax.pos.x, W.jax.pos.z, shop.pos.x, shop.pos.z) < 5) {
          this.robShop = next;
          this.robProgress += dt / 3;
          if (this.robProgress >= 1) {
            this.robbed.add(next);
            this.robProgress = 0;
            this.robShop = null;
            if (this.hooks.onRobbery) this.hooks.onRobbery(shop.name);
            this.retarget();
          }
        } else {
          this.robShop = null;
          this.robProgress = Math.max(0, this.robProgress - dt / 2);
        }
      } else if (flatDist(px, pz, this.target.x, this.target.z) < 10) {
        this.finishJob();
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
