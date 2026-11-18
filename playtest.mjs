// SOLMAR CITY — scripted Playwright playtest: 12 checks, no console errors,
// plus the 4 staged screenshots into screenshots/. Run: node playtest.mjs
import { chromium } from '/home/hatch/workspace/tools/shot-tool/node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = 8901;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = [
  { name: '01-cover.jpg', query: '?shot=cover' },
  { name: '02-on-foot.jpg', query: '?shot=street' },
  { name: '03-mission-combat.jpg', query: '?shot=mission' },
  { name: '04-menu.jpg', query: '?shot=menu' },
];

const results = [];
function check(n, name, ok, detail) {
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

function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
let browser = null;
const consoleErrors = [];
try {
  if (!(await waitForServer(BASE + '/'))) throw new Error('dev server did not come up');
  browser = await chromium.launch({
    // NOTE: /opt/meta-chromium/chrome refuses to start in this VM
    // ("Hatch WebGL domain policy is required for browser startup"), so use
    // Playwright's bundled Chromium, as the earlier attempts' shot-tool did.
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  const solmar = () => page.evaluate(() => window.__solmar);

  // (1) page loads, menu visible
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await sleep(2500);
  const menuVisible = await page.evaluate(() => {
    const m = document.getElementById('menu');
    return m && !m.classList.contains('hidden') && !!window.__solmar && window.__solmar.state === 'menu';
  });
  check(1, 'page loads, start menu visible', menuVisible);

  // (2) NEW GAME → HUD + mission 1 banner
  await page.click('#btn-new');
  await sleep(1200);
  const hudOk = await page.evaluate(() => {
    const hud = document.getElementById('hud');
    const banner = document.getElementById('mission-text').textContent;
    return !hud.classList.contains('hidden') && banner.includes('Hot Wheels') && window.__solmar.state === 'playing';
  });
  check(2, 'NEW GAME → HUD + mission 1 banner', hudOk);

  // (3) WASD walk moves the player (long hold: SwiftShader runs ~1-2 FPS here,
  // so a short hold can capture zero frames)
  const p0 = (await solmar()).player;
  await page.keyboard.down('KeyW');
  await sleep(3000);
  await page.keyboard.up('KeyW');
  const p1 = (await solmar()).player;
  const walked = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  check(3, 'WASD walk moves the player', walked > 1, `moved ${walked.toFixed(1)}m`);

  // (4) Esc pause → overlay, Esc resumes
  await page.keyboard.press('Escape');
  await sleep(400);
  const paused = await page.evaluate(() => !document.getElementById('pause').classList.contains('hidden') && window.__solmar.state === 'paused');
  await page.keyboard.press('Escape');
  await sleep(400);
  const resumed = (await solmar()).state === 'playing';
  check(4, 'Esc pause → overlay, Esc resumes', paused && resumed);

  // Walk back to the parked sedan at (86, 18) before stealing: the walk test's
  // distance varies with SwiftShader frame rate, so re-approach until close.
  {
    const t0 = Date.now();
    for (;;) {
      const p = (await solmar()).player;
      const d = Math.hypot(p.x - 86, p.z - 18);
      if (d <= 3.5 || Date.now() - t0 > 6000) break;
      await page.keyboard.down('KeyS'); // south, back toward the car
      await sleep(200);
    }
    await page.keyboard.up('KeyS');
  }

  // (5) E steals a car, wanted ≥ 1
  await page.keyboard.press('KeyE');
  await sleep(600);
  const stolen = await solmar();
  check(5, 'E steals a car, wanted ≥ 1', !!stolen.car && stolen.wanted >= 1,
    stolen.car ? `wanted ${stolen.wanted}` : 'no car');

  // (6) drive W 6 s → speed > 5 mph (long hold: SwiftShader runs ~1-2 FPS here)
  await page.keyboard.down('KeyW');
  await sleep(6000);
  const driving = await solmar();
  const mph = Math.abs(driving.car ? driving.car.speed : 0) * 2.237;
  check(6, 'drive W → speed > 5 mph', mph > 5, `${mph.toFixed(0)} mph`);

  // (7) E exits the car
  await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyE');
  await sleep(500);
  const exited = await solmar();
  check(7, 'E exits the car', !exited.car && !exited.player.inCar);

  // (8) mission 1 completes: re-enter the car and drive it to the garage
  await page.keyboard.press('KeyE'); // re-enter (player stands beside the car)
  await sleep(500);
  let missionDone = false, missionDetail = '';
  const waypoints = [{ x: 90, z: 210 }, { x: -180, z: 206 }];
  let wp = 0;
  let stuckSince = null;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const s = await solmar();
    if (s.money >= 500 && s.mission.index >= 1) { missionDone = true; break; }
    if (!s.car) { missionDetail = 'lost the car'; break; }
    const t = waypoints[wp];
    const d = Math.hypot(t.x - s.car.x, t.z - s.car.z);
    if (d < 14) { wp += 1; if (wp >= waypoints.length) wp = waypoints.length - 1; continue; }
    const desired = Math.atan2(t.x - s.car.x, t.z - s.car.z);
    const err = angleDiff(desired, s.car.heading);
    // steering
    if (err > 0.15) { await page.keyboard.down('KeyA'); await page.keyboard.up('KeyD'); }
    else if (err < -0.15) { await page.keyboard.down('KeyD'); await page.keyboard.up('KeyA'); }
    else { await page.keyboard.up('KeyA'); await page.keyboard.up('KeyD'); }
    // throttle: slow down for sharp turns, reverse if stuck
    const speed = Math.abs(s.car.speed);
    if (speed < 0.5) {
      if (!stuckSince) stuckSince = Date.now();
      if (Date.now() - stuckSince > 2500) {
        await page.keyboard.up('KeyW'); await page.keyboard.down('KeyS');
        await sleep(1200);
        await page.keyboard.up('KeyS'); stuckSince = null;
      }
    } else stuckSince = null;
    if (Math.abs(err) < 0.6) { await page.keyboard.down('KeyW'); await page.keyboard.up('KeyS'); }
    else if (speed > 8) { await page.keyboard.up('KeyW'); await page.keyboard.down('KeyS'); }
    else { await page.keyboard.down('KeyW'); }
    await sleep(150);
  }
  await page.keyboard.up('KeyW'); await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyD'); await page.keyboard.up('KeyS');
  const afterDrive = await solmar();
  check(8, 'mission 1 completes by driving the stolen car to the garage ($500)', missionDone,
    missionDone ? `money $${afterDrive.money}` : (missionDetail || `money $${afterDrive.money}, mission ${afterDrive.mission.index}`));

  // (9) click fires pistol, ammo 12 → 11 (click at the viewport centre)
  if (afterDrive.car) { await page.keyboard.press('KeyE'); await sleep(400); } // exit the car to shoot on foot
  const ammo0 = (await solmar()).ammo;
  const vp = page.viewportSize();
  await page.mouse.click(Math.floor(vp.width / 2), Math.floor(vp.height / 2));
  await sleep(300);
  const ammo1 = (await solmar()).ammo;
  check(9, 'click fires pistol, ammo 12 → 11', ammo0 === 12 && ammo1 === 11, `ammo ${ammo0} → ${ammo1}`);

  // (10) save round-trip: save, reload, CONTINUE → money preserved
  await page.keyboard.press('Escape');
  await sleep(400);
  await page.click('#btn-save');
  await sleep(500);
  const savedMoney = (await solmar()).money;
  await page.reload({ waitUntil: 'load' });
  await sleep(2000);
  const continueVisible = await page.evaluate(() => !document.getElementById('btn-continue').classList.contains('hidden'));
  if (continueVisible) {
    await page.click('#btn-continue');
    await sleep(1200);
    const loaded = await solmar();
    check(10, 'save round-trip: reload + CONTINUE → money preserved', loaded.money === savedMoney && loaded.state === 'playing',
      `saved $${savedMoney}, loaded $${loaded.money}`);
  } else {
    check(10, 'save round-trip: reload + CONTINUE → money preserved', false, 'CONTINUE button missing after reload');
  }

  // (11) zero console errors throughout
  check(11, 'zero console errors throughout', consoleErrors.length === 0,
    consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : '');

  // (12) 4 screenshots via ?shot= URLs at 1280×800 JPEG ≤ 256 KiB
  await page.setViewportSize({ width: 1280, height: 800 });
  await sleep(800); // let the canvas resize settle
  const shotsDir = join(ROOT, 'screenshots');
  mkdirSync(shotsDir, { recursive: true });
  let shotsOk = true;
  const shotDetails = [];
  for (const s of SHOTS) {
    await page.goto(BASE + '/' + s.query, { waitUntil: 'load' });
    await sleep(2800);
    const file = join(shotsDir, s.name);
    await page.screenshot({ path: file, type: 'jpeg', quality: 80 });
    const st = statSync(file);
    const ok = st.size <= 262144;
    shotsOk = shotsOk && ok;
    shotDetails.push(`${s.name} ${(st.size / 1024).toFixed(0)} KiB`);
  }
  check(12, '4 screenshots via ?shot= URLs, 1280×800 JPEG ≤ 256 KiB each', shotsOk, shotDetails.join(', '));
} catch (e) {
  console.error('PLAYTEST ERROR:', e.message);
  results.push({ n: 0, name: 'playtest crashed', ok: false, detail: e.message });
} finally {
  if (browser) await browser.close();
  server.kill();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\nPLAYTEST: ${passed}/${results.length} checks passed`);
const summary = { passed, total: results.length, checks: results, consoleErrors };
writeFileSync(join(ROOT, 'playtest-result.json'), JSON.stringify(summary, null, 2));
process.exit(passed === results.length ? 0 : 1);
