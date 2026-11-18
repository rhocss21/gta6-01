// Solmar City — the HUD: money, health, ammo, wanted stars, rank, mission banner,
// live minimap (static city layer + blips at ~10 Hz), toasts, prompts, vignette.
import { fmtMoney, clamp } from './util.js';
import { WANTED_RANKS } from './police.js';
import { blockCenters, roadCenters } from './city.js';

export class Hud {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      money: document.getElementById('money'),
      healthFill: document.getElementById('health-fill'),
      healthNum: document.getElementById('health-num'),
      ammo: document.getElementById('ammo'),
      debt: document.getElementById('debt'),
      missionText: document.getElementById('mission-text'),
      missionDist: document.getElementById('mission-dist'),
      stars: document.getElementById('stars'),
      rank: document.getElementById('rank'),
      crosshair: document.getElementById('crosshair'),
      speed: document.getElementById('speed'),
      speedNum: document.getElementById('speed-num'),
      prompt: document.getElementById('prompt'),
      robWrap: document.getElementById('rob-wrap'),
      robFill: document.getElementById('rob-fill'),
      toasts: document.getElementById('toasts'),
      minimap: document.getElementById('minimap'),
      vignette: document.getElementById('vignette'),
      menu: document.getElementById('menu'),
      pause: document.getElementById('pause'),
      busted: document.getElementById('busted'),
      wasted: document.getElementById('wasted'),
      complete: document.getElementById('complete'),
      btnContinue: document.getElementById('btn-continue'),
      btnMute: document.getElementById('btn-mute'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this.mmTimer = 0;
    this.buildMinimapBase();
  }

  // The static city layer of the minimap, painted once.
  buildMinimapBase() {
    const c = document.createElement('canvas'); c.width = 360; c.height = 360;
    const g = c.getContext('2d');
    const toPx = (v) => ((v + 300) / 600) * 360;
    g.fillStyle = '#0c2733'; g.fillRect(0, 0, 360, 360);
    // water + sand at the south edge
    g.fillStyle = '#2e7fa8'; g.fillRect(0, toPx(300), 360, 360 - toPx(300));
    g.fillStyle = '#e8d29a'; g.fillRect(0, toPx(272), 360, toPx(300) - toPx(272));
    // blocks
    g.fillStyle = '#274b5e';
    for (const bx of blockCenters()) for (const bz of blockCenters()) {
      g.fillRect(toPx(bx - 23), toPx(bz - 23), toPx(bx + 23) - toPx(bx - 23), toPx(bz + 23) - toPx(bz - 23));
    }
    // roads
    g.fillStyle = '#5d7d8f';
    for (const r of roadCenters()) {
      g.fillRect(toPx(r - 7), toPx(-270), toPx(r + 7) - toPx(r - 7), toPx(270) - toPx(-270));
      g.fillRect(toPx(-270), toPx(r - 7), toPx(270) - toPx(-270), toPx(r + 7) - toPx(r - 7));
    }
    this.mmBase = c;
  }

  showHud(show) { this.el.hud.classList.toggle('hidden', !show); }
  showOverlay(name) {
    for (const k of ['menu', 'pause', 'busted', 'wasted', 'complete']) {
      this.el[k].classList.toggle('hidden', k !== name);
    }
  }
  hideOverlays() { this.showOverlay(null); }

