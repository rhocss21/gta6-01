// SOLMAR CITY — gta6-01 entrypoint (Node 22, standard library only).
// Copies game/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json with the kit's buildDossier. Unlike the starter it
// validates the scorer's caps up front (so a bad entry fails loudly here
// instead of silently in the gate) and prints a one-line run summary; the
// copy itself stays byte-for-byte deterministic, so two runs match exactly.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps (reference/gate.json). game_max_files is 993, not 1000:
// /output itself caps at 1000 entries and game/ counts beside screenshots/
// and dossier.json, so 993 game entries + those make 1000.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function countGameEntries(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) {
      const sub = countGameEntries(p);
      files += sub.files + 1;
      bytes += sub.bytes;
    } else if (name.isFile()) {
      files += 1;
      bytes += statSync(p).size;
    }
  }
  return { files, bytes };
}

// Pre-flight: refuse to package an entry the gate would refuse, with a
// clear reason instead of a silent invalid grade.
const shotsDir = join(here, 'screenshots');
const shotNames = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter((n) => !n.startsWith('.'))
  : [];
if (shotNames.length < 3 || shotNames.length > CAPS.screenshots.max) {
  throw new Error(`need 3 or 4 screenshots, found ${shotNames.length}`);
}
for (const name of shotNames) {
  const size = statSync(join(shotsDir, name)).size;
  if (size > CAPS.screenshots.max_bytes) {
    throw new Error(`screenshot ${name} is ${size} bytes, over the 256 KiB cap`);
  }
}
const gameStats = countGameEntries(join(here, 'game'));
if (gameStats.files > CAPS.game_max_files) {
  throw new Error(`game/ has ${gameStats.files} entries, over the 993 cap`);
}
if (gameStats.bytes > CAPS.game_max_bytes) {
  throw new Error(`game/ is ${gameStats.bytes} bytes, over the 48 MiB cap`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));

console.log(
  `SOLMAR CITY packaged: game/ ${gameStats.files} entries, ` +
    `${gameStats.bytes} bytes; ${shotNames.length} screenshots; dossier written.`,
);
