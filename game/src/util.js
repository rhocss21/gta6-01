// SOLMAR CITY — small shared helpers (no game logic here, only math + DOM bits).
import * as THREE from 'three';

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest-arc interpolation between two headings (radians).
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function rand(a, b) {
  return a + Math.random() * (b - a);
}

export function randi(a, b) {
  return Math.floor(rand(a, b + 1));
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Deterministic PRNG (mulberry32) so the city layout is stable per seed.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A canvas texture painted by a callback: used for building windows, road
// markings and the beach, so the city needs no image assets at all.
export function canvasTexture(w, h, painter) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  painter(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function el(id) {
  return document.getElementById(id);
}
