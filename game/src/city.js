// SOLMAR CITY — the city itself: grid streets, procedural buildings, palms,
// lamps, beach + ocean, and the landmarks the story hangs on. All geometry is
// generated from a fixed seed, so the map is identical on every load.
import * as THREE from 'three';
import { canvasTexture, mulberry32, randi } from './util.js';

export const WORLD = 200; // half-extent of the playable square
export const STREET_STEP = 40;
export const LANDMARKS = {
  garage: { x: -160, z: 80, name: 'Sunset Garage' },
  club: { x: 120, z: -120, name: 'Neon Palms Club' },
  shops: [
    { x: -40, z: 120, name: 'Sunset Liquor' },
    { x: 40, z: 40, name: 'Palm Pawn' },
    { x: 120, z: 120, name: 'Neon Deli' },
  ],
  checkpoints: [
    { x: 170, z: 120 },
    { x: 170, z: -120 },
    { x: -120, z: -160 },
  ],
};

// Blocks that hold a landmark building instead of random blocks.
const RESERVED = new Set([
  '-160,80', '120,-120', '-40,120', '40,40', '120,120',
]);

function windowTexture() {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#2b3a44';
    g.fillRect(0, 0, w, h);
    for (let y = 10; y < h - 10; y += 22) {
      for (let x = 8; x < w - 8; x += 18) {
        const lit = Math.random() < 0.45;
        g.fillStyle = lit ? (Math.random() < 0.5 ? '#ffd98a' : '#9be7ff') : '#141d24';
        g.fillRect(x, y, 12, 14);
      }
    }
  });
}

function makeSign(text, color) {
  const tex = canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = '#101418';
    g.fillRect(0, 0, w, h);
    g.fillStyle = color;
    g.font = 'bold 30px Trebuchet MS, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2);
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 3.5),
    new THREE.MeshBasicMaterial({ map: tex }),
  );
  return mesh;
}

