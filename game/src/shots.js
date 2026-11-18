// SOLMAR CITY — screenshot staging. The capture scripts load the game with
// ?shot=<name>; each name stages a real gameplay state (never a fake frame):
// the player, cars, police and mission are all live in the scene.
import { LANDMARKS } from './city.js';
import { jumpToMission } from './missions.js';
import { makeCarMesh } from './vehicles.js';

export function applyShotStaging(G, shot) {
  if (!shot || shot === 'menu') return; // menu shot: stay on the start screen
  G.staging = shot;
  G.startGame();

  if (shot === 'street') {
    // On foot on Palm Row, a stealable sedan a few steps away, mission 1.
    G.playerMesh.position.set(9, 0, 143);
    G.playerMesh.rotation.y = 0.3;
    G.camYaw = 0.2;
    G.camPitch = 0.28;
    return;
  }

  if (shot === 'cover') {
    // Driving chase down Palm Row: the player car drives itself west toward
    // Sunset Garage, two police cars closing from behind on the same road,
    // a taxi ahead, wanted 2 stars, mission marker on the garage.
    const car = G.cars[0];
    car.mesh.position.set(0, 0, 140);
    car.mesh.rotation.y = -Math.PI / 2;
    G.vehicles.enterCar(G, car);
    G.police.wanted = 2;
    G.hud.updateStars();
    G.audio.setSiren(true);
    jumpToMission(G, 0);
    G.missions.step = 1; // already stolen — now deliver to the garage
    G.missions.startMissionStep(G);
    // Two police cars trailing the player, offset to either side of the road.
    for (const [px, pz] of [[20, 136], [32, 144]]) {
      const cop = makeCarMesh(0xf0f0f0, 'cop');
      cop.position.set(px, 0, pz);
      cop.rotation.y = -Math.PI / 2;
      G.scene.add(cop);
      G.policeCars.push({ mesh: cop, kind: 'cop', speed: 14, parked: false, driver: 'police', maxSpeed: 30, hitCooldown: 0 });
    }
    // A parked taxi ahead on the roadside for depth.
    const taxi = G.cars[2];
    taxi.mesh.position.set(-50, 0, 146);
    taxi.mesh.rotation.y = -Math.PI / 2;
    G.camYaw = -Math.PI / 2;
    G.camPitch = 0.3;
    return;
  }

  if (shot === 'mission') {
    // Heist in progress: player on foot at Sunset Liquor's doorway with
    // pistol out, a foot cop closing in from the right, wanted 2 stars.
    // Three-quarter camera so player, shop sign and cop share the frame.
    jumpToMission(G, 4);
    const shop = LANDMARKS.shops[0];
    G.playerMesh.position.set(shop.x, 0, shop.z + 9);
    G.playerMesh.rotation.y = Math.PI;
    G.player.yaw = Math.PI;
    G.camYaw = Math.PI - 0.6;
    G.camPitch = 0.45;
    G.police.wanted = 2;
    G.hud.updateStars();
    G.audio.setSiren(true);
    const cop = G.police.spawnFootCop(G, G.playerMesh.position);
    if (cop) {
      cop.mesh.position.set(shop.x + 16, 0, shop.z + 18);
    }
    return;
  }
}
