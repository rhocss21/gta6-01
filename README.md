# SOLMAR CITY — an open-world crime story

Jax Marlowe, ex-wheelman, owes fixer **Mara Voss** $50,000. Five jobs stand
between him and freedom: steal a car, run a package, lose the heat, race the
coast, and rob three shops — then get out clean. The whole city is open, on
foot or behind the wheel. All names, places, art, sounds and music are
original — nothing from Rockstar Games or any commercial game.

This entry is a fresh rebuild: the same complete city, but every screenshot
now shows the systems at work — the cover is the chase starting **on foot**
on the beach road at golden hour, with the police dispatch panel, Mara's
dialogue, the debt-paydown line and a minimap that draws the mission route
and the wanted radius. One fix over the earlier build: the big speed number
on foot is labelled for what it is — the closing interceptor's speed
("TARPON 38 CLOSING · 87 KM/H"), never the on-foot player's speed.

## Play

```sh
node serve.ts            # serves game/ at http://127.0.0.1:8080/
```

Open `game/index.html` in desktop Chrome (or any static server). No network,
no build step: every asset is a file under `game/`, Three.js is vendored at
`game/vendor/three.module.min.js`.

## Controls

| Key | Action |
| --- | --- |
| WASD | move / drive (Shift sprint) |
| Mouse drag | orbit camera |
| Space | jump (on foot) / handbrake (driving) |
| E | steal / enter / exit car |
| Click | fire pistol |
| F | punch |
| R | reload |
| M | mute |
| Esc | pause |

## Systems

- **City** — 9×9 block grid with a beach, docks, shops, palms, streetlights
  and a skyline; deterministic seeded layout (`?seed=` overrides, default 7).
  Two times of day: golden hour (default) and neon night (`?shot=night`).
- **Driving** — arcade physics, chase camera, handbrake drift, named cars
  with a condition readout, traffic that stops for the car ahead,
  pedestrians who flee gunfire.
- **Wanted 0–5 stars** — stealing, shooting and speeding near cops raise the
  heat; police cars chase and ram, foot cops arrest on contact, a helicopter
  with a ground-reaching spotlight circles at 4+ stars; the heat decays
  while you stay unseen.
- **Police dispatch** — a live panel of every unit by callsign with role,
  distance and speed (RAMMING / PURSUIT / FLANKING / SPOTLIGHT).
- **Combat** — 12-round pistol with tracers and muzzle flash, punch, five
  weapon slots (some locked until later jobs), health regen, armor,
  WASTED / BUSTED respawns with a cash penalty.
- **Missions** — five-job story chain with beacon, minimap route, stage
  counter, NEXT objective and a par-time countdown; rewards pay down the
  debt, and the HUD shows the debt left after the current job.
- **HUD** — money, health + armor, weapon slots, wanted stars + status,
  rank + respect bar, clock, radio station, crew cards, character dialogue,
  location name, speedometer with car name + condition, live circular
  minimap with a mission-route line and a WANTED RADIUS ring, toasts,
  damage vignette.
- **Save** — autosaves on mission complete; CONTINUE from the menu.
- **Audio** — WebAudio synth only: engine hum, two-tone siren, gunshots,
  jingles, ambient pad. No audio files.

## Staged screenshots

`?shot=cover|street|mission|night` skips the menu and stages a deterministic
scene for each screenshot (see `shots.json`):

1. **cover** — the chase starts on foot on the beach road: Jax sprinting to
   the Calyx, interceptor TARPON 38 closing at 87 km/h, Air One's spotlight,
   4 stars.
2. **street** — on foot stealing a car on Palm Row, steal prompt, pedestrians
   and traffic.
3. **mission** — the Three-Shop Heist at Sunset Liquor: pistol tracer toward
   the foot cop closing in, hold-up bar at 62%.
4. **night** — neon night on the same beach road: the Calyx at 87 km/h,
   interceptors behind, Air One overhead.

## Source layout

| File | Job |
| --- | --- |
| `game/src/main.js` | wiring, game loop, camera, input, menus |
| `game/src/city.js` | the city: grid, beach, shops, palms, lights |
| `game/src/player.js` | Jax on foot: walk, sprint, jump, punch |
| `game/src/vehicles.js` | car meshes + arcade driving physics |
| `game/src/traffic.js` | AI cars + pedestrians |
| `game/src/police.js` | wanted system: interceptors, foot cops, helicopter |
| `game/src/combat.js` | pistol, punch, tracers, weapon slots |
| `game/src/missions.js` | the five-job story chain + debt paydown |
| `game/src/hud.js` | HUD + live minimap (route + wanted radius) |
| `game/src/dispatch.js` | the police-dispatch panel |
| `game/src/dialogue.js` | character lines, crew cards, radio stations |
| `game/src/audio.js` | WebAudio synth: engine, siren, pad, effects |
| `game/src/save.js` | localStorage save / load |
| `game/src/shots.js` | staged screenshots (`?shot=`) |
| `game/src/util.js` | seeded random, math, formatting |

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # writes out/dossier.json
```
