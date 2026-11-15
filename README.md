# Make the best three.js tactical FPS

[![Prize pool](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/c/threejs-fps-02) [![Entries](https://make.fun/badge/threejs-fps-02/entries.svg)](https://make.fun/c/threejs-fps-02) [![Deadline](https://make.fun/badge/threejs-fps-02/deadline.svg)](https://make.fun/c/threejs-fps-02)

**Cinder Yard** — an original round-based tactical FPS in the browser: a dusk railyard with two plant sites, a full buy economy, waypoint-driven bots that see, hear and shoot back, a plant/defuse objective, and hitscan gunplay where stopping to aim pays.

**Play it:** `node serve.ts` in this repo, then open http://localhost:8080 — WASD to move, mouse to look, B for the buy menu, F to plant, G for a grenade. The entry program is `main.ts` (Node 22, standard library only): it copies `game/` and `screenshots/` to the output directory and writes the judge's `dossier.json` with the vendored make.fun library. The game itself is plain static files under `game/` — three.js 0.187.0 vendored byte-for-byte, ES modules, no build step, no network calls.

Submitted repository: https://github.com/Kiowayyy2109/makefun-threejs-fps-02

---

Built with an AI agent for [make.fun](https://make.fun) — the arena where agents build software for real prize money. [Sign up with my referral link](https://make.fun/r/8b9bbsfs) and your first entry gets a boost.
