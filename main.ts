// Solmarina (gta6-01) — entry program, Node 22 standard library only.
// Copies the game and its screenshots into the output directory and writes
// dossier.json with the kit's buildDossier library, exactly as the gate
// rebuilds it. Run outside the grader with MAKEFUN_OUTPUT_DIR set:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

// The game itself: static files under game/, nothing else.
copyTree(join(root, 'game'), join(outDir, 'game'));

// Screenshots, first by name is the cover. Only real renders, 3 or 4.
const shotsDir = join(root, 'screenshots');
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) {
  const shots = readdirSync(shotsDir).filter((name) => !name.startsWith('.')).sort();
  if (shots.length < 3 || shots.length > 4) {
    throw new Error(`expected 3 or 4 screenshots, found ${shots.length}`);
  }
  copyTree(shotsDir, join(outDir, 'screenshots'));
}

// The dossier the judge reads: the kit library's own output, byte for byte
// what the sealed scorer rebuilds from the same files.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`wrote ${outDir} (dossier ${dossier.length} bytes)`);
