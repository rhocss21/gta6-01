// SOLMAR CITY — HUD, toasts, prompts, damage flash, screens, and the live
// 2D minimap (roads, buildings, player, traffic, police, mission marker).
import { el } from './util.js';

const RANKS = ['ROOKIE', 'HUSTLER', 'WHEELMAN', 'ENFORCER', 'SHOT-CALLER', 'KING OF SOLMAR'];

export function initHUD(G) {
  G.hud = {
    els: {
      hud: el('hud'),
      cash: el('cash'),
      healthBar: el('health-bar'),
      healthText: el('health-text'),
      ammo: el('ammo'),
      stars: el('stars'),
      rank: el('rank'),
      objArrow: el('obj-arrow'),
      objText: el('obj-text'),
      objDist: el('obj-dist'),
      speed: el('speed'),
      prompt: el('prompt'),
      toasts: el('toasts'),
      minimap: el('minimap'),
      crosshair: el('crosshair'),
      rob: el('rob-progress'),
      robFill: el('rob-fill'),
      flash: el('flash'),
      menu: el('menu'),
      pause: el('pause'),
      busted: el('busted'),
      wasted: el('wasted'),
    },
    last: {},
  };
  G.hud.updateStars = () => updateStars(G);
  G.hud.toast = (msg, kind) => toast(G, msg, kind);
  G.hud.flashDamage = () => flashDamage(G);
  G.hud.showScreen = (name) => showScreen(G, name);
  G.hud.showRobProgress = (frac) => showRobProgress(G, frac);
  G.hud.showBustProgress = (frac) => showBustProgress(G, frac);
  G.hud.setPrompt = (html) => setPrompt(G, html);
  updateStars(G);
}

function updateStars(G) {
  const w = G.police.wanted;
  let html = '';
  for (let i = 0; i < 5; i++) {
    html += `<span class="${i < w ? 'lit' : 'dim'}">★</span>`;
  }
  G.hud.els.stars.innerHTML = html;
  G.hud.els.rank.textContent = RANKS[Math.min(w, 5)];
}

function toast(G, msg, kind = '') {
  const box = G.hud.els.toasts;
  const div = document.createElement('div');
  div.className = `toast ${kind}`;
  div.textContent = msg;
  box.appendChild(div);
  while (box.children.length > 4) box.removeChild(box.firstChild);
  setTimeout(() => div.remove(), 5200);
}

function flashDamage(G) {
  const f = G.hud.els.flash;
  f.style.opacity = '1';
  setTimeout(() => { f.style.opacity = '0'; }, 140);
}

function showScreen(G, name) {
  const e = G.hud.els;
  e.menu.classList.toggle('hidden', name !== 'menu');
  e.pause.classList.toggle('hidden', name !== 'pause');
  e.busted.classList.toggle('hidden', name !== 'busted');
  e.wasted.classList.toggle('hidden', name !== 'wasted');
  e.hud.classList.toggle('hidden', name === 'menu' || name === 'busted' || name === 'wasted');
  if (name === 'menu') e.hud.classList.add('hidden');
}

function showRobProgress(G, frac) {
  const e = G.hud.els;
  if (frac <= 0) {
    e.rob.classList.add('hidden');
    return;
  }
  e.rob.classList.remove('hidden');
  e.robFill.style.width = `${Math.round(frac * 100)}%`;
}

function showBustProgress(G, frac) {
  G.hudBustFrac = frac;
  if (frac <= 0) return; // main loop owns the prompt when no bust is building
  setPrompt(G, '⚠ A COP IS GRABBING YOU — BREAK FREE!');
}

function setPrompt(G, html) {
  const p = G.hud.els.prompt;
  if (!html) {
    p.classList.add('hidden');
    return;
  }
  p.innerHTML = html;
  p.classList.remove('hidden');
}

// Per-frame HUD refresh. DOM writes are cached so steady values cost nothing.
export function updateHUD(G) {
  const e = G.hud.els;
  const L = G.hud.last;
  const set = (key, fn, val) => {
    if (L[key] !== val) {
      L[key] = val;
      fn();
    }
  };
  set('cash', () => { e.cash.textContent = `$${G.cash.toLocaleString('en-US')}`; }, G.cash);
  set('health', () => {
    e.healthBar.style.width = `${G.health}%`;
    e.healthText.textContent = Math.ceil(G.health);
  }, Math.ceil(G.health));
  const ammoText = G.combat.reloading
    ? 'RELOADING…'
    : `PISTOL ${G.combat.ammo}/${G.combat.magSize}`;
  set('ammo', () => { e.ammo.textContent = ammoText; }, ammoText);

  const obj = G.missions.currentObjective(G);
  set('obj', () => { e.objText.textContent = obj.text; }, obj.text);
  let distText = '';
  let arrowDeg = 0;
  if (obj.target) {
    const pos = G.inCar && G.playerCar ? G.playerCar.mesh.position : G.playerMesh.position;
    const d = Math.hypot(obj.target.x - pos.x, obj.target.z - pos.z);
    distText = `${Math.round(d)}m`;
    const worldAngle = Math.atan2(obj.target.x - pos.x, obj.target.z - pos.z);
    arrowDeg = (worldAngle - G.camYaw) * (180 / Math.PI);
  }
  set('dist', () => { e.objDist.textContent = distText; }, distText);
  e.objArrow.style.transform = `rotate(${arrowDeg}deg)`;

  if (G.inCar && G.playerCar) {
    e.speed.classList.remove('hidden');
    const mph = Math.round(Math.abs(G.playerCar.speed) * 2.2);
    set('speed', () => { e.speed.innerHTML = `${mph} <small>mph</small>`; }, mph);
    e.crosshair.classList.add('hidden');
  } else {
    e.speed.classList.add('hidden');
    e.crosshair.classList.remove('hidden');
  }

  drawMinimap(G);
}

