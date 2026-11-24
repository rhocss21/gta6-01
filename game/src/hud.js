// SOLMAR CITY — the HUD: money, health + armor, weapon slots, wanted
// stars, rank + respect, mission banner with stage / NEXT / timer, the
// debt-paydown line, dispatch panel, crew cards, radio, dialogue box,
// location, speedometer and a live minimap with a mission-route line and a
// WANTED RADIUS ring. The minimap repaints its blips at ~10 Hz.
//
// Speed-label rule: the big number is only ever the player's own speed when
// he is driving, or his sprint speed on foot with no heat. On foot with
// police closing in, the number is the nearest interceptor's speed and the
// label says so in plain words ("TARPON 38 CLOSING · 87 KM/H") — it is
// never presented as the on-foot player's speed.
import { fmtMoney, fmtClock, clamp, flatDist } from './util.js';
import { RANK_TITLES, CALLSIGNS } from './police.js';
import { blockSpots, streetLines, districtAt } from './city.js';
import { DispatchPanel } from './dispatch.js';
import { lineFor, CREW, STATIONS } from './dialogue.js';

// Respect tiers: RP is the debt already paid off. Next tier's RP is the bar.
const REP_STEPS = [0, 1000, 5000, 12000, 20000, 40000];
const REP_GRADES = ['C', 'B', 'B', 'A', 'A', 'S'];

