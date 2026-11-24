// SOLMAR CITY — the city itself: a 9x9 block grid on a golden-hour coast.
// The beach road runs along the south edge, sand and ocean beyond it, the
// docks to the east, a skyline ringing the horizon. The layout is seeded
// (?seed=), so the same seed always builds the same streets.
import * as THREE from 'three';
import { clamp } from './util.js';

export const PITCH = 60; // one block + one road
export const EDGE = 270; // roads run -270..270
export const ROAD_HALF = 7; // half a road's width
export const BLOCK_HALF = 23; // half a block's width
export const BEACH_ROAD_Z = 270; // southernmost road, along the sand
export const SHORE_LINE = 312; // sand gives way to the sea here

export function streetLines() {
  const out = [];
  for (let i = -4; i <= 5; i++) out.push(i * PITCH - 30);
  return out; // -270, -210, ..., 270
}

export function blockSpots() {
  const out = [];
  for (let i = -4; i <= 4; i++) out.push(i * PITCH);
  return out; // -240, -180, ..., 240
}

// District name for the HUD location line, by where the player stands.
export function districtAt(x, z) {
  if (z >= 262) return 'KUMALA STRAND · Solmar Beach';
  if (x >= 150) return 'THE DOCKS · East Solmar';
  if (x <= -150) return 'OLD TOWN · West Solmar';
  if (z <= -150) return 'NORTH HILLS · Uptown';
  if (z >= 30) return 'PALM ROW · South Solmar';
  return 'DOWNTOWN · Solmar City';
}

// ---- canvas-painted textures -----------------------------------------------

