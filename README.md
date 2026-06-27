# Orbit — Tower Factory Defence

A browser-based incremental tower defence + factory game. Build a refining
chain, automate ammo production with conveyor belts, and defend your HQ from
escalating waves of enemies. Works on desktop and mobile.

> **No build step, no dependencies.** Just static HTML / CSS / vanilla JS using
> the Canvas + Web Audio APIs.

![Orbit gameplay screenshot](screenshot.png)
<!-- TODO: drop a screenshot here, e.g. take one after building your first factory line -->

## Play

Open `index.html` in any modern browser, or play locally:

```
git clone https://github.com/MelsomNO/orbit-factory-defence.git
cd orbit-factory-defence
# Either just double-click index.html, or:
python -m http.server 8000   # then visit http://localhost:8000
```

A tiny static server isn't required — `file://` works fine.

## How it plays

You start with **nothing**. Tap & drag ore (◆) from resource nodes onto HQ to
bootstrap. HQ refines ore into plates (▣). Convey plates into ammunition plants
to produce bullets (●) or missiles (▲). Convey ammo into your turrets.

The full chain:

```
◆ Node → Harvester → Conveyor → HQ → Conveyor → Bullet Plant → Conveyor → Gun Turret
                                  └→ Conveyor → Missile Plant → Conveyor → Missile Turret
                                  └→ ⚡ Power Plant → Laser Turret (uses global power)
```

Turrets each hold up to **10 ammo** (more with storage upgrades). Lasers draw
from a global ⚡ power pool fed by Power Plants — no ammo belts needed.

### Defence

Each round you get a prep timer (60 s for round 1, 25 s between waves) to build
and improve your factory. Enemies spawn from the map edge and walk straight at
the HQ. If they reach it, they hit HQ HP — let too many through and you lose.

| Enemy | HP | Speed | HQ Damage | Unlocks |
| ----- | -- | ----- | --------- | ------- |
| 🔴 Grunt | 1× | 1× | 35 | Round 1 |
| 🟡 Scout | 0.45× | 1.8× | 14 | Round 3 |
| 🟣 Tank | 3× | 0.55× | 50 | Round 5 |
| 🟤 Brute | 5.5× | 0.4× | 80 | Round 8 |

(HP and damage scale per round on top of these multipliers.)

### Buildings

- **Harvester** — auto-mines from a node, pushes ore onto adjacent conveyors
- **Conveyor** — drag to lay; corners auto-curve, T-junctions auto-form
- **Splitter** — convert a conveyor tile to split 1 input across 2 outputs (alternating)
- **Refinery** — like HQ but small buffers; useful far from HQ
- **Bullet / Missile Plant** — consume plates, produce ammo
- **Power Plant** — adds ⚡ capacity + regen for lasers
- **Gun / Missile / Laser Turret** — defence

### Upgrades

Each upgradeable building has up to 3 **Speed** tiers and 2 **Storage** tiers
(missile turret gets **Range** instead of storage). Upgrades visible as stars
above each building.

### Obstacles

Indestructible rocks scatter on the map and grow with each round's expansion.
You'll need to route conveyors around them.

## Controls

### Desktop

| Action | Input |
| ------ | ----- |
| Build menu hotkeys | `1`–`9`, demolish `X` / `Delete` |
| Pause / resume | `Space` |
| Mute / unmute | `M` |
| Cancel tool | `Esc` |
| Pan camera | middle / right mouse drag |
| Zoom | scroll wheel |
| Reset view | `⌖` button (appears once panned) |
| Harvest ore | click a node, drag to HQ |
| Lay conveyor | select Conveyor tool, drag |
| Inspect / upgrade / demolish | click any building, conveyor, or HQ |

### Mobile

- **Single finger**: tap to place, tap-and-drag to harvest ore / lay conveyor
- **Two-finger drag**: pan
- **Pinch**: zoom

## Tech notes

- **Canvas 2D** for everything — entities, particles, build previews
- **Web Audio API** for procedural SFX (no audio files)
- **No build tooling** — `index.html` loads vanilla JS files in dependency order
- All gameplay constants live in `js/config.js` for easy tuning

## Scoreboard (optional backend)

When your HQ is destroyed you can enter a name to save how many rounds you
survived to a shared leaderboard. This needs the little Node + Postgres server
in [`server/`](server). **It's entirely optional** — open `index.html` with no
server and the game plays exactly as before; the game-over screen just shows
**Play Again** instead of the name form (it detects the backend is missing and
degrades gracefully).

### Run it

```
# 1. Postgres: create a dedicated role + database
createuser orbit_game --pwprompt          # choose any password
createdb -O orbit_game orbit_game

# 2. Configure the server
cd server
cp .env.example .env                       # then edit DATABASE_URL with your password
npm install

# 3. Start it (creates the `scores` table on first boot)
npm start                                  # → http://localhost:3000
```

Now play at `http://localhost:3000` (served by the same process) and your
scores persist. `server/.env` is gitignored so your credentials never get
committed.

### API

| Method | Route          | Body                  | Description                       |
| ------ | -------------- | --------------------- | --------------------------------- |
| `GET`  | `/api/scores`  | —                     | Top 20 scores, highest rounds first |
| `POST` | `/api/scores`  | `{ name, rounds }`    | Record a score (returns its rank) |
| `GET`  | `/api/health`  | —                     | Liveness probe                    |

### Production deploy

In production the static game is served by nginx and `/api/` is reverse-proxied
to the Node server (kept alive by systemd). The bits that make that work live in
[`server/deploy/`](server/deploy):

- `orbit-scoreboard.service` — systemd unit; runs `node server.js` from
  `server/`, restarts on failure, starts on boot. The server binds to
  `127.0.0.1` (set `HOST=0.0.0.0` to expose it directly).
- `nginx-orbit-game.conf.example` — nginx server block: serves the repo and
  proxies `location /api/` → `http://127.0.0.1:3020`.

```
sudo cp server/deploy/orbit-scoreboard.service /etc/systemd/system/
sudo systemctl enable --now orbit-scoreboard
# add the /api/ proxy block to your nginx site, then:
sudo nginx -t && sudo systemctl reload nginx
```

Set `PORT` in `server/.env` to whatever the nginx `proxy_pass` points at (3020
in the example).

> This is a personal-interest project: scores are trusted as submitted, with no
> anti-cheat. Names are length-capped and HTML-escaped on render; that's it.

## File layout

```
index.html           HUD, intro modal, info panel, game-over + scoreboard
styles.css           layout + responsive HUD
js/config.js         balance numbers, costs, recipes, enemy & upgrade defs
js/state.js          singleton State + Grid lookup
js/world.js          generation: HQ, nodes, obstacles, camera helpers
js/sound.js          procedural sound effects
js/entities.js       placement, factory/conveyor/turret/enemy tick logic
js/render.js         all canvas drawing
js/input.js          unified pointer (mouse + touch), pan/zoom, hotkeys
js/scoreboard.js     game-over name entry + leaderboard (talks to /api)
js/main.js           game loop, HUD updates, info panel, intro
server/              optional Express + Postgres scoreboard backend
```

## License

MIT — see [LICENSE](LICENSE).
