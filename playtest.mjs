// SOLMAR CITY (attempt11) — scripted Playwright playtest + staged screenshots.
// Checks: menu, new game, steal a car, drive, shoot, pause/resume, and the
// four staged shots with their HUD values asserted. Run: node playtest.mjs
import { chromium } from '/home/hatch/workspace/tools/shot-tool/node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = 8911;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOT_DIR = join(ROOT, 'screenshots');
const SHOTS = [
  { name: '01-cover.jpg', query: '?shot=cover' },
  { name: '02-on-foot.jpg', query: '?shot=street' },
  { name: '03-mission-combat.jpg', query: '?shot=mission' },
  { name: '04-night-neon.jpg', query: '?shot=night' },
];

const results = [];
function record(n, name, ok, detail) {
  results.push({ n, name, ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${String(n).padStart(2, '0')} ${name}${detail ? ' — ' + detail : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch (e) { /* not up yet */ }
    await sleep(250);
  }
  return false;
}

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
let browser = null;
const consoleErrors = [];
try {
  if (!(await waitForServer(BASE + '/'))) throw new Error('dev server did not come up');
  browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  const solmar = () => page.evaluate(() => window.__solmar);
  const text = (id) => page.evaluate((i) => document.getElementById(i)?.textContent || '', id);

  // (1) page loads, menu visible
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await sleep(2500);
  const menuVisible = await page.evaluate(() => {
    const m = document.getElementById('menu');
    return m && !m.classList.contains('hidden') && !!window.__solmar && window.__solmar.state === 'menu';
  });
  record(1, 'page loads, start menu visible', menuVisible);

  // (2) NEW GAME → HUD + mission 1 banner
  await page.click('#btn-new');
  await sleep(1200);
  const hudOk = await page.evaluate(() => {
    const hud = document.getElementById('hud');
    const banner = document.getElementById('mission-text').textContent;
    return !hud.classList.contains('hidden') && banner.includes('Hot Wheels') && window.__solmar.state === 'playing';
  });
  record(2, 'NEW GAME → HUD + mission 1 banner', hudOk);

  // (3) steal the parked car next to spawn (86,18), then drive
  await page.keyboard.press('KeyE');
  await sleep(600);
  const stole = await page.evaluate(() => window.__solmar.player.inCar && !!window.__solmar.car);
  record(3, 'E steals the car next to spawn', stole);
  await page.keyboard.down('KeyW');
  await sleep(6000);
  await page.keyboard.up('KeyW');
  const drove = await solmar();
  record(4, 'W drives the car (speed > 0)', drove.car && Math.abs(drove.car.speed) > 1, drove.car ? `speed ${drove.car.speed.toFixed(1)} m/s` : 'no car');

  // (5) exit, shoot once, ammo drops
  await page.keyboard.press('KeyE');
  await sleep(400);
  const ammoBefore = (await solmar()).ammo;
  await page.mouse.click(640, 360);
  await sleep(400);
  const ammoAfter = (await solmar()).ammo;
  record(5, 'click fires the pistol (ammo drops)', ammoAfter === ammoBefore - 1, `${ammoBefore} → ${ammoAfter}`);

  // (6) pause + resume
  await page.keyboard.press('Escape');
  await sleep(400);
  const paused = await page.evaluate(() => window.__solmar.state === 'paused' && !document.getElementById('pause').classList.contains('hidden'));
  await page.keyboard.press('Escape');
  await sleep(400);
  const resumed = await page.evaluate(() => window.__solmar.state === 'playing');
  record(6, 'Esc pauses and resumes', paused && resumed);

  // (7) no console errors so far
  record(7, 'no console/page errors during play', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  // ---- staged shots (1280x720: screenshots force frames in SwiftShader) ----
  mkdirSync(SHOT_DIR, { recursive: true });
  const shotCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const shotPage = await shotCtx.newPage();
  shotPage.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  shotPage.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  let n = 8;
  for (const shot of SHOTS) {
    await shotPage.goto(BASE + '/' + shot.query, { waitUntil: 'load' });
    await sleep(6000);
    const path = join(SHOT_DIR, shot.name);
    await shotPage.screenshot({ path, type: 'jpeg', quality: 82 });
    const size = statSync(path).size;
    const state = await shotPage.evaluate(() => window.__solmar);
    const stext = (id) => shotPage.evaluate((i) => document.getElementById(i)?.textContent || '', id);
    const sq = (sel) => shotPage.evaluate((s) => document.querySelectorAll(s).length, sel);
    let hudNote = '';
    let ok = size <= 262144 && state.state === 'playing';
    if (shot.query.includes('cover')) {
      const money = await stext('money');
      const debt = await stext('debt');
      const speed = await stext('speed-num');
      const speedSub = await stext('speed-sub');
      const dlg = await stext('dialogue-name');
      const rows = await sq('#dispatch .dispatch-row');
      const stars = await sq('#stars span.lit');
      hudNote = `money ${money}, debt "${debt}", speed ${speed}, sub "${speedSub}", dispatch rows ${rows}, stars ${stars}, dialogue ${dlg}`;
      ok = ok && money === '$8,400' && debt.includes('$41,200') && speed === '87'
        && speedSub === 'TARPON 38 CLOSING · 87 KM/H' && rows >= 6 && stars === 4 && dlg.includes('MARA');
    } else if (shot.query.includes('street')) {
      const prompt = await stext('prompt');
      hudNote = `prompt "${prompt}"`;
      ok = ok && prompt.toLowerCase().includes('steal');
    } else if (shot.query.includes('mission')) {
      const robVisible = await shotPage.evaluate(() => !document.getElementById('rob-wrap').classList.contains('hidden'));
      const robW = await shotPage.evaluate(() => document.getElementById('rob-fill').style.width);
      const stars = await sq('#stars span.lit');
      hudNote = `rob bar ${robVisible} ${robW}, stars ${stars}, wanted ${state.wanted}`;
      ok = ok && robVisible && robW === '62%' && stars === 3;
    } else if (shot.query.includes('night')) {
      const speed = await stext('speed-num');
      hudNote = `timeOfDay ${state.timeOfDay}, speed ${speed}, wanted ${state.wanted}`;
      ok = ok && state.timeOfDay === 'night' && speed === '87';
    }
    record(n++, `shot ${shot.name} (${(size / 1024).toFixed(0)} KiB)`, ok, hudNote);
  }
  await shotCtx.close();

  // (12) still no console errors after all shots
  record(12, 'no console/page errors after shots', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  const failed = results.filter((r) => !r.ok);
  console.log(failed.length === 0 ? 'ALL CHECKS PASSED' : `${failed.length} CHECK(S) FAILED`);
  process.exitCode = failed.length === 0 ? 0 : 1;
} finally {
  if (browser) await browser.close();
  server.kill();
}
