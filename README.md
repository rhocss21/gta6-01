# SOLMAR CITY — Make GTA 6 (gta6-01)

An original sun-soaked open-world crime game in three.js, built for the
[make.fun gta6-01 competition](https://make.fun/c/gta6-01). Static files only,
no network, keyboard + mouse. Your city. Your debt. Your rules.

## The story

Jax Marlowe, ex-wheelman, owes fixer **Mara Voss** $50,000. Five jobs stand
between him and freedom: steal a car and deliver it, pick up a package, lose
the heat, win a coastal checkpoint run, and pull a three-shop heist. Finish
them all and you're the **King of Solmar**.

## Play

Serve `game/` with any static server — `node serve.ts`, then open
http://localhost:8080 — and click **NEW GAME**.

| Input | Action |
| --- | --- |
| WASD | Walk / drive |
| Mouse | Orbit camera (drag, or click to lock) |
| E | Steal / enter / exit a car |
| Space | Jump (on foot) / handbrake (driving) |
| Click | Fire pistol |
| F | Punch |
| R | Reload |
| M | Mute |
| Esc | Pause |

## Systems

- **City** — 400×400 grid district with 60+ procedural buildings, palms,
  lamps, a beach and ocean, and landmarks (Sunset Garage, Neon Palms Club).
- **On foot & driving** — third-person walking with jump and punch; arcade
  car physics with steering, handbrake, collisions, and car theft.
- **Traffic & pedestrians** — 10 civilian cars on road loops, 14 pedestrians
  who flee speeding cars and gunfire.
- **Wanted & police** — 0–5 stars from theft, assault, and kills; police cars
  chase and ram, foot cops chase and arrest (Busted), wanted decays when you
  hide.
- **Missions** — 5-job story chain with beacon, HUD arrow, and distance;
  cash rewards; free-roam "King of Solmar" after the last job.
- **Combat** — pistol with 12-round mag and reload, punch, health, Wasted
  screen with retry.
- **HUD** — cash, health, ammo, wanted stars, objective + arrow, speed, live
  2D minimap, toasts, prompts, damage flash.
- **Save** — progress persists in localStorage; Continue resumes it.
- **Sound** — fully synthesized WebAudio: engine, siren, gunshots, jingles,
  ambient pad. No audio files.

## Structure

```
main.ts                  Node 22 entrypoint: copies game/ + screenshots/ to /output,
                         writes /output/dossier.json with vendor/makefun-game.ts
game/index.html          HUD + screens, import map for three.js
game/styles.css          HUD and menu styling
game/vendor/three.module.min.js   three.js r160 (vendored)
game/src/main.js         orchestration, input, menus, game loop
game/src/city.js         city generation, landmarks, collision
game/src/player.js       on-foot movement, camera
game/src/vehicles.js     car models, driving physics, steal/enter/exit
game/src/traffic.js      civilian cars + pedestrians
game/src/police.js       wanted level, pursuit, arrest, bust/wasted
game/src/combat.js       pistol, punch, damage
game/src/missions.js     5-mission story chain
game/src/hud.js          HUD + live minimap
game/src/audio.js        synthesized WebAudio sound
game/src/save.js         localStorage save
game/src/shots.js        ?shot= staging for screenshots
game/src/util.js         shared helpers
screenshots/             4 real browser renders of the game
```

## License

MIT. All city, character, vehicle, story, art, and sound content is original —
nothing from Rockstar Games / Grand Theft Auto or any other commercial game.
