// SOLMAR CITY — combat: pistol (click, 12-round mag, R reload), punch (F),
// damage, and the player-health / wasted consequence.
import * as THREE from 'three';
import { clamp } from './util.js';

export function initCombat(G) {
  G.combat = {
    ammo: 12,
    magSize: 12,
    cooldown: 0,
    reloadTimer: 0,
    reloading: false,
  };
  // Muzzle flash: a small bright sprite pinned in front of the camera.
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
  );
  flash.visible = false;
  flash.name = 'muzzle';
  G.camera.add(flash);
  flash.position.set(0.35, -0.25, -1.2);
  G.muzzleFlash = flash;
  G.scene.add(G.camera);
}

function shootables(G) {
  const list = [];
  for (const ped of G.peds) if (!ped.dead) list.push(ped.mesh);
  for (const cop of G.footCops) list.push(cop.mesh);
  for (const car of [...G.cars, ...G.trafficCars, ...G.policeCars]) list.push(car.mesh);
  return list;
}

function flashMuzzle(G) {
  G.muzzleFlash.visible = true;
  G.muzzleFlash.material.rotation = Math.random() * Math.PI;
  setTimeout(() => { G.muzzleFlash.visible = false; }, 60);
}

export function shoot(G) {
  const c = G.combat;
  if (G.state !== 'playing' || G.inCar || c.cooldown > 0 || c.reloading) return;
  if (c.ammo <= 0) {
    reload(G);
    return;
  }
  c.ammo -= 1;
  c.cooldown = 0.28;
  G.audio.gunshot();
  flashMuzzle(G);
  G.traffic.scarePeds(G, G.playerMesh.position.x, G.playerMesh.position.z, 35);

  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(0, 0), G.camera);
  ray.far = 90;
  const hits = ray.intersectObjects(shootables(G), true);
  if (!hits.length) return;
  let hit = hits[0].object;
  while (hit && !hit.userData.car && hit.parent) hit = hit.parent;
  const obj = hits[0].object;
  // Walk up to the group that owns userData (ped / cop / car).
  let root = obj;
  while (root.parent && root.parent !== G.scene) root = root.parent;

  if (root.userData && root.userData.legL && root.userData.legR) {
    // A person was hit. Ped or cop?
    const ped = G.peds.find((p) => p.mesh === root);
    if (ped) {
      killPed(G, ped);
      return;
    }
    const cop = G.footCops.find((f) => f.mesh === root);
    if (cop) {
      cop.health = (cop.health ?? 100) - 34;
      G.hud.toast(cop.health > 0 ? 'You hit a cop! They are not happy.' : 'Cop down! The heat just doubled.', 'bad');
      if (cop.health <= 0) {
        cop.mesh.rotation.x = -Math.PI / 2;
        cop.mesh.position.y = 0.4;
        G.footCops.splice(G.footCops.indexOf(cop), 1);
        G.police.addWanted(G, 2);
      } else {
        G.police.addWanted(G, 1);
      }
    }
    return;
  }
  // Hit a car: sparks, no damage (cars are tough, Jax is not).
  G.hud.toast('Your shot pings off the bodywork.');
}

function killPed(G, ped) {
  ped.dead = true;
  ped.mesh.rotation.x = -Math.PI / 2;
  ped.mesh.position.y = 0.35;
  G.police.addWanted(G, 1);
  G.hud.toast('Pedestrian down! Witnesses are calling it in.', 'bad');
  setTimeout(() => {
    G.scene.remove(ped.mesh);
    const i = G.peds.indexOf(ped);
    if (i >= 0) G.peds.splice(i, 1);
  }, 4000);
}

export function punch(G) {
  if (G.state !== 'playing' || G.inCar || G.combat.cooldown > 0) return;
  G.combat.cooldown = 0.4;
  G.audio.punch();
  const px = G.playerMesh.position.x;
  const pz = G.playerMesh.position.z;
  const yaw = G.player.yaw;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const victims = [...G.peds.filter((p) => !p.dead), ...G.footCops];
  for (const v of victims) {
    const m = v.mesh;
    const dx = m.position.x - px;
    const dz = m.position.z - pz;
    const d = Math.hypot(dx, dz);
    if (d < 2.4 && dx * fx + dz * fz > 0) {
      if (v.speed !== undefined && v.mesh.userData.legL && G.peds.includes(v)) {
        v.fleeUntil = G.time + 4;
        G.police.addWanted(G, 1);
        G.hud.toast('You clocked a pedestrian! They run screaming.', 'bad');
      } else {
        v.health = (v.health ?? 100) - 25;
        G.police.addWanted(G, 1);
        G.hud.toast('You punched a cop! Bold. Stupid, but bold.', 'bad');
        if (v.health <= 0) {
          v.mesh.rotation.x = -Math.PI / 2;
          v.mesh.position.y = 0.4;
          G.footCops.splice(G.footCops.indexOf(v), 1);
          G.police.addWanted(G, 2);
        }
      }
      return;
    }
  }
}

export function reload(G) {
  const c = G.combat;
  if (c.reloading || c.ammo === c.magSize) return;
  c.reloading = true;
  c.reloadTimer = 0.9;
  G.audio.click();
}

export function updateCombat(G, dt) {
  const c = G.combat;
  c.cooldown = Math.max(0, c.cooldown - dt);
  if (c.reloading) {
    c.reloadTimer -= dt;
    if (c.reloadTimer <= 0) {
      c.reloading = false;
      c.ammo = c.magSize;
      G.audio.click();
    }
  }
}

export function damagePlayer(G, n) {
  if (G.state !== 'playing' || G.staging) return;
  G.health = clamp(G.health - n, 0, 100);
  G.hud.flashDamage();
  if (G.health <= 0) G.police.getWasted(G);
}
