// SOLMAR CITY — the entrypoint program for make.fun gta6-01.
// Gate checks first (the bounty caps), then it copies game/ and
// screenshots/ into MAKEFUN_OUTPUT_DIR (or /output) and writes
// /output/dossier.json with buildDossier from vendor/makefun-game.ts.
// Node 22, standard library only. Deterministic: two runs write identical bytes.
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const DEST = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');

// The bounty's gate caps (see the kit's RULES.txt / gate.json).
const LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
const INDEX_HTML_MAX = 1024 * 1024;

// ---- pre-flight gate: refuse early, with a plain reason, when a cap is over ----
function measureTree(dir, rel) {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const r = rel === '' ? name : `${rel}/${name}`;
    if (Buffer.byteLength(r, 'utf8') > LIMITS.game_path_max_bytes) {
      throw new Error(`gate: game/${r}: path over ${LIMITS.game_path_max_bytes} bytes`);
    }
    const st = lstatSync(p);
    if (st.isSymbolicLink()) throw new Error(`gate: game/${r}: symbolic links are not allowed`);
    if (st.isDirectory()) {
      files += 1;
      const sub = measureTree(p, r);
      files += sub.files;
      bytes += sub.bytes;
    } else if (st.isFile()) {
      files += 1;
      bytes += st.size;
    } else {
      throw new Error(`gate: game/${r}: not a plain file or directory`);
    }
  }
  return { files, bytes };
}

function checkShots(dir) {
  if (!existsSync(dir)) throw new Error('gate: screenshots/: no such directory');
  const names = readdirSync(dir).filter((n) => !n.startsWith('.')).sort();
  if (names.length < 3 || names.length > LIMITS.screenshots.max) {
    throw new Error(`gate: screenshots/: ${names.length} images, need 3 or 4`);
  }
  let total = 0;
  for (const n of names) {
    const st = statSync(join(dir, n));
    if (!st.isFile()) throw new Error(`gate: screenshots/${n}: not a file`);
    if (st.size > LIMITS.screenshots.max_bytes) {
      throw new Error(`gate: screenshots/${n}: ${st.size} bytes, over the 256 KiB cap`);
    }
    total += st.size;
  }
  return { names, total };
}

const gameDir = join(ROOT, 'game');
const shotsDir = join(ROOT, 'screenshots');
if (!existsSync(gameDir)) throw new Error('gate: game/: no such directory');
const tree = measureTree(gameDir, '');
if (tree.files > LIMITS.game_max_files) {
  throw new Error(`gate: game/: ${tree.files} entries, over the ${LIMITS.game_max_files} cap`);
}
if (tree.bytes > LIMITS.game_max_bytes) {
  throw new Error(`gate: game/: ${tree.bytes} bytes, over the 48 MiB cap`);
}
const indexStat = statSync(join(gameDir, 'index.html'));
if (indexStat.size > INDEX_HTML_MAX) {
  throw new Error(`gate: game/index.html: ${indexStat.size} bytes, over the 1 MiB cap`);
}
const shots = checkShots(shotsDir);

// ---- shots.json cross-check: the staged-shot manifest must name exactly
// the files on disk, so a renamed screenshot cannot slip through silently ----
const manifestPath = join(ROOT, 'shots.json');
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const wanted = manifest.map((s) => s.name).sort();
  const have = shots.names.slice().sort();
  if (JSON.stringify(wanted) !== JSON.stringify(have)) {
    throw new Error(`gate: shots.json lists [${wanted.join(', ')}] but screenshots/ has [${have.join(', ')}]`);
  }
}

// ---- hand-in: copy, then write the dossier buildDossier computes ----
// Never remove DEST itself: in the grader it is a bind-mounted volume and
// removing a mount point fails (EBUSY). Create it, then clear only its contents.
mkdirSync(DEST, { recursive: true });
for (const name of readdirSync(DEST)) {
  rmSync(join(DEST, name), { recursive: true, force: true });
}
cpSync(gameDir, join(DEST, 'game'), { recursive: true });
cpSync(shotsDir, join(DEST, 'screenshots'), { recursive: true });
const dossier = buildDossier(DEST, LIMITS);
writeFileSync(join(DEST, 'dossier.json'), dossier);

// ---- run summary ----
console.log('SOLMAR CITY — hand-in complete');
console.log(`  game/: ${tree.files} entries, ${tree.bytes} bytes`);
console.log(`  game/index.html: ${indexStat.size} bytes`);
console.log(`  screenshots/: ${shots.names.join(', ')} (${shots.total} bytes)`);
console.log(`  dossier.json: ${dossier.length} bytes`);
console.log(`  dossier sha256: ${createHash('sha256').update(dossier).digest('hex')}`);
console.log(`  output: ${DEST}`);
