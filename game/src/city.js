// Solmar City — the city itself: a 9x9 block grid, beach and docks to the south,
// canvas-painted ground and building textures, palms, streetlights and a skyline.
// All layout comes from a seeded RNG so ?seed= reproduces the same city.
import * as THREE from 'three';
import { clamp } from './util.js';

export const CITY_PITCH = 60;      // block + road
export const CITY_HALF = 270;      // roads run -270..270
export const ROAD_HALF = 7;        // half road width
export const BLOCK_HALF = 23;      // half block size

export function roadCenters() {
  const out = [];
  for (let i = -4; i <= 5; i++) out.push(i * CITY_PITCH - 30);
  return out; // -270, -210, ..., 270
}
export function blockCenters() {
  const out = [];
  for (let i = -4; i <= 4; i++) out.push(i * CITY_PITCH);
  return out; // -240, -180, ..., 240
}

function makeGroundTexture() {
  const S = 1024, c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  const toPx = (v) => ((v + 350) / 700) * S; // world -350..350 maps to canvas
  // base: dry grass / dirt outside the grid
  g.fillStyle = '#b8a06a'; g.fillRect(0, 0, S, S);
  // sand strip along the south edge, then water
  g.fillStyle = '#e8d29a'; g.fillRect(0, toPx(272), S, toPx(312) - toPx(272));
  g.fillStyle = '#2e7fa8'; g.fillRect(0, toPx(312), S, S - toPx(312));
  g.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 26; i++) g.fillRect(((i * 97) % S), toPx(318) + ((i * 53) % 20), 26, 3);
  // city ground: sidewalk slabs
  g.fillStyle = '#9a938a'; g.fillRect(toPx(-270), toPx(-270), toPx(270) - toPx(-270), toPx(270) - toPx(-270));
  // roads
  g.fillStyle = '#33373d';
  for (const r of roadCenters()) {
    g.fillRect(toPx(r - ROAD_HALF), toPx(-270), toPx(r + ROAD_HALF) - toPx(r - ROAD_HALF), toPx(270) - toPx(-270));
    g.fillRect(toPx(-270), toPx(r - ROAD_HALF), toPx(270) - toPx(-270), toPx(r + ROAD_HALF) - toPx(r - ROAD_HALF));
  }
  // lane dashes
  g.fillStyle = '#e8c84a';
  for (const r of roadCenters()) {
    for (let v = -260; v < 270; v += 20) {
      g.fillRect(toPx(r) - 1.5, toPx(v), 3, 10);
      g.fillRect(toPx(v), toPx(r) - 1.5, 10, 3);
    }
  }
  // block slabs (slightly varied sidewalk tone)
  for (const bx of blockCenters()) for (const bz of blockCenters()) {
    g.fillStyle = (Math.abs(bx + bz) % 120 === 0) ? '#a39c92' : '#98918a';
    g.fillRect(toPx(bx - BLOCK_HALF), toPx(bz - BLOCK_HALF), toPx(bx + BLOCK_HALF) - toPx(bx - BLOCK_HALF), toPx(bz + BLOCK_HALF) - toPx(bz - BLOCK_HALF));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeBuildingTexture(rng) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const base = ['#2b2f38', '#3a2f2b', '#26333d', '#38332a'][Math.floor(rng() * 4)];
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 128, 10);
  // lit windows: warm / cool / dark
  for (let y = 14; y < 246; y += 18) {
    for (let x = 8; x < 120; x += 16) {
      const r = rng();
      g.fillStyle = r < 0.42 ? '#ffd98a' : r < 0.62 ? '#9fd8e8' : '#171c22';
      g.fillRect(x, y, 10, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeShopSignTexture(name, bg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#fff8e0'; g.font = 'bold 44px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name.toUpperCase(), 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Named places. Each shop sits on its own block: the shop building fills the
// block centre, the sign hangs on its south face, and `pos` is the doorway
// on the sidewalk just south of it — where the player stands.
const SHOP_DEFS = {
  liquor: { name: 'Sunset Liquor', block: [-60, -120], bg: '#7a2e1d' },
  palmRow: { name: 'Palm Row', block: [60, 0], bg: '#14532d' },
  coastMart: { name: 'Coast Mart', block: [120, -60], bg: '#1d4e6b' },
  garage: { name: 'Sunset Garage', block: [-180, 180], bg: '#5b3a0e' },
  maras: { name: "Mara's Office", block: [180, -180], bg: '#4b1d5b' },
  docks: { name: 'Solmar Docks', block: [240, 240], bg: '#143c3a' },
  hospital: { name: 'Solmar General', block: [0, -240], bg: '#5b1d24' },
  station: { name: 'Solmar PD', block: [-240, -240], bg: '#1d2f5b' },
};

export function buildCity(scene, rng) {
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  // ---- ground: one textured plane covers city, sand and water ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() })
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  // ---- buildings: one InstancedMesh; shop blocks get one big shop building ----
  const bTex = makeBuildingTexture(rng);
  const bMat = new THREE.MeshLambertMaterial({ map: bTex });
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0);
  const placements = [];
  const shopBlocks = new Set(Object.values(SHOP_DEFS).map((s) => s.block.join(',')));
  for (const bx of blockCenters()) for (const bz of blockCenters()) {
    if (shopBlocks.has(bx + ',' + bz)) {
      // one wide, low shop building filling the block centre
      placements.push({ x: bx, z: bz, w: 38, h: 11 + rng() * 4, d: 38 });
      colliders.push({ minX: bx - 19, maxX: bx + 19, minZ: bz - 19, maxZ: bz + 19 });
      continue;
    }
    const n = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const w = 12 + rng() * 14, d = 12 + rng() * 14;
      const ox = (rng() - 0.5) * (BLOCK_HALF * 2 - w - 4);
      const oz = (rng() - 0.5) * (BLOCK_HALF * 2 - d - 4);
      const h = 8 + rng() * rng() * 32;
      const x = bx + ox, z = bz + oz;
      placements.push({ x, z, w, h, d });
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    }
  }
  const buildings = new THREE.InstancedMesh(bGeo, bMat, placements.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
  placements.forEach((p, i) => {
    pv.set(p.x, 0, p.z); sc.set(p.w, p.h, p.d);
    m4.compose(pv, q, sc);
    buildings.setMatrixAt(i, m4);
  });
  buildings.instanceMatrix.needsUpdate = true;
  group.add(buildings);

  // ---- distant skyline silhouettes ----
  const skyMat = new THREE.MeshLambertMaterial({ color: 0x5d7488 });
  const skyGeo = new THREE.BoxGeometry(1, 1, 1); skyGeo.translate(0, 0.5, 0);
  const sky = new THREE.InstancedMesh(skyGeo, skyMat, 18);
  for (let i = 0; i < 18; i++) {
    const ang = (i / 18) * Math.PI * 2 + rng() * 0.2;
    const r = 380 + rng() * 90;
    pv.set(Math.cos(ang) * r, 0, Math.sin(ang) * r - 40);
    sc.set(30 + rng() * 40, 55 + rng() * 110, 30 + rng() * 40);
    m4.compose(pv, q, sc);
    sky.setMatrixAt(i, m4);
  }
  sky.instanceMatrix.needsUpdate = true;
  group.add(sky);

  // ---- palms along sidewalks and the beach ----
  const palmSpots = [];
  for (let i = 0; i < 46; i++) {
    const r = roadCenters()[Math.floor(rng() * 10)];
    const along = -260 + rng() * 520;
    const side = rng() < 0.5 ? -1 : 1;
    if (rng() < 0.5) palmSpots.push({ x: r + side * 10.5, z: along });
    else palmSpots.push({ x: along, z: r + side * 10.5 });
  }
  for (let i = 0; i < 14; i++) palmSpots.push({ x: -260 + rng() * 520, z: 282 + rng() * 16 });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 5.5, 6); trunkGeo.translate(0, 2.75, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x7a5230 }), palmSpots.length);
  const crownGeo = new THREE.IcosahedronGeometry(2.1, 0); crownGeo.scale(1, 0.55, 1); crownGeo.translate(0, 6.2, 0);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0x2f8f4e }), palmSpots.length);
  palmSpots.forEach((p, i) => {
    pv.set(p.x, 0, p.z); sc.set(1, 0.9 + rng() * 0.35, 1);
    m4.compose(pv, q, sc); trunks.setMatrixAt(i, m4); crowns.setMatrixAt(i, m4);
  });
  trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
  group.add(trunks); group.add(crowns);

  // ---- streetlights ----
  const lightSpots = [];
  for (const r of roadCenters()) for (let v = -240; v <= 240; v += 60) {
    lightSpots.push({ x: r + 9, z: v });
    lightSpots.push({ x: v, z: r + 9 });
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6.5, 5); poleGeo.translate(0, 3.25, 0);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x2c313a }), lightSpots.length);
  const headGeo = new THREE.SphereGeometry(0.32, 6, 5); headGeo.translate(0, 6.6, 0);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), lightSpots.length);
  lightSpots.forEach((p, i) => {
    pv.set(p.x, 0, p.z); sc.set(1, 1, 1);
    m4.compose(pv, q, sc); poles.setMatrixAt(i, m4); heads.setMatrixAt(i, m4);
  });
  poles.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
  group.add(poles); group.add(heads);

  // ---- named shops: sign on the south face, awning over the doorway ----
  const shops = {};
  for (const key of Object.keys(SHOP_DEFS)) {
    const def = SHOP_DEFS[key];
    const [bx, bz] = def.block;
    const door = { x: bx, z: bz + 26 }; // sidewalk just south of the shop block
    shops[key] = { name: def.name, pos: door, block: { x: bx, z: bz } };
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 3),
      new THREE.MeshBasicMaterial({ map: makeShopSignTexture(def.name, def.bg) })
    );
    sign.position.set(bx, 8, bz + 19.3);
    group.add(sign);
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(18, 0.4, 4),
      new THREE.MeshLambertMaterial({ color: 0x30343c })
    );
    awning.position.set(bx, 4.6, bz + 21);
    group.add(awning);
  }

  // ---- docks: piers and crates reaching into the water ----
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2c });
  for (let i = 0; i < 3; i++) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 26), pierMat);
    pier.position.set(210 + i * 22, 0.6, 300);
    group.add(pier);
  }
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x8a6b35 });
  for (let i = 0; i < 8; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), crateMat);
    crate.position.set(196 + rng() * 80, 1.5, 282 + rng() * 12);
    crate.rotation.y = rng() * Math.PI;
    group.add(crate);
  }

  // ---- collision: push a circle out of every building AABB ----
  function resolveCircle(pos, radius) {
    for (const b of colliders) {
      const cx = clamp(pos.x, b.minX, b.maxX);
      const cz = clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius;
          pos.z = cz + (dz / d) * radius;
        } else {
          const pl = pos.x - b.minX, pr = b.maxX - pos.x, pt = pos.z - b.minZ, pb = b.maxZ - pos.z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) pos.x = b.minX - radius;
          else if (m === pr) pos.x = b.maxX + radius;
          else if (m === pt) pos.z = b.minZ - radius;
          else pos.z = b.maxZ + radius;
        }
      }
    }
  }

  return {
    group, colliders, shops, resolveCircle,
    spawn: { x: 84, z: 20, heading: Math.PI },
    hospitalPos: { x: 0, z: -214 },
    stationPos: { x: -240, z: -214 },
  };
}