export class Hud {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'),
      money: $('money'),
      healthFill: $('health-fill'),
      healthNum: $('health-num'),
      armorFill: $('armor-fill'),
      armorNum: $('armor-num'),
      ammo: $('ammo'),
      weapons: $('weapons'),
      debt: $('debt'),
      missionStage: $('mission-stage'),
      missionText: $('mission-text'),
      missionNext: $('mission-next'),
      missionTimer: $('mission-timer'),
      missionDist: $('mission-dist'),
      stars: $('stars'),
      wantedStatus: $('wanted-status'),
      rank: $('rank'),
      respectFill: $('respect-fill'),
      clock: $('clock'),
      crosshair: $('crosshair'),
      speed: $('speed'),
      speedNum: $('speed-num'),
      speedLabel: $('speed-label'),
      speedSub: $('speed-sub'),
      prompt: $('prompt'),
      robWrap: $('rob-wrap'),
      robFill: $('rob-fill'),
      toasts: $('toasts'),
      minimap: $('minimap'),
      vignette: $('vignette'),
      dispatch: $('dispatch'),
      dialogue: $('dialogue'),
      dlgPortrait: $('dialogue-portrait'),
      dlgName: $('dialogue-name'),
      dlgLine: $('dialogue-line'),
      crew: $('crew'),
      radio: $('radio'),
      location: $('location'),
      menu: $('menu'),
      pause: $('pause'),
      busted: $('busted'),
      wasted: $('wasted'),
      complete: $('complete'),
      btnContinue: $('btn-continue'),
      btnMute: $('btn-mute'),
    };
    this.dispatchPanel = new DispatchPanel(this.el.dispatch);
    this.mm = this.el.minimap.getContext('2d');
    this.mmClock = 0;
    this.lastDialogueKey = '';
    this._paintMapBase();
    this._paintCrewCards();
  }

  // The static city layer of the minimap, painted once.
  _paintMapBase() {
    const c = document.createElement('canvas');
    c.width = 360;
    c.height = 360;
    const g = c.getContext('2d');
    const toPx = (v) => ((v + 300) / 600) * 360;
    g.fillStyle = '#0c2733';
    g.fillRect(0, 0, 360, 360);
    // water + sand at the south edge
    g.fillStyle = '#2e7fa8';
    g.fillRect(0, toPx(300), 360, 360 - toPx(300));
    g.fillStyle = '#e8d29a';
    g.fillRect(0, toPx(272), 360, toPx(300) - toPx(272));
    // blocks
    g.fillStyle = '#274b5e';
    for (const bx of blockSpots()) {
      for (const bz of blockSpots()) {
        g.fillRect(toPx(bx - 23), toPx(bz - 23), toPx(bx + 23) - toPx(bx - 23), toPx(bz + 23) - toPx(bz - 23));
      }
    }
    // roads
    g.fillStyle = '#5d7d8f';
    for (const r of streetLines()) {
      g.fillRect(toPx(r - 7), toPx(-270), toPx(r + 7) - toPx(r - 7), toPx(270) - toPx(-270));
      g.fillRect(toPx(-270), toPx(r - 7), toPx(270) - toPx(-270), toPx(r + 7) - toPx(r - 7));
    }
    this.mapBase = c;
  }

  _paintCrewCards() {
    this.el.crew.innerHTML = '';
    for (const c of CREW) {
      const d = document.createElement('div');
      d.className = 'crew-card';
      d.innerHTML = `<span class="crew-name" style="color:${c.color}">${c.name}</span>` +
        `<span class="crew-role">${c.role} · ${c.perk}</span>`;
      this.el.crew.appendChild(d);
    }
  }

  setHudVisible(show) {
    this.el.hud.classList.toggle('hidden', !show);
  }

  showOverlay(name) {
    for (const k of ['menu', 'pause', 'busted', 'wasted', 'complete']) {
      this.el[k].classList.toggle('hidden', k !== name);
    }
  }

  hideOverlays() {
    this.showOverlay(null);
  }

  toast(text, kind) {
    const d = document.createElement('div');
    d.className = 'toast' + (kind === 'gold' ? ' gold' : '');
    d.textContent = text;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.remove(), 4200);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }

  setPrompt(text) {
    if (!text) {
      this.el.prompt.textContent = '';
      this.el.prompt.style.display = 'none';
      return;
    }
    this.el.prompt.style.display = 'block';
    this.el.prompt.innerHTML = text;
  }

  setVoice(speaker, line) {
    this.el.dlgPortrait.textContent = speaker.initial;
    this.el.dlgPortrait.style.background = speaker.color;
    this.el.dlgName.textContent = speaker.name + ' · ' + speaker.role;
    this.el.dlgName.style.color = speaker.color;
    this.el.dlgLine.textContent = line;
  }

  // Full HUD refresh from the live game state; minimap blips at ~10 Hz.
  refresh(W, dt) {
    const M = W.story;
    this.el.money.textContent = fmtMoney(W.money);
    this.el.healthFill.style.width = clamp(W.jax.health, 0, 100) + '%';
    this.el.healthNum.textContent = Math.ceil(W.jax.health);
    this.el.armorFill.style.width = clamp(W.jax.armor, 0, 100) + '%';
    this.el.armorNum.textContent = Math.ceil(W.jax.armor);
    this.el.ammo.textContent = W.guns.ammoLabel + (W.guns.reserve > 0 ? `  ·  RESERVE ${W.guns.reserve}` : '  ·  NO RESERVE');
    // weapon slots
    const slots = W.guns.slotStates(M.finished.length);
    this.el.weapons.innerHTML = slots.map((s) =>
      `<span class="wslot${s.locked ? ' locked' : ''}">${s.locked ? '🔒 ' : ''}${s.name} ${s.locked ? '' : s.ammo}</span>`
    ).join('');
    // debt paydown: what is left, and what is left after this job pays
    this.el.debt.textContent = `DEBT $${(50000 - M.debtPaid).toLocaleString('en-US')} → $${M.debtAfterJob.toLocaleString('en-US')} AFTER THIS JOB`;
    // mission header: stage, banner, NEXT, timer, distance
    this.el.missionStage.textContent = M.stageLabel();
    this.el.missionText.textContent = M.bannerLine();
    this.el.missionNext.textContent = M.nextLabel();
    this.el.missionTimer.textContent = M.storyDone ? '' : '⏱ ' + M.timerLabel() + ' LEFT';
    const t = M.target;
    const px = W.playerCar ? W.playerCar.pos.x : W.jax.pos.x;
    const pz = W.playerCar ? W.playerCar.pos.z : W.jax.pos.z;
    if (t) {
      const d = Math.hypot(px - t.x, pz - t.z);
      this.el.missionDist.textContent = Math.round(d) + 'm';
    } else {
      this.el.missionDist.textContent = '';
    }
    // wanted stars + status line
    const stars = this.el.stars.children;
    for (let i = 0; i < 5; i++) stars[i].classList.toggle('lit', i < W.wanted);
    this.el.wantedStatus.textContent = W.wanted === 0 ? 'CLEAN — NO HEAT'
      : W.wanted >= 4 ? 'IN SIGHT — Air One has you in the light'
      : W.wanted >= 2 ? 'IN SIGHT — units closing in' : 'SPOTTED — keep moving';
    // rank + respect: RP is the debt paid off so far
    const rp = M.debtPaid;
    let tier = 0;
    for (let i = 0; i < REP_STEPS.length; i++) if (rp >= REP_STEPS[i]) tier = i;
    const nextRp = REP_STEPS[Math.min(tier + 1, REP_STEPS.length - 1)];
    const tierStart = REP_STEPS[tier];
    this.el.rank.textContent = `RANK ${REP_GRADES[tier]} · ${RANK_TITLES[tier]} — ${rp.toLocaleString('en-US')}/${nextRp.toLocaleString('en-US')} RP`;
    this.el.respectFill.style.width = clamp(((rp - tierStart) / Math.max(1, nextRp - tierStart)) * 100, 0, 100) + '%';
    // clock + radio + location
    this.el.clock.textContent = fmtClock(W.clockMinutes);
    const station = STATIONS[W.radioStation % STATIONS.length];
    this.el.radio.textContent = '♪ ' + station.name + ' — ' + station.song;
    this.el.location.textContent = districtAt(px, pz);
    // dialogue follows the job unless a shot overrode it
    const dlgKey = W.dialogueOverride ? 'override' : (M.index + ':' + M.step);
    if (dlgKey !== this.lastDialogueKey) {
      this.lastDialogueKey = dlgKey;
      if (W.dialogueOverride) this.setVoice(W.dialogueOverride.speaker, W.dialogueOverride.line);
      else {
        const d = lineFor(M.index, M.step);
        this.setVoice(d.speaker, d.line);
      }
    }
    // crosshair only on foot; speed panel always visible
    this.el.crosshair.style.display = W.playerCar ? 'none' : 'block';
    if (W.playerCar) {
      this.el.speedNum.textContent = Math.round(Math.abs(W.playerCar.speed) * 3.6);
      this.el.speedLabel.textContent = 'km/h';
      this.el.speedSub.textContent = `${W.playerCar.name.toUpperCase()} · CONDITION ${Math.round(W.playerCar.condition)}%`;
    } else if (W.pd.cars.length > 0) {
      // On foot with heat: the big number is the CLOSEST INTERCEPTOR's speed,
      // and the label names the unit and its speed — never the player's.
      let best = null;
      let bestD = 1e9;
      for (let i = 0; i < W.pd.cars.length; i++) {
        const c = W.pd.cars[i];
        const d = flatDist(c.pos.x, c.pos.z, px, pz);
        if (d < bestD) {
          bestD = d;
          best = { car: c, i };
        }
      }
      const kmh = Math.round(Math.abs(best.car.speed) * 3.6);
      this.el.speedNum.textContent = kmh;
      this.el.speedLabel.textContent = 'km/h';
      this.el.speedSub.textContent = `${CALLSIGNS[best.i % CALLSIGNS.length]} CLOSING · ${kmh} KM/H`;
    } else {
      this.el.speedNum.textContent = Math.round(W.jax.speed2d * 3.6);
      this.el.speedLabel.textContent = 'km/h';
      this.el.speedSub.textContent = 'ON FOOT · SPRINT';
    }
    // heist progress bar
    if (M.robShop) {
      this.el.robWrap.classList.remove('hidden');
      this.el.robFill.style.width = Math.round(M.robProgress * 100) + '%';
    } else {
      this.el.robWrap.classList.add('hidden');
    }
    // damage vignette fades after a hit
    const sinceHit = W.now - W.jax.lastHurtAt;
    this.el.vignette.style.opacity = sinceHit < 1.2 ? String(0.9 - sinceHit * 0.7) : '0';

    // dispatch panel (its own ~5 Hz throttle inside)
    this.dispatchPanel.refresh(W, dt);

    this.mmClock += dt;
    if (this.mmClock > 0.1) {
      this.mmClock = 0;
      this._drawMinimap(W);
    }
  }

  _drawMinimap(W) {
    const g = this.mm;
    const SZ = 360;
    const toPx = (v) => ((v + 300) / 600) * SZ;
    g.clearRect(0, 0, SZ, SZ);
    g.drawImage(this.mapBase, 0, 0);
    const dot = (x, z, r, color) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(toPx(x), toPx(z), r, 0, Math.PI * 2);
      g.fill();
    };
    const pxp = W.playerCar ? W.playerCar.pos.x : W.jax.pos.x;
    const pzp = W.playerCar ? W.playerCar.pos.z : W.jax.pos.z;
    // mission route: dashed gold L-route from the player to the target
    const t = W.story.target;
    if (t) {
      g.strokeStyle = '#ffd34d';
      g.lineWidth = 3;
      g.setLineDash([8, 6]);
      g.beginPath();
      g.moveTo(toPx(pxp), toPx(pzp));
      g.lineTo(toPx(t.x), toPx(pzp));
      g.lineTo(toPx(t.x), toPx(t.z));
      g.stroke();
      g.setLineDash([]);
      // target: pulsing yellow diamond
      const pulse = 6 + Math.sin(performance.now() * 0.006) * 2;
      g.fillStyle = '#ffd34d';
      g.save();
      g.translate(toPx(t.x), toPx(t.z));
      g.rotate(Math.PI / 4);
      g.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
      g.restore();
    }
    // WANTED RADIUS: the search zone the police are sweeping, in red
    if (W.wanted > 0) {
      const rMeters = 30 + W.wanted * 18;
      g.strokeStyle = 'rgba(255,60,50,0.85)';
      g.lineWidth = 2;
      g.setLineDash([5, 5]);
      g.beginPath();
      g.arc(toPx(pxp), toPx(pzp), (rMeters / 600) * SZ, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#ff5a4e';
      g.font = 'bold 12px Arial';
      g.fillText('WANTED RADIUS', toPx(pxp) + 8, toPx(pzp) - (rMeters / 600) * SZ - 4);
    }
    // traffic cars (grey), police (blue), player (white arrow)
    for (const tc of W.traffic.cars) dot(tc.car.pos.x, tc.car.pos.z, 2.5, '#9fb3c0');
    for (const pc of W.pd.cars) dot(pc.pos.x, pc.pos.z, 4, '#3f8cff');
    for (const cop of W.pd.cops) dot(cop.pos.x, cop.pos.z, 3, '#3f8cff');
    const heading = W.playerCar ? W.playerCar.heading : W.jax.heading;
    g.fillStyle = '#ffffff';
    g.save();
    g.translate(toPx(pxp), toPx(pzp));
    g.rotate(heading);
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(5, 6);
    g.lineTo(-5, 6);
    g.closePath();
    g.fill();
    g.restore();
    // north tick
    g.fillStyle = '#ffffff';
    g.font = 'bold 13px Arial';
    g.fillText('N', SZ / 2 - 4, 16);
  }
}
