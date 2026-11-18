# SOLMAR CITY — an open-world crime story

Jax Marlowe, ex-wheelman, owes fixer **Mara Voss** $50,000. Five jobs stand
between him and freedom: steal a car, run a package, lose the heat, race the
coast, and rob three shops — then get out clean. The whole city is open, on
foot or behind the wheel. All names, places, art, sounds and music are
original — nothing from Rockstar Games or any commercial game.

## Play

```sh
node serve.ts            # serves game/ at http://127.0.0.1:8080/
```

Open `game/index.html` in desktop Chrome (or any static server). No network,
no build step: every asset is a file under `game/` or a `data:` URI, Three.js
is vendored at `game/vendor/three.module.min.js`.

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
- **Driving** — arcade physics, chase camera, handbrake drift, traffic that
  stops for the car ahead, pedestrians who flee gunfire.
- **Wanted 0–5 stars** — stealing, shooting and speeding near cops raise the
  heat; police cars chase and ram, foot cops arrest on contact, a helicopter
  circles at 4+ stars; the heat decays while you stay unseen.
- **Combat** — 12-round pistol with tracers and muzzle flash, punch, health
  regen, WASTED / BUSTED respawns with a cash penalty.
- **Missions** — five-job story chain with beacon, minimap blip and live HUD
  distance; rewards pay down the debt.
- **HUD** — money, health, ammo, wanted stars + rank, mission banner, live
  circular minimap, speedometer, toasts, damage vignette.
- **Save** — autosaves on mission complete; CONTINUE from the menu.
- **Audio** — WebAudio synth only: engine hum, two-tone siren, gunshots,
  jingles, ambient pad. No audio files.

## Staged screenshots

`?shot=cover|street|mission|menu` skips the menu and stages a deterministic
scene for each screenshot (see `shots.json`).

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # writes out/dossier.json
node playtest.mjs                                      # 12 scripted Playwright checks
```

`main.ts` (Node 22, stdlib only) gate-checks the bounty caps, copies `game/`
and `screenshots/` to the output directory and writes `dossier.json` with
`buildDossier` from `vendor/makefun-game.ts`. Two runs write identical bytes.

## Layout

```
main.ts            entrypoint: gate checks + copy + dossier
serve.ts           tiny static server for local play
game/
  index.html       page + HUD DOM + import map
  styles.css       HUD / menu styling
  vendor/three.module.min.js   vendored three.js r160
  src/
    util.js        seeded RNG + math helpers
    audio.js       WebAudio synth (engine, siren, shots, pad)
    city.js        grid city, shops, beach, docks, collision
    player.js      on-foot movement, jump, health
    vehicles.js    car mesh + arcade driving physics
    traffic.js     AI cars + pedestrians
    police.js      wanted response, foot cops, helicopter
    combat.js      pistol, punch, reload, tracers
    missions.js    five-job story chain + beacon
    hud.js         HUD, minimap, toasts, overlays
    save.js        localStorage save / load
    shots.js       staged ?shot= scenes
    main.js        wiring + game loop + camera
screenshots/      4 real renders (cover first)
```

## License

MIT — see `LICENSE`.
