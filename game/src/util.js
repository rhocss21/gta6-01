// SOLMAR CITY — shared helpers: seeded randomness, flat-plane geometry and
// the number formatting the HUD and the story text both use. Pure functions
// only; nothing here reads the DOM, the scene, or the game state.
export function makeRng(seed) {
  // mulberry32 — small, fast, and bit-identical for a given seed.
  let a = (seed >>> 0) || 1;
  return function roll() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Straight-line distance on the ground plane; height never matters here.
export function flatDist(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Shortest signed turn from `from` toward `to`, in the range (-PI, PI].
export function angleDiff(to, from) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function fmtMoney(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

export function fmtSignedMoney(n) {
  return (n < 0 ? '-$' : '+$') + Math.abs(Math.floor(n)).toLocaleString('en-US');
}

// Seconds rendered as mm:ss, for par timers and countdowns.
export function fmtTimer(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// Minutes since midnight rendered as HH:MM, for the clock of day.
export function fmtClock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function pickOne(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
