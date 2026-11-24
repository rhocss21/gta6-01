// SOLMAR CITY — every sound is synthesized with WebAudio: an engine drone
// that follows speed, a two-tone siren while the heat is on, gunshots,
// jingles and a slow drifting pad. No audio files, no network; if the audio
// context fails to start, the game simply plays silent.
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.bus = null;
    this.muted = false;
    this.started = false;
    this.engineOsc = null;
    this.engineSub = null;
    this.engineLevel = null;
    this.sirenOsc = null;
    this.sirenLevel = null;
    this.sirenHigh = false;
    this.sirenClock = 0;
    this.padOscA = null;
    this.padOscB = null;
    this.padClock = 0;
    this.padChord = 0;
  }

  // Call from a user gesture at least once; safe to call again and again.
  unlock() {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.bus = this.ctx.createGain();
      this.bus.gain.value = this.muted ? 0 : 0.9;
      this.bus.connect(this.ctx.destination);
      this._buildEngine();
      this._buildSiren();
      this._buildPad();
      this.started = true;
    } catch (e) {
      // sound is garnish: a failed context never blocks the game
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.bus && this.ctx) {
      this.bus.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
  }

  _buildEngine() {
    const c = this.ctx;
    this.engineLevel = c.createGain();
    this.engineLevel.gain.value = 0;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    this.engineOsc = c.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineSub = c.createOscillator();
    this.engineSub.type = 'square';
    this.engineSub.frequency.value = 28;
    const subGain = c.createGain();
    subGain.gain.value = 0.4;
    this.engineOsc.connect(lp);
    this.engineSub.connect(subGain);
    subGain.connect(lp);
    lp.connect(this.engineLevel);
    this.engineLevel.connect(this.bus);
    this.engineOsc.start();
    this.engineSub.start();
  }

  // speed01 is 0..1; onFoot true while Jax is walking.
  setEngine(speed01, onFoot) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const f = 52 + speed01 * 150 + (onFoot ? 0 : 8);
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engineSub.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    const vol = onFoot ? 0.015 : 0.02 + speed01 * 0.075;
    this.engineLevel.gain.setTargetAtTime(vol, t, 0.1);
  }

  _buildSiren() {
    const c = this.ctx;
    this.sirenLevel = c.createGain();
    this.sirenLevel.gain.value = 0;
    this.sirenOsc = c.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 720;
    this.sirenOsc.connect(this.sirenLevel);
    this.sirenLevel.connect(this.bus);
    this.sirenOsc.start();
  }

  updateSiren(dt, wanted) {
    if (!this.ctx || !this.sirenOsc) return;
    if (wanted > 0) {
      this.sirenLevel.gain.setTargetAtTime(0.028, this.ctx.currentTime, 0.1);
      this.sirenClock += dt;
      if (this.sirenClock > 0.42) {
        this.sirenClock = 0;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 920 : 660, this.ctx.currentTime, 0.03);
      }
    } else {
      this.sirenLevel.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    }
  }

  _buildPad() {
    const c = this.ctx;
    const padGain = c.createGain();
    padGain.gain.value = 0.02;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    this.padOscA = c.createOscillator();
    this.padOscA.type = 'triangle';
    this.padOscA.frequency.value = 110;
    this.padOscB = c.createOscillator();
    this.padOscB.type = 'triangle';
    this.padOscB.frequency.value = 164.81;
    this.padOscA.connect(lp);
    this.padOscB.connect(lp);
    lp.connect(padGain);
    padGain.connect(this.bus);
    this.padOscA.start();
    this.padOscB.start();
  }

  // The ambient pad drifts to a new chord every 8 seconds.
  updatePad(dt) {
    if (!this.ctx || !this.padOscA) return;
    this.padClock += dt;
    if (this.padClock > 8) {
      this.padClock = 0;
      this.padChord = (this.padChord + 1) % 4;
      const roots = [110, 98, 87.31, 130.81];
      const fifths = [164.81, 146.83, 130.81, 196];
      const t = this.ctx.currentTime;
      this.padOscA.frequency.setTargetAtTime(roots[this.padChord], t, 1.2);
      this.padOscB.frequency.setTargetAtTime(fifths[this.padChord], t, 1.2);
    }
  }

  _noiseBurst(duration, volume, cutoff) {
    if (!this.ctx) return;
    const c = this.ctx;
    const len = Math.max(1, Math.floor(c.sampleRate * duration));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.value = volume;
    src.connect(f);
    f.connect(g);
    g.connect(this.bus);
    src.start();
  }

  _tone(freq, dur, vol, type) {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g);
    g.connect(this.bus);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  }

  gunshot() {
    this._noiseBurst(0.16, 0.5, 2600);
  }

  thud() {
    this._noiseBurst(0.1, 0.35, 500);
    this._tone(95, 0.12, 0.3, 'sine');
  }

  chime() {
    this._tone(660, 0.12, 0.25, 'sine');
    setTimeout(() => this._tone(880, 0.16, 0.25, 'sine'), 110);
  }

  fanfare() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 0.28, 'triangle'), i * 130));
  }

  bustedSting() {
    this._tone(220, 0.5, 0.3, 'sawtooth');
    setTimeout(() => this._tone(165, 0.6, 0.3, 'sawtooth'), 200);
  }

  click() {
    this._tone(1200, 0.05, 0.15, 'square');
  }
}