// One 1024px top-down painting of the whole map: dry grass, the city slab,
// roads with dashes, block slabs in two tones, sand, then the ocean.
function paintMapTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const toPx = (v) => ((v + 350) / 700) * S; // world -350..350 -> canvas
  g.fillStyle = '#b3925e';
  g.fillRect(0, 0, S, S); // dry grass outside the grid
  g.fillStyle = '#9a938a';
  g.fillRect(toPx(-270), toPx(-270), toPx(270) - toPx(-270), toPx(270) - toPx(-270));
  g.fillStyle = '#33373d';
  for (const r of streetLines()) {
    g.fillRect(toPx(r - ROAD_HALF), toPx(-270), toPx(r + ROAD_HALF) - toPx(r - ROAD_HALF), toPx(270) - toPx(-270));
    g.fillRect(toPx(-270), toPx(r - ROAD_HALF), toPx(270) - toPx(-270), toPx(r + ROAD_HALF) - toPx(r - ROAD_HALF));
  }
  g.fillStyle = '#e8c84a'; // warm centre dashes
  for (const r of streetLines()) {
    for (let v = -260; v < 270; v += 20) {
      g.fillRect(toPx(r) - 1.5, toPx(v), 3, 10);
      g.fillRect(toPx(v), toPx(r) - 1.5, 10, 3);
    }
  }
  for (const bx of blockSpots()) {
    for (const bz of blockSpots()) {
      g.fillStyle = (bx + bz) % 120 === 0 ? '#a39c92' : '#948d84';
      g.fillRect(toPx(bx - BLOCK_HALF), toPx(bz - BLOCK_HALF),
        toPx(bx + BLOCK_HALF) - toPx(bx - BLOCK_HALF), toPx(bz + BLOCK_HALF) - toPx(bz - BLOCK_HALF));
    }
  }
  g.fillStyle = '#e8d29a';
  g.fillRect(0, toPx(272), S, toPx(SHORE_LINE) - toPx(272)); // sand
  g.fillStyle = '#2e7fa8';
  g.fillRect(0, toPx(SHORE_LINE), S, S - toPx(SHORE_LINE)); // sea
  g.fillStyle = 'rgba(255,255,255,0.28)'; // foam streaks
  for (let i = 0; i < 26; i++) {
    g.fillRect((i * 97) % S, toPx(318) + ((i * 53) % 20), 26, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// One lit facade, shared by every building: golden-hour windows.
function paintFacade(rng) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  const base = ['#2b2f38', '#3a2f2b', '#26333d', '#38332a'][Math.floor(rng() * 4)];
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 0, 128, 10);
  for (let y = 14; y < 246; y += 18) {
    for (let x = 8; x < 120; x += 16) {
      const r = rng();
      g.fillStyle = r < 0.48 ? '#ffd98a' : r < 0.66 ? '#9fd8e8' : '#171c22';
      g.fillRect(x, y, 10, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function paintSign(name, bg) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#fff8e0';
  g.font = 'bold 44px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name.toUpperCase(), 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Named places. Each shop owns one block: the building fills the block
// centre, the sign hangs on its south face, and `pos` is the doorway on the
// sidewalk just south of it — where the player stands to rob it.
const PLACES = [
  { key: 'liquor', name: 'Sunset Liquor', bx: -60, bz: -120, bg: '#7a2e1d' },
  { key: 'palmRow', name: 'Palm Row', bx: 60, bz: 0, bg: '#14532d' },
  { key: 'coastMart', name: 'Coast Mart', bx: 120, bz: -60, bg: '#1d4e6b' },
  { key: 'garage', name: 'Sunset Garage', bx: -180, bz: 180, bg: '#5b3a0e' },
  { key: 'maras', name: "Mara's Office", bx: 180, bz: -180, bg: '#4b1d5b' },
  { key: 'docks', name: 'Solmar Docks', bx: 240, bz: 240, bg: '#143c3a' },
  { key: 'hospital', name: 'Solmar General', bx: 0, bz: -240, bg: '#5b1d24' },
  { key: 'station', name: 'Solmar PD', bx: -240, bz: -240, bg: '#1d2f5b' },
];

export function buildCity(scene, rng) {
  const solids = []; // AABBs the collision pass pushes circles out of
  const group = new THREE.Group();
  scene.add(group);

  // ---- ground: one textured plane covers streets, sand and sea ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshLambertMaterial({ map: paintMapTexture() })
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  // ---- buildings: one InstancedMesh; shop blocks get one wide low shop ----
  const facadeMat = new THREE.MeshLambertMaterial({ map: paintFacade(rng) });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  unitBox.translate(0, 0.5, 0);
  const footprints = [];
  const shopKeys = new Set(PLACES.map((p) => p.bx + ',' + p.bz));
  for (const bx of blockSpots()) {
    for (const bz of blockSpots()) {
      if (shopKeys.has(bx + ',' + bz)) {
        footprints.push({ x: bx, z: bz, w: 38, h: 11 + rng() * 4, d: 38 });
        solids.push({ minX: bx - 19, maxX: bx + 19, minZ: bz - 19, maxZ: bz + 19 });
        continue;
      }
      const count = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < count; k++) {
        const w = 12 + rng() * 14;
        const d = 12 + rng() * 14;
        const ox = (rng() - 0.5) * (BLOCK_HALF * 2 - w - 4);
        const oz = (rng() - 0.5) * (BLOCK_HALF * 2 - d - 4);
        const h = 8 + rng() * rng() * 32;
        const x = bx + ox;
        const z = bz + oz;
        footprints.push({ x, z, w, h, d });
        solids.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
    }
  }
  const buildings = new THREE.InstancedMesh(unitBox, facadeMat, footprints.length);
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const pos = new THREE.Vector3();
  footprints.forEach((p, i) => {
    pos.set(p.x, 0, p.z);
    scale.set(p.w, p.h, p.d);
    m4.compose(pos, quat, scale);
    buildings.setMatrixAt(i, m4);
  });
  buildings.instanceMatrix.needsUpdate = true;
  group.add(buildings);

  // ---- far skyline silhouettes ringing the city ----
  const skyMat = new THREE.MeshLambertMaterial({ color: 0x6b5a6e });
  const skyGeo = new THREE.BoxGeometry(1, 1, 1);
  skyGeo.translate(0, 0.5, 0);
  const skyline = new THREE.InstancedMesh(skyGeo, skyMat, 18);
  for (let i = 0; i < 18; i++) {
    const ang = (i / 18) * Math.PI * 2 + rng() * 0.2;
    const r = 380 + rng() * 90;
    pos.set(Math.cos(ang) * r, 0, Math.sin(ang) * r - 40);
    scale.set(30 + rng() * 40, 55 + rng() * 110, 30 + rng() * 40);
    m4.compose(pos, quat, scale);
    skyline.setMatrixAt(i, m4);
  }
  skyline.instanceMatrix.needsUpdate = true;
  group.add(skyline);

  // ---- palms: along sidewalks everywhere, thicker on the beach ----
  const palmSpots = [];
  for (let i = 0; i < 46; i++) {
    const r = streetLines()[Math.floor(rng() * 10)];
    const along = -260 + rng() * 520;
    const side = rng() < 0.5 ? -1 : 1;
    if (rng() < 0.5) palmSpots.push({ x: r + side * 10.5, z: along });
    else palmSpots.push({ x: along, z: r + side * 10.5 });
  }
  for (let i = 0; i < 18; i++) {
    palmSpots.push({ x: -260 + rng() * 520, z: 282 + rng() * 16 });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 5.5, 6);
  trunkGeo.translate(0, 2.75, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x7a5230 }), palmSpots.length);
  const crownGeo = new THREE.IcosahedronGeometry(2.1, 0);
  crownGeo.scale(1, 0.55, 1);
  crownGeo.translate(0, 6.2, 0);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0x2f8f4e }), palmSpots.length);
  palmSpots.forEach((p, i) => {
    pos.set(p.x, 0, p.z);
    scale.set(1, 0.9 + rng() * 0.35, 1);
    m4.compose(pos, quat, scale);
    trunks.setMatrixAt(i, m4);
    crowns.setMatrixAt(i, m4);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  group.add(trunks);
  group.add(crowns);

  // ---- streetlights at every other intersection ----
  const lampSpots = [];
  for (const r of streetLines()) {
    for (let v = -240; v <= 240; v += 60) {
      lampSpots.push({ x: r + 9, z: v });
      lampSpots.push({ x: v, z: r + 9 });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6.5, 5);
  poleGeo.translate(0, 3.25, 0);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x2c313a }), lampSpots.length);
  const headGeo = new THREE.SphereGeometry(0.32, 6, 5);
  headGeo.translate(0, 6.6, 0);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), lampSpots.length);
  lampSpots.forEach((p, i) => {
    pos.set(p.x, 0, p.z);
    scale.set(1, 1, 1);
    m4.compose(pos, quat, scale);
    poles.setMatrixAt(i, m4);
    heads.setMatrixAt(i, m4);
  });
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  group.add(poles);
  group.add(heads);

  // ---- named shops: sign on the south face, awning over the doorway ----
  const shops = {};
  for (const def of PLACES) {
    shops[def.key] = { name: def.name, pos: { x: def.bx, z: def.bz + 26 }, block: { x: def.bx, z: def.bz } };
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 3),
      new THREE.MeshBasicMaterial({ map: paintSign(def.name, def.bg) })
    );
    sign.position.set(def.bx, 8, def.bz + 19.3);
    group.add(sign);
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(18, 0.4, 4),
      new THREE.MeshLambertMaterial({ color: 0x30343c })
    );
    awning.position.set(def.bx, 4.6, def.bz + 21);
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
  function pushOut(p, radius) {
    for (const b of solids) {
      const cx = clamp(p.x, b.minX, b.maxX);
      const cz = clamp(p.z, b.minZ, b.maxZ);
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * radius;
          p.z = cz + (dz / d) * radius;
        } else {
          const left = p.x - b.minX;
          const right = b.maxX - p.x;
          const top = p.z - b.minZ;
          const bottom = b.maxZ - p.z;
          const m = Math.min(left, right, top, bottom);
          if (m === left) p.x = b.minX - radius;
          else if (m === right) p.x = b.maxX + radius;
          else if (m === top) p.z = b.minZ - radius;
          else p.z = b.maxZ + radius;
        }
      }
    }
  }

  return {
    group,
    solids,
    shops,
    pushOut,
    spawn: { x: 84, z: 20, heading: Math.PI },
    hospitalPos: { x: 0, z: -214 },
    stationPos: { x: -240, z: -214 },
    beach: { roadZ: BEACH_ROAD_Z, sandTop: SHORE_LINE },
  };
}
