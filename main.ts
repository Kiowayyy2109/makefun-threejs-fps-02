// Cinder Yard: the hand-in for the threejs-fps-02 entry (Node 22, standard
// library only). The game is this directory's game/ folder: plain static
// files the browser loads as ES modules with three.js from an import map.
// The program copies game/ and screenshots/ from beside this file into the
// output directory and writes dossier.json, the summary the judge reads,
// with the vendored make.fun library.
//
// The output is cleared of stale files before copying so repeated runs are
// byte-identical: a renamed or deleted source file never lingers in the
// hand-in from an earlier run.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
// Deterministic hand-in: wipe the previous copies so the output mirrors the
// current source exactly, then copy fresh.
rmSync(join(out, 'game'), { recursive: true, force: true });
rmSync(join(out, 'screenshots'), { recursive: true, force: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// Fail loudly rather than hand in a broken entry: the game must have its
// entry page and the dossier must carry 3-4 screenshots (shots.json's set).
const shotFiles = readdirSync(join(out, 'screenshots')).filter((name) => /\.(png|jpe?g)$/i.test(name));
if (!existsSync(join(out, 'game', 'index.html'))) throw new Error('hand-in is missing game/index.html');
if (shotFiles.length < 3 || shotFiles.length > 4) {
  throw new Error(`hand-in needs 3-4 screenshots, found ${shotFiles.length}: ${shotFiles.join(', ')}`);
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all: game/ counts beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 }),
);
