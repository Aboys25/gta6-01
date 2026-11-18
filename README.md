# Solmarina — Sun, Salt & Second Chances

Solmarina is an original open-world crime game that runs offline in a desktop browser, built for the make.fun gta6-01 bounty.

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Aboys25/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Aboys25/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

See the bounty page on [make.fun](https://make.fun/bounty/gta6-01) for the full brief this game was built against.

## The game

You are Dario Venn, a wheelman new to Solmarina — a sun-soaked bay city of palm avenues, rooftop bars, and one very impatient fixer, Sol Reyes. Run her five jobs, buy back your impounded garage, and try not to end the week in a cell.

Solmarina is a 3D city you can explore on foot and by car. Traffic drives the avenues, pedestrians walk the streets, and the police respond to trouble with a wanted-star system: cause chaos and the heat rises, patrol cars give chase, and getting caught means a fine and a trip to the Harbor Heights safehouse. Jobs are picked up from the jobs menu, unlock in order, and pay on completion. The HUD shows your cash, current district, wanted level, health, a live minimap, mission objectives, and a speedometer while driving.

Everything in the game is original — the city layout, the characters, the cars, the story, and the music, which is synthesized live in the browser. Nothing is streamed and nothing loads over the network: the whole game is static files, with three.js vendored locally.

## How to play

Serve the `game/` directory from any static file server and open it in a desktop browser:

```sh
cd game
python3 -m http.server 8080
```

Then visit http://localhost:8080. Keyboard and mouse required.

| Key | Action |
| --- | --- |
| WASD / arrows | Walk and drive |
| Shift | Run |
| Mouse | Look around |
| E | Take / leave a car |
| Space | Brake |
| F | Punch |
| 1 / 2 | Fists / pistol |
| Click | Fire |
| M | Jobs menu |
| P | Pause |
| N | Toggle sound |

Progress saves in the browser, so you can pick up where you left off.

## Layout

- `game/` — the game itself: `index.html` plus the source modules under `game/src/` (city, roads, vehicles, pedestrians, police, missions, HUD, audio, saves) and the vendored three.js build under `game/vendor/`.
- `screenshots/` — four in-game screenshots: the city cover shot, a street-level shot, driving, and a police chase.
- `main.ts` — the entry program. It copies `game/` and `screenshots/` into the output directory and writes `dossier.json` using the kit library in `vendor/`.
- `vendor/` — the kit's dossier library, used unmodified.

## License

MIT — see `LICENSE`.