function drawMinimap(G) {
  // Throttled to ~1 Hz: a minimap does not need 60 Hz, and repainting its
  // bitmap every frame costs more than the 3D scene in software rendering.
  // Static streets are pre-rendered once; each refresh only blits the
  // visible window + dots.
  const now = performance.now();
  const px = G.inCar && G.playerCar ? G.playerCar.mesh.position.x : G.playerMesh.position.x;
  const pz = G.inCar && G.playerCar ? G.playerCar.mesh.position.z : G.playerMesh.position.z;
  const moved = Math.hypot(px - (G.hud.lastMapX ?? px), pz - (G.hud.lastMapZ ?? pz));
  if (now - (G.hud.lastMapAt ?? 0) < 1000 && moved < 25) return;
  G.hud.lastMapAt = now;
  G.hud.lastMapX = px;
  G.hud.lastMapZ = pz;

  const cv = G.hud.els.minimap;
  const ctx = cv.getContext('2d');
  const S = 200;
  const scale = S / 440; // world 440 wide, centred on the player
  if (!G.hud.mapStatic) G.hud.mapStatic = buildStaticMap(G);
  // Static layer is 440x440 (1 px per world unit); blit the 440-unit window
  // centred on the player, scaled down to the 200px canvas.
  ctx.clearRect(0, 0, S, S);
  ctx.drawImage(G.hud.mapStatic, px, pz, 440, 440, 0, 0, S, S);
  const toX = (x) => S / 2 + (x - px) * scale;
  const toZ = (z) => S / 2 + (z - pz) * scale;

  // Mission target.
  const obj = G.missions.currentObjective(G);
  if (obj.target) {
    const pulse = 5 + Math.sin(G.time * 4) * 2;
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.arc(toX(obj.target.x), toZ(obj.target.z), pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Traffic (yellow), police (blue/red), player (white arrow).
  ctx.fillStyle = '#ffe135';
  for (const car of G.trafficCars) {
    ctx.fillRect(toX(car.mesh.position.x) - 2, toZ(car.mesh.position.z) - 2, 4, 4);
  }
  for (const car of G.policeCars) {
    ctx.fillStyle = '#4a90ff';
    ctx.beginPath();
    ctx.arc(toX(car.mesh.position.x), toZ(car.mesh.position.z), 4, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const cop of G.footCops) {
    ctx.fillStyle = '#ff5a4e';
    ctx.fillRect(toX(cop.mesh.position.x) - 2, toZ(cop.mesh.position.z) - 2, 4, 4);
  }
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate(-G.camYaw);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(6, 6);
  ctx.lineTo(-6, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// One-time render of everything on the minimap that never moves: sea, sand,
// roads and buildings, in world coordinates on a 440x440 canvas.
function buildStaticMap(G) {
  const c = document.createElement('canvas');
  c.width = 440;
  c.height = 440;
  const ctx = c.getContext('2d');
  const toX = (x) => x + 220;
  const toZ = (z) => z + 220;
  ctx.fillStyle = '#12303c';
  ctx.fillRect(0, 0, 440, 440);
  ctx.fillStyle = '#1e6f9e';
  ctx.fillRect(toX(200), 0, 240, 440);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(toX(180), 0, 20, 440);
  ctx.strokeStyle = '#3a4a52';
  ctx.lineWidth = 6;
  for (let s = -180; s <= 180; s += 40) {
    ctx.beginPath(); ctx.moveTo(toX(s), 0); ctx.lineTo(toX(s), 440); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, toZ(s)); ctx.lineTo(440, toZ(s)); ctx.stroke();
  }
  ctx.fillStyle = '#5a6a72';
  for (const b of G.colliders) {
    ctx.fillRect(toX(b.minX), toZ(b.minZ), b.maxX - b.minX, b.maxZ - b.minZ);
  }
  return c;
}
