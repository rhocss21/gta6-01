// SOLMAR CITY — Jax Marlowe on foot: WASD movement relative to the camera,
// mouse-orbit third-person view, walk animation, jump, and the player model.
import * as THREE from 'three';
import { clamp, lerpAngle } from './util.js';
import { resolveCircle } from './city.js';

const WALK_SPEED = 6.5;
const GRAVITY = 22;

export function makePlayerMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5e });
  const shirt = new THREE.MeshLambertMaterial({ color: 0xff6a3d });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2e3a4a });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1c1410 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.0, 0.45), shirt);
  torso.position.y = 1.25;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), skin);
  head.position.y = 2.0;
  g.add(head);
  const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 8, 0, Math.PI * 2, 0, 1.4), hair);
  hairTop.position.y = 2.05;
  g.add(hairTop);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.85, 0.36), pants);
  legL.position.set(-0.22, 0.42, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.22;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.85, 0.3), shirt);
  armL.position.set(-0.58, 1.3, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.58;
  g.add(armR);
  // Pistol in the right hand, visible when armed.
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.14, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
  );
  gun.position.set(0.58, 0.95, 0.3);
  gun.name = 'gun';
  g.add(gun);

  g.userData = { legL, legR, armL, armR, torso };
  return g;
}

export function spawnPlayer(G, x, z) {
  G.playerMesh.position.set(x, 0, z);
  G.playerMesh.rotation.y = 0;
  G.player = { velY: 0, onGround: true, yaw: 0, walkPhase: 0, moving: false };
  G.camYaw = 0; // face +z, toward the parked car on Palm Row
  G.camPitch = 0.32;
}

// On-foot update: camera-relative WASD, jump, building collision, walk cycle.
export function updatePlayer(G, dt) {
  const k = G.keys;
  const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
  const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
  const p = G.player;
  const mesh = G.playerMesh;

  // Camera yaw defines "forward": camera sits behind the player.
  const cy = G.camYaw;
  const fx = Math.sin(cy);
  const fz = Math.cos(cy);
  // Right vector = forward x up = (-cos, sin) in xz.
  const rx = -Math.cos(cy);
  const rz = Math.sin(cy);
  let mx = fx * fwd + rx * strafe;
  let mz = fz * fwd + rz * strafe;
  const len = Math.hypot(mx, mz);
  p.moving = len > 0.01;
  if (p.moving) {
    mx /= len;
    mz /= len;
    const nx = mesh.position.x + mx * WALK_SPEED * dt;
    const nz = mesh.position.z + mz * WALK_SPEED * dt;
    const fixed = resolveCircle(G, nx, nz, 0.9);
    mesh.position.x = fixed.x;
    mesh.position.z = fixed.z;
    p.yaw = lerpAngle(p.yaw, Math.atan2(mx, mz), Math.min(1, dt * 12));
    mesh.rotation.y = p.yaw;
    p.walkPhase += dt * 11;
  } else {
    p.walkPhase = lerpAngle(p.walkPhase, Math.round(p.walkPhase / Math.PI) * Math.PI, Math.min(1, dt * 8));
  }

  // Jump + gravity.
  if (k.has('Space') && p.onGround) {
    p.velY = 8.5;
    p.onGround = false;
  }
  if (!p.onGround) {
    p.velY -= GRAVITY * dt;
    mesh.position.y += p.velY * dt;
    if (mesh.position.y <= 0) {
      mesh.position.y = 0;
      p.velY = 0;
      p.onGround = true;
    }
  }

  // Walk-cycle limb swing.
  const swing = p.moving ? Math.sin(p.walkPhase) * 0.55 : 0;
  const u = mesh.userData;
  u.legL.rotation.x = swing;
  u.legR.rotation.x = -swing;
  u.armL.rotation.x = -swing * 0.8;
  u.armR.rotation.x = swing * 0.8;
  u.torso.position.y = 1.25 + (p.moving ? Math.abs(Math.sin(p.walkPhase)) * 0.06 : 0);
  mesh.visible = !G.inCar;
}

// Third-person camera: behind + above the player or the car, mouse-orbitable,
// easing back behind a driven car. Returns nothing; moves G.camera.
export function updateCamera(G, dt) {
  const target = G.inCar && G.playerCar ? G.playerCar.mesh.position : G.playerMesh.position;
  const isCar = G.inCar && G.playerCar;
  if (isCar) {
    // Ease the orbit yaw toward the car's heading so driving feels natural.
    const carYaw = G.playerCar.mesh.rotation.y;
    G.camYaw = lerpAngle(G.camYaw, carYaw, Math.min(1, dt * 1.6));
  }
  const dist = isCar ? (G.staging === 'cover' ? 16 : 10.5) : 7.5;
  const height = isCar ? (G.staging === 'cover' ? 5.5 : 4.2) : 3.4;
  const cx = target.x - Math.sin(G.camYaw) * dist * Math.cos(G.camPitch);
  const cz = target.z - Math.cos(G.camYaw) * dist * Math.cos(G.camPitch);
  const cy = target.y + height + Math.sin(G.camPitch) * dist * 0.5;
  G.camera.position.set(
    G.camera.position.x + (cx - G.camera.position.x) * Math.min(1, dt * 10),
    G.camera.position.y + (cy - G.camera.position.y) * Math.min(1, dt * 10),
    G.camera.position.z + (cz - G.camera.position.z) * Math.min(1, dt * 10),
  );
  const look = new THREE.Vector3(target.x, target.y + 1.6, target.z);
  if (isCar) {
    look.x += Math.sin(G.playerCar.mesh.rotation.y) * 4;
    look.z += Math.cos(G.playerCar.mesh.rotation.y) * 4;
  }
  G.camera.lookAt(look);
  G.camera.position.y = Math.max(G.camera.position.y, 1.2);
}