export function buildCity(G) {
  const scene = G.scene;
  const rng = mulberry32(20261117);
  G.colliders = [];

  // Sky, sun, fog — late-afternoon coastal light.
  scene.background = new THREE.Color(0x87bfe0);
  scene.fog = new THREE.Fog(0x9fc6dd, 120, 420);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0b0, 1.9);
  sun.position.set(120, 180, 60);
  scene.add(sun);

  // Ground: warm asphalt-grey base for the whole island.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD * 2 + 80, WORLD * 2 + 80),
    new THREE.MeshLambertMaterial({ color: 0x9a938a }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Roads: dark strips on every grid line, with a pale centre dash texture.
  const roadTex = canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = '#33383d';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#d8c95a';
    g.fillRect(w / 2 - 2, 0, 4, 18);
  });
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  for (let c = -180; c <= 180; c += STREET_STEP) {
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(400, 12), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = horizontal ? 0 : Math.PI / 2;
      road.position.set(horizontal ? 0 : c, 0.02, horizontal ? c : 0);
      // Repeat the dash texture along the road length.
      const tex = roadTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(400 / 12, 1);
      road.material = new THREE.MeshLambertMaterial({ map: tex });
      scene.add(road);
    }
  }

  // Beach (east edge) + ocean beyond it.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 400),
    new THREE.MeshLambertMaterial({ color: 0xe8d29a }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(190, 0.03, 0);
  scene.add(sand);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 460),
    new THREE.MeshLambertMaterial({ color: 0x1e6f9e }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(350, -0.4, 0);
  scene.add(ocean);

  // Buildings: 1–3 per block, heights 8–42, window texture, tinted facades.
  const winTex = windowTexture();
  const facadeColors = [0xd8c9a8, 0xc9b8a0, 0xb8c4cc, 0xd8a88a, 0xa8b8a0, 0xe0d0b8];
  let buildingCount = 0;
  for (let bx = -160; bx <= 160; bx += STREET_STEP) {
    for (let bz = -160; bz <= 160; bz += STREET_STEP) {
      if (RESERVED.has(`${bx},${bz}`)) continue;
      if (rng() < 0.3) continue; // open lots keep the city breathable (and cheap)
      const n = 1 + (rng() < 0.25 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const w = 10 + rng() * 12;
        const d = 10 + rng() * 12;
        const h = 8 + rng() * 34;
        const ox = (rng() - 0.5) * (28 - w);
        const oz = (rng() - 0.5) * (28 - d);
        const x = bx + ox;
        const z = bz + oz;
        const mat = new THREE.MeshLambertMaterial({
          map: winTex,
          color: facadeColors[Math.floor(rng() * facadeColors.length)],
        });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(x, h / 2, z);
        scene.add(b);
        G.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        buildingCount++;
      }
    }
  }
  G.buildingCount = buildingCount;

  // Landmark: Sunset Garage — low wide workshop with a sign.
  addLandmarkBuilding(G, LANDMARKS.garage.x, LANDMARKS.garage.z, 26, 9, 18, 0x7a6a55, 'SUNSET GARAGE', '#ffd23e');
  // Landmark: Mara's club — dark facade, magenta neon sign.
  addLandmarkBuilding(G, LANDMARKS.club.x, LANDMARKS.club.z, 22, 16, 16, 0x2c2140, 'NEON PALMS', '#ff5ad0');
  // Shops for the heist.
  for (const s of LANDMARKS.shops) {
    addLandmarkBuilding(G, s.x, s.z, 14, 7, 12, 0x8a6a4a, s.name.toUpperCase(), '#7dff9b');
  }

  // Palms: along the beach and scattered on sidewalks.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8a4a });
  const palmSpots = [];
  for (let z = -180; z <= 180; z += 30) palmSpots.push([182, z + 6]);
  for (let i = 0; i < 16; i++) {
    palmSpots.push([Math.floor(randi(-4, 4)) * 40 + 16, Math.floor(randi(-4, 4)) * 40 + 16]);
  }
  for (const [x, z] of palmSpots) {
    // Two meshes per palm (trunk + canopy cone) to stay cheap in software rendering.
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 7, 6), trunkMat);
    trunk.position.y = 3.5;
    trunk.rotation.z = 0.12;
    palm.add(trunk);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.2, 7), leafMat);
    canopy.position.y = 7.4;
    palm.add(canopy);
    palm.position.set(x, 0, z);
    scene.add(palm);
  }

  // Street lamps at intersections.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x30363c });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let x = -160; x <= 160; x += 160) {
    for (let z = -160; z <= 160; z += 160) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 6, 6), poleMat);
      pole.position.set(x + 8, 3, z + 8);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), bulbMat);
      bulb.position.set(x + 8, 6.2, z + 8);
      scene.add(bulb);
    }
  }

  // A few distant skyline silhouettes outside the playable square.
  const skyMat = new THREE.MeshLambertMaterial({ color: 0x6a7a8c });
  for (let i = 0; i < 14; i++) {
    const h = 40 + rng() * 60;
    const s = new THREE.Mesh(new THREE.BoxGeometry(18, h, 18), skyMat);
    const side = i % 2 === 0 ? -1 : 1;
    s.position.set(side * (215 + rng() * 40), h / 2, -220 + i * 34);
    scene.add(s);
  }
}

function addLandmarkBuilding(G, x, z, w, h, d, color, signText, signColor) {
  const b = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  b.position.set(x, h / 2, z);
  G.scene.add(b);
  const sign = makeSign(signText, signColor);
  sign.position.set(x, h + 2.4, z + d / 2 + 0.2);
  G.scene.add(sign);
  G.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
}

// Push a circle (x, z, radius r) out of every building AABB it overlaps and
// clamp it inside the island. Returns the corrected position.
export function resolveCircle(G, x, z, r) {
  for (const c of G.colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const pl = x - c.minX + r;
        const pr = c.maxX - x + r;
        const pt = z - c.minZ + r;
        const pb = c.maxZ - z + r;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - r;
        else if (m === pr) x = c.maxX + r;
        else if (m === pt) z = c.minZ - r;
        else z = c.maxZ + r;
      }
    }
  }
  x = Math.max(-WORLD + 2, Math.min(WORLD - 2, x));
  z = Math.max(-WORLD + 2, Math.min(WORLD - 2, z));
  return { x, z };
}

export function isOnRoad(x, z) {
  // Streets run at -180, -140, …, 180, i.e. offset 20 (mod 40) after +200.
  const near = (v) => {
    const m = (((v + 200) % STREET_STEP) + STREET_STEP) % STREET_STEP;
    return Math.abs(m - 20) <= 7;
  };
  return near(x) || near(z);
}
