// Solmar City — all sound is synthesized with WebAudio: no audio files, no network.
export class SolmarAudio {
  constructor() {
    this.ctx = null; this.master = null; this.muted = false;
    this.engineOsc = null; this.engineOsc2 = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenHigh = false; this.sirenTimer = 0;
    this.padOscA = null; this.padOscB = null; this.padGain = null; this.padTimer = 0; this.padStep = 0;
    this.ready = false;
  }

  // Must be called from a user gesture at least once; safe to call repeatedly.
  ensureAudio() {
    if (this.ready) { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      this.startEngineHum();
      this.startSiren();
      this.startAmbientPad();
      this.ready = true;
    } catch (e) { /* audio is a garnish: a failed context never blocks the game */ }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  startEngineHum() {
    const c = this.ctx;
    this.engineGain = c.createGain(); this.engineGain.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    this.engineOsc = c.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
    this.engineOsc2 = c.createOscillator(); this.engineOsc2.type = 'square'; this.engineOsc2.frequency.value = 28;
    const g2 = c.createGain(); g2.gain.value = 0.4;
    this.engineOsc.connect(lp); this.engineOsc2.connect(g2); g2.connect(lp);
    lp.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); this.engineOsc2.start();
  }

  // speedNorm 0..1, onFoot true when the player is walking.
  setEngine(speedNorm, onFoot) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const f = 52 + speedNorm * 150 + (onFoot ? 0 : 8);
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    const vol = onFoot ? 0.015 : 0.02 + speedNorm * 0.075;
    this.engineGain.gain.setTargetAtTime(vol, t, 0.1);
  }

  startSiren() {
    const c = this.ctx;
    this.sirenGain = c.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc = c.createOscillator(); this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 720;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  updateSiren(dt, wanted) {
    if (!this.ctx || !this.sirenOsc) return;
    if (wanted > 0) {
      this.sirenGain.gain.setTargetAtTime(0.028, this.ctx.currentTime, 0.1);
      this.sirenTimer += dt;
      if (this.sirenTimer > 0.42) {
        this.sirenTimer = 0; this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 920 : 660, this.ctx.currentTime, 0.03);
      }
    } else {
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    }
  }

  startAmbientPad() {
    const c = this.ctx;
    this.padGain = c.createGain(); this.padGain.gain.value = 0.02;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    this.padOscA = c.createOscillator(); this.padOscA.type = 'triangle'; this.padOscA.frequency.value = 110;
    this.padOscB = c.createOscillator(); this.padOscB.type = 'triangle'; this.padOscB.frequency.value = 164.81;
    this.padOscA.connect(lp); this.padOscB.connect(lp); lp.connect(this.padGain); this.padGain.connect(this.master);
    this.padOscA.start(); this.padOscB.start();
  }

  // Slow chord drift for the ambient pad (C major-ish roots, one change per 8 s).
  updatePad(dt) {
    if (!this.ctx || !this.padOscA) return;
    this.padTimer += dt;
    if (this.padTimer > 8) {
      this.padTimer = 0; this.padStep = (this.padStep + 1) % 4;
      const roots = [110, 98, 87.31, 130.81];
      const fifths = [164.81, 146.83, 130.81, 196];
      const t = this.ctx.currentTime;
      this.padOscA.frequency.setTargetAtTime(roots[this.padStep], t, 1.2);
      this.padOscB.frequency.setTargetAtTime(fifths[this.padStep], t, 1.2);
    }
  }

  noiseBurst(duration, volume, filterFreq) {
    if (!this.ctx) return;
    const c = this.ctx;
    const len = Math.max(1, Math.floor(c.sampleRate * duration));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = c.createGain(); g.gain.value = volume;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
  }

  playGunshot() { this.noiseBurst(0.16, 0.5, 2600); }
  playPunch() { this.noiseBurst(0.1, 0.35, 500); this.tone(95, 0.12, 0.3, 'sine'); }
  playPickup() { this.tone(660, 0.12, 0.25, 'sine'); setTimeout(() => this.tone(880, 0.16, 0.25, 'sine'), 110); }
  playMissionComplete() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 0.28, 'triangle'), i * 130));
  }
  playBusted() { this.tone(220, 0.5, 0.3, 'sawtooth'); setTimeout(() => this.tone(165, 0.6, 0.3, 'sawtooth'), 200); }
  playClick() { this.tone(1200, 0.05, 0.15, 'square'); }

  tone(freq, dur, vol, type) {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(c.currentTime + dur + 0.02);
  }
}
