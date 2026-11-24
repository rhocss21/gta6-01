// SOLMAR CITY — staged screenshots (?shot=): deterministic setups that skip
// the menu and place the game state directly, so each screenshot shows a
// different system at its best. Every number on screen is live game state —
// money, wanted, dispatch distances, speeds — never painted-on text.
import * as THREE from 'three';
import { COVER_LINE } from './dialogue.js';

export function stageShot(name, W) {
  const S = W.city.shops;
  if (name === 'menu') {
    // start screen over the live city; the menu camera orbits slowly (main.js)
    W.state = 'menu';
    W.menuOrbit = true;
    return;
  }

  // every gameplay shot starts playing, menu skipped
  W.state = 'playing';
  W.hud.setHudVisible(true);
  W.hud.hideOverlays();

  if (name === 'cover') {
    // THE COVER — the chase starts on foot: Jax sprinting to the bright
    // Calyx on the beach road at golden hour, an interceptor closing at
    // 87 km/h behind him, a second unit flanking, Air One's spotlight on
    // him, pedestrians on the sidewalk, ocean and palms in frame.
    W.setTimeOfDay('golden');
    W.clockMinutes = 18 * 60 + 47;
    W.radioStation = 0;
    W.story.startJob(1);
    W.story.finished = [0]; // job 1 done: $4,800 of the debt paid
    W.story.step = 1; // package job, step 2: bring it back
    W.story.timeLeft = 107; // 01:47 on the par clock
    W.story.retarget();
    W.wanted = 4;
    W.money = 8400;
    W.jax.health = 82;
    W.jax.armor = 46;
    W.jax.inCar = false;
    W.playerCar = null;
    // player sprinting west along the beach road toward the Calyx
    W.jax.place(25, 271, -Math.PI / 2);
    W.jax.speed2d = 9; // mid-sprint for the frame
    // the bright coral Calyx, parked ahead on the road with its door to the player
    const car = W.parkRideAt(22, 270, -Math.PI / 2, 0xc23b2e, 'Calyx Sprint GT');
    W.targetCar = car;
    // police: 4 cars for 4 stars, staged CONVERGING on the player from the
    // west so they read in the frame (the camera looks west): headlights
    // toward him, the closest at 87 km/h
    W.pd.syncToWanted(4, W.jax.pos);
    const staged = [
      { x: 16, z: 268, h: Math.PI / 2, speed: 24.2 }, // TARPON 38, nearest, closing at 87 km/h
      { x: 10, z: 274, h: Math.PI / 2, speed: 21 }, // BULWARK 2, flanking
      { x: -8, z: 270, h: Math.PI / 2, speed: 0 }, // KITE 7, roadblock ahead
      { x: 4, z: 266, h: Math.PI / 2, speed: 18 }, // REEF 12, coming up the far lane
    ];
    W.pd.cars.forEach((pc, i) => {
      const s = staged[i % staged.length];
      pc.pos.set(s.x, 0, s.z);
      pc.heading = s.h;
      pc.speed = s.speed;
      pc.hold = true;
      pc.sync();
    });
    // foot cops closing in on foot, in frame on the player's flanks
    W.pd.cops.forEach((cop, i) => {
      cop.pos.set(i === 0 ? 28 : 27, 0, i === 0 ? 264 : 277);
      cop.heading = i === 0 ? -0.9 : 0.9;
      cop.hold = true;
      cop.mesh.position.copy(cop.pos);
      cop.mesh.rotation.y = cop.heading;
    });
    // Air One overhead ahead-left, spotlight held on the player
    W.pd.addHeli(18, 276, 40);
    W.pd.heliHold = true;
    // pedestrians on the beach sidewalks, one on the sand edge
    W.traffic.addPedestrian(16, 259, Math.PI / 2);
    W.traffic.addPedestrian(34, 259, -Math.PI / 2);
    W.traffic.addPedestrian(8, 281, 0);
    W.traffic.addPedestrian(20, 281, Math.PI);
    // a traffic car passing on the far lane
    W.traffic.addCar(-30, 266, Math.PI / 2, 0x2ea8a0);
    // Mara's line for the cover: the chase starts on foot
    W.dialogueOverride = COVER_LINE;
    W.hud.toast('AIR ONE: suspect on foot, Kumala Strand', '');
    // low third-person camera over the shoulder, turned a touch toward the
    // ocean so the sunset and the water share the frame
    W.shotCam = { dist: 10, pitch: 0.3 };
    W.cameraYaw = -Math.PI / 2 + 0.2;
    W.cameraPitch = 0.3;
  } else if (name === 'street') {
    // ON FOOT, STEALING A CAR: Jax beside a parked sedan on Palm Row,
    // steal prompt up, pedestrians and traffic around him, 1 star.
    W.setTimeOfDay('golden');
    W.clockMinutes = 17 * 60 + 20;
    W.radioStation = 1;
    W.story.startJob(0);
    W.story.step = 0;
    W.wanted = 1;
    W.money = 1250;
    W.jax.health = 100;
    W.jax.armor = 0;
    W.jax.inCar = false;
    W.playerCar = null;
    W.jax.place(86, 63, Math.PI * 0.9);
    // no beacon for this shot: the steal prompt is the focus, and the
    // beacon column would block the street
    W.story.target = null;
    W.pd.syncToWanted(1, W.jax.pos);
    W.pd.cars.forEach((pc) => {
      pc.hold = true;
    });
    W.traffic.addPedestrian(80, 52, Math.PI);
    W.traffic.addPedestrian(92, 72, 0);
    W.traffic.addPedestrian(78, 76, Math.PI / 2);
    W.traffic.addPedestrian(96, 50, -Math.PI / 2);
    W.traffic.addCar(90, 86, 0, 0xd8a928);
    W.cameraYaw = Math.PI * 0.7;
    W.cameraPitch = 0.35;
  } else if (name === 'mission') {
    // MISSION COMBAT — the Three-Shop Heist at Sunset Liquor: pistol out,
    // a live tracer toward the foot cop closing in, hold-up bar at 62%.
    W.setTimeOfDay('golden');
    W.clockMinutes = 19 * 60 + 5;
    W.radioStation = 0;
    W.story.startJob(4);
    W.story.finished = [0, 1, 2, 3];
    W.story.robbed = new Set();
    W.story.retarget();
    W.wanted = 3;
    W.money = 12400;
    W.jax.health = 64;
    W.jax.armor = 30;
    W.jax.inCar = false;
    W.playerCar = null;
    const L = S.liquor.pos;
    W.jax.place(L.x + 2, L.z + 3, -Math.PI / 2);
    W.pd.syncToWanted(3, W.jax.pos);
    // the spawned interceptors hold on the street west of the shop, in frame
    W.pd.cars.forEach((pc, i) => {
      pc.pos.set(L.x - 30 - i * 8, 0, L.z + 8 - i * 10);
      pc.heading = Math.PI / 2;
      pc.speed = i === 0 ? 15 : 0; // the nearest unit is closing at 54 km/h
      pc.hold = true;
      pc.sync();
    });
    // remove the randomly spawned foot cops (meshes too), then stage one
    for (const c of W.pd.cops) W.pd.scene.remove(c.mesh);
    W.pd.cops = [];
    const cop = W.pd.addFootCop(L.x - 14, L.z + 4, true);
    cop.heading = Math.PI / 2;
    // a live tracer from the pistol to the cop, held for the frame, plus the
    // muzzle flash kept lit; the hold-up bar is mid-robbery
    const origin = new THREE.Vector3(W.jax.pos.x, 1.2, W.jax.pos.z);
    const target = new THREE.Vector3(cop.pos.x, 1.2, cop.pos.z);
    W.guns.drawTracer(origin, target, 999);
    W.guns.keepMuzzle = true;
    W.guns.muzzle.position.copy(origin);
    W.guns.muzzle.material.opacity = 1;
    W.guns.muzzle.visible = true;
    W.story.robShop = 'liquor';
    W.story.robProgress = 0.62;
    W.freezeMissions = true; // hold the hold-up bar mid-robbery for the frame
    W.story.beacon.visible = true;
    W.story.beacon.position.set(W.story.target.x, 0, W.story.target.z);
    W.traffic.noteShot(W.jax.pos.x, W.jax.pos.z, W.now);
    W.traffic.addPedestrian(L.x + 12, L.z - 6, Math.PI);
    W.traffic.addPedestrian(L.x - 4, L.z + 10, 0);
    W.jax.health = 64;
    W.jax.lastHurtAt = -99;
    W.cameraYaw = -Math.PI / 2 + 0.5;
    W.cameraPitch = 0.42;
  } else if (name === 'night') {
    // NIGHT NEON — the same beach road after dark: the Calyx at 87 km/h,
    // interceptors behind, Air One's spotlight, neon shop signs glowing.
    W.setTimeOfDay('night');
    W.clockMinutes = 23 * 60 + 12;
    W.radioStation = 2;
    W.story.startJob(2);
    W.story.finished = [0, 1];
    W.story.evadeSeen3 = true;
    W.story.step = 1; // already at 3 stars: the evade half of the job
    W.story.timeLeft = 214; // 03:34 on the par clock
    W.wanted = 2;
    W.money = 9600;
    W.jax.health = 88;
    W.jax.armor = 55;
    const car = W.givePlayerCar(30, 270, -Math.PI / 2, 0xc23b2e, 'Calyx Sprint GT');
    car.speed = 24.2; // 87 km/h, held for the frame
    W.shotHoldCar = true;
    W.jax.inCar = true;
    W.pd.syncToWanted(2, W.jax.pos);
    // interceptors converging from ahead (the camera looks west), in frame
    W.pd.cars.forEach((pc, i) => {
      pc.pos.set(6 + i * 6, 0, 272 - i * 6);
      pc.heading = Math.PI / 2;
      pc.speed = 22 + i;
      pc.hold = true;
      pc.sync();
    });
    W.pd.addHeli(14, 276, 42);
    W.pd.heliHold = true;
    W.traffic.addPedestrian(14, 259, Math.PI / 2);
    W.traffic.addPedestrian(44, 259, -Math.PI / 2);
    W.traffic.addCar(-40, 266, Math.PI / 2, 0x2e6fc2);
    W.hud.toast('LIO: Lose the tail and the heat dies with it', 'gold');
    W.shotCam = { dist: 12, pitch: 0.3 };
    W.cameraYaw = -Math.PI / 2 + 0.2;
    W.cameraPitch = 0.3;
  }
  // keep the wanted-sync in the main loop from re-spawning the staged police
  W.lastWanted = W.wanted;
  W.hud.refresh(W, 0.1);
}
