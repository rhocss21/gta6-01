// SOLMAR CITY — the entrypoint program for make.fun gta6-01.
// It hands the game in: pre-flight gate checks (the bounty caps), then it
// copies game/ and screenshots/ into MAKEFUN_OUTPUT_DIR (or /output) and
// writes /output/dossier.json with buildDossier from vendor/makefun-game.ts.
// Node 22, standard library only. Deterministic: two runs write identical bytes.
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');

// The bounty's gate caps (see the kit's RULES.txt / gate.json).
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
const INDEX_HTML_MAX_BYTES = 1024 * 1024;

// ---- pre-flight gate: refuse early, with a plain reason, when a cap is over ----
function countGameTree(dir, rel) {
  let files = 0, bytes = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const r = rel === '' ? name : `${rel}/${name}`;
    if (Buffer.byteLength(r, 'utf8') > CAPS.game_path_max_bytes) {
      throw new Error(`gate: game/${r}: path over ${CAPS.game_path_max_bytes} bytes`);
    }
    const st = lstatSync(p);
    if (st.isSymbolicLink()) throw new Error(`gate: game/${r}: symbolic links are not allowed`);
    if (st.isDirectory()) {
      files += 1;
      const sub = countGameTree(p, r);
      files += sub.files; bytes += sub.bytes;
    } else if (st.isFile()) {
      files += 1; bytes += st.size;
    } else {
      throw new Error(`gate: game/${r}: not a plain file or directory`);
    }
  }
  return { files, bytes };
}

function checkScreenshots(dir) {
  if (!existsSync(dir)) throw new Error('gate: screenshots/: no such directory');
  const names = readdirSync(dir).filter((n) => !n.startsWith('.')).sort();
  if (names.length < 3 || names.length > CAPS.screenshots.max) {
    throw new Error(`gate: screenshots/: ${names.length} images, need 3 or 4`);
  }
  let total = 0;
  for (const n of names) {
    const st = statSync(join(dir, n));
    if (!st.isFile()) throw new Error(`gate: screenshots/${n}: not a file`);
    if (st.size > CAPS.screenshots.max_bytes) {
      throw new Error(`gate: screenshots/${n}: ${st.size} bytes, over the 256 KiB cap`);
    }
    total += st.size;
  }
  return { names, total };
}

const gameDir = join(REPO_ROOT, 'game');
const shotsDir = join(REPO_ROOT, 'screenshots');
if (!existsSync(gameDir)) throw new Error('gate: game/: no such directory');
const tree = countGameTree(gameDir, '');
if (tree.files > CAPS.game_max_files) {
  throw new Error(`gate: game/: ${tree.files} entries, over the ${CAPS.game_max_files} cap`);
}
if (tree.bytes > CAPS.game_max_bytes) {
  throw new Error(`gate: game/: ${tree.bytes} bytes, over the 48 MiB cap`);
}
const indexStat = statSync(join(gameDir, 'index.html'));
if (indexStat.size > INDEX_HTML_MAX_BYTES) {
  throw new Error(`gate: game/index.html: ${indexStat.size} bytes, over the 1 MiB cap`);
}
const shots = checkScreenshots(shotsDir);

// ---- hand-in: copy, then write the dossier buildDossier computes ----
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
cpSync(gameDir, join(OUT_DIR, 'game'), { recursive: true });
cpSync(shotsDir, join(OUT_DIR, 'screenshots'), { recursive: true });
const dossier = buildDossier(OUT_DIR, CAPS);
writeFileSync(join(OUT_DIR, 'dossier.json'), dossier);

// ---- run summary ----
console.log('SOLMAR CITY — hand-in complete');
console.log(`  game/: ${tree.files} entries, ${tree.bytes} bytes`);
console.log(`  game/index.html: ${indexStat.size} bytes`);
console.log(`  screenshots/: ${shots.names.join(', ')} (${shots.total} bytes)`);
console.log(`  dossier.json: ${dossier.length} bytes`);
console.log(`  output: ${OUT_DIR}`);