  toast(text, kind) {
    const d = document.createElement('div');
    d.className = 'toast' + (kind === 'gold' ? ' gold' : '');
    d.textContent = text;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.remove(), 4200);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }

  setPrompt(text) {
    if (!text) { this.el.prompt.textContent = ''; this.el.prompt.style.display = 'none'; return; }
    this.el.prompt.style.display = 'block';
    this.el.prompt.innerHTML = text;
  }

  // Full HUD refresh from the live game state; minimap blips at ~10 Hz.
  update(G, dt) {
    this.el.money.textContent = fmtMoney(G.money);
    this.el.healthFill.style.width = clamp(G.player.health, 0, 100) + '%';
    this.el.healthNum.textContent = Math.ceil(G.player.health);
    this.el.ammo.textContent = G.combat.ammoText + (G.combat.reserve > 0 ? `  ·  RESERVE ${G.combat.reserve}` : '  ·  NO RESERVE');
    this.el.missionText.textContent = G.missions.bannerText();
    const t = G.missions.target;
    if (t) {
      const px = G.playerCar ? G.playerCar.pos.x : G.player.pos.x;
      const pz = G.playerCar ? G.playerCar.pos.z : G.player.pos.z;
      const d = Math.hypot(px - t.x, pz - t.z);
      this.el.missionDist.textContent = Math.round(d) + 'm';
    } else {
      this.el.missionDist.textContent = '';
    }
    const stars = this.el.stars.children;
    for (let i = 0; i < 5; i++) stars[i].classList.toggle('lit', i < G.wanted);
    this.el.rank.textContent = WANTED_RANKS[Math.min(G.missions.completed.length, 5)];
    this.el.crosshair.style.display = G.playerCar ? 'none' : 'block';
    if (G.playerCar) {
      this.el.speed.style.display = 'block';
      this.el.speedNum.textContent = Math.round(Math.abs(G.playerCar.speed) * 2.237);
    } else {
      this.el.speed.style.display = 'none';
    }
    // heist progress bar
    if (G.missions.robShop) {
      this.el.robWrap.classList.remove('hidden');
      this.el.robFill.style.width = Math.round(G.missions.robProgress * 100) + '%';
    } else {
      this.el.robWrap.classList.add('hidden');
    }
    // damage vignette fades after a hit
    const sinceHit = G.now - G.player.lastDamageAt;
    this.el.vignette.style.opacity = sinceHit < 1.2 ? String(0.9 - sinceHit * 0.7) : '0';

    this.mmTimer += dt;
    if (this.mmTimer > 0.1) {
      this.mmTimer = 0;
      this.drawMinimap(G);
    }
  }

  drawMinimap(G) {
    const g = this.mm;
    const W = 360;
    const toPx = (v) => ((v + 300) / 600) * W;
    g.clearRect(0, 0, W, W);
    g.drawImage(this.mmBase, 0, 0);
    const dot = (x, z, r, color) => {
      g.fillStyle = color;
      g.beginPath(); g.arc(toPx(x), toPx(z), r, 0, Math.PI * 2); g.fill();
    };
    // mission target: pulsing yellow diamond
    const t = G.missions.target;
    if (t) {
      const pulse = 6 + Math.sin(performance.now() * 0.006) * 2;
      g.fillStyle = '#ffd34d';
      g.save();
      g.translate(toPx(t.x), toPx(t.z)); g.rotate(Math.PI / 4);
      g.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
      g.restore();
    }
    // traffic cars (grey), police (blue), player (white arrow)
    for (const tc of G.traffic.cars) dot(tc.car.pos.x, tc.car.pos.z, 2.5, '#9fb3c0');
    for (const pc of G.police.cars) dot(pc.pos.x, pc.pos.z, 4, '#3f8cff');
    for (const cop of G.police.cops) dot(cop.pos.x, cop.pos.z, 3, '#3f8cff');
    const px = G.playerCar ? G.playerCar.pos.x : G.player.pos.x;
    const pz = G.playerCar ? G.playerCar.pos.z : G.player.pos.z;
    const heading = G.playerCar ? G.playerCar.heading : G.player.heading;
    g.fillStyle = '#ffffff';
    g.save();
    g.translate(toPx(px), toPx(pz));
    g.rotate(heading);
    g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
    g.restore();
    // north tick
    g.fillStyle = '#ffffff'; g.font = 'bold 13px Arial';
    g.fillText('N', W / 2 - 4, 16);
  }
}
