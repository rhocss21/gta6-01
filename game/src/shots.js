// Solmar City — staged screenshots (?shot=): deterministic setups that skip
// the menu and place the game state directly, so each screenshot shows a
// different system at its best.
import { dist2 } from './util.js';

export function applyShot(name, G) {
  const S = G.city.shops;
  if (name === 'menu') {
    // start screen over the live city; the menu camera orbits slowly (main.js)
    G.state = 'menu';
    G.menuOrbit = true;
    return;
  }

  // every gameplay shot starts playing, menu skipped
  G.state = 'playing';
  G.hud.showHud(true);
  G.hud.hideOverlays();

  if (name === 'cover') {
    // driving chase: player car with two police cars behind, wanted 2, mission 1 live
    G.missions.setMission(0);
    G.missions.phase = 1;
    G.missions.updateTarget();
    G.wanted = 2;
    G.money = 0;
    const car = G.spawnPlayerCar(-30, 40, Math.PI, 0xc23b2e);
    car.speed = 0; // staged still: the player car and both police cars hold
    G.player.inCar = true; // position, so the framing is fully controlled and
    G.playerCar = car;     // no ram lands before the screenshot
    G.player.health = 100;
    G.player.lastDamageAt = -99;
    G.police.syncToWanted(2, G.player.pos);
    // police right behind the player car (6 m and 9 m back, flanking it),
    // held in place — with the 15 m chase camera they read large at the
    // bottom of the frame, the player car ahead of them
    G.police.cars.forEach((pc, i) => {
      pc.pos.set(-30 + (i === 0 ? -3 : 3), 0, 46 + i * 3);
      pc.heading = Math.PI;
      pc.speed = 0;
      pc.hold = true;
      pc.syncMesh();
    });
    // slightly higher, further chase camera so the whole chase reads
    G.shotCam = { dist: 15, pitch: 0.42 };
    G.cameraYaw = Math.PI;
    G.cameraPitch = 0.42;
  } else if (name === 'street') {
    // on foot beside a stealable car, steal prompt showing
    G.missions.setMission(0);
    G.wanted = 0;
    G.player.inCar = false;
    G.playerCar = null;
    G.player.setPosition(86, 21, Math.PI * 0.9);
    // beacon marks the stealable parked sedan right next to the player
    G.missions.target = { x: 86, z: 18 };
    G.cameraYaw = Math.PI * 0.85;
    G.cameraPitch = 0.35;
  } else if (name === 'mission') {
    // heist at Sunset Liquor: pistol out, a foot cop closing in, wanted 2
    G.missions.setMission(4);
    G.missions.robbed = new Set();
    G.missions.updateTarget();
    G.wanted = 2;
    G.player.inCar = false;
    G.playerCar = null;
    const L = S.liquor.pos;
    G.player.setPosition(L.x + 2, L.z + 3, -Math.PI / 2);
    G.police.syncToWanted(2, G.player.pos);
    // one foot cop ~16 m west along the street, in view and closing in —
    // far enough that it cannot reach the player (and the camera) before
    // the screenshot, close enough to read as a threat
    G.police.cops = [];
    G.police.spawnFootCopAt(L.x - 14, L.z + 4);
    G.player.health = 100;
    G.player.lastDamageAt = -99;
    G.cameraYaw = -Math.PI / 2 + 0.5;
    G.cameraPitch = 0.42;
  }
  // keep the wanted-sync in the main loop from re-spawning / removing the staged police
  G.lastWanted = G.wanted;
  G.hud.update(G, 0.1);
}

// Distance helper used by the playtest steering loop (kept here for reuse).
export function distanceTo(a, b) { return dist2(a.x, a.z, b.x, b.z); }
