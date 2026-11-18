// SOLMAR CITY — all sound is synthesized live with WebAudio (no audio files,
// no network). Engine hum, police siren, gunshots, UI jingles, ambient pad.
import { clamp } from './util.js';

export class SolmarAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.padOn = false;
  }

  // Must be called from a user gesture (New Game click) — browsers block
  // AudioContext before interaction.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);

    // Engine: two detuned saws through a lowpass, gain driven by speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.frequency.value = 82;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();

    // Siren: a sine whose pitch wobbles between two tones on an LFO.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 750;
    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.type = 'square';
    this.sirenLfo.frequency.value = 0.55;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 180;
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();

    this.startPad();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // speed01: 0..1 of top speed. Silent on foot.
  setEngine(speed01, inCar) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = inCar ? 0.02 + speed01 * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    const f = 55 + speed01 * 165;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(f * 1.5, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(380 + speed01 * 1400, t, 0.1);
  }

  setSiren(on) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, this.ctx.currentTime, 0.2);
  }

  blip(freq, dur, type, vol, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noiseBurst(dur, vol, filterFreq) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
  }

  gunshot() { this.noiseBurst(0.14, 0.5, 1800); this.blip(140, 0.1, 'square', 0.25); }
  punch() { this.noiseBurst(0.08, 0.35, 700); }
  click() { this.blip(880, 0.06, 'sine', 0.2); }
  pickup() { this.blip(660, 0.12, 'sine', 0.25); this.blip(990, 0.18, 'sine', 0.25, 0.09); }
  missionDone() {
    [523, 659, 784, 1047].forEach((f, i) => this.blip(f, 0.22, 'triangle', 0.28, i * 0.11));
  }
  busted() { [392, 330, 262].forEach((f, i) => this.blip(f, 0.3, 'sawtooth', 0.2, i * 0.16)); }
  sirenChirp() { this.blip(950, 0.16, 'sine', 0.22); this.blip(700, 0.16, 'sine', 0.22, 0.14); }

  startPad() {
    if (this.padOn || !this.ctx) return;
    this.padOn = true;
    // Slow warm pad: two detuned triangles, very quiet, always under the game.
    for (const f of [110, 164.8, 220]) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = clamp((f % 7) - 3, -6, 6);
      const g = this.ctx.createGain();
      g.gain.value = 0.018;
      o.connect(g);
      g.connect(this.master);
      o.start();
    }
  }
}
