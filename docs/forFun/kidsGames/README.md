# Kids' Games

16 self-contained, touch-first browser games for kids ~2–9, served as static files
(no build step). The hub page (`index.html`) is a hand-curated grid — when adding a
game, add a card there too.

## Conventions (every game)

- **Files**: exactly `index.html` + `style.css` + `game.js` per folder (classic
  script, no ES modules, no external JS libs, no fetched assets). Only external
  resource allowed: Google Fonts *Fredoka*. Exception: `matching/images/` (plushie
  card faces).
- **Design family**: page bg `#fdf4ff`, blurred pastel background blobs, white
  rounded cards, palette coral `#ff6b6b` / teal `#4ecdc4` / yellow `#ffe66d` /
  purple `#a29bfe` / mint `#55efc4` / ink `#2d3436` / dim `#636e72`, Fredoka font.
- **Chrome**: floating 🏠 button (top-left → `../index.html`) and 🔊/🔇 toggle
  (top-right) on every game.
- **Audio**: WebAudio only, synthesized; one lazily-created AudioContext (first
  pointerdown), master gain for mute. Mute state shared across games via
  localStorage `kidsGames.muted` (`'1'` = muted). `numbers`/`balloonPop` may also
  use speechSynthesis (feature-detected, respects mute).
- **Input**: pointer events, `touch-action:none` on play surfaces, hit targets
  ≥56px, keyboard support on desktop. Portrait and landscape both work; canvases
  handle resize + devicePixelRatio.
- **Flow**: big ▶ Play menu overlay, in-page overlays only (never `alert`),
  confetti celebrations, gentle failure states.
- **Persistence**: localStorage keys namespaced `kidsGames.<folder>.*`.

## Lineup

| Folder | Game | Age |
|---|---|---|
| `numbers` | Number Fun (counting activities) | 2+ |
| `balloonPop` | Balloon Pop (free/numbers/letters) | 2+ |
| `whackAMole` | Whack-a-Mole | 3+ |
| `coloringGame` | Coloring Book (SVG tap-fill) | 3+ |
| `monsterMaker` | Monster Maker (mix-and-match builder) | 3+ |
| `rockstar` | Rockstar (drums/piano/xylophone/guitar) | 3+ |
| `matching` | Memory Match (plushie photos + emoji themes) | 3+ |
| `pong` | Paddle Party (1P vs robot / 2P touch) | 4+ |
| `mazeRunner` | Maze Explorer (procedural mazes, tap-to-walk) | 4+ |
| `simon` | Simon (sequence memory) | 4+ |
| `ticTacToe` | Tic-Tac-Toe (silly→minimax robot) | 4+ |
| `snake` | Snakey Snack Time (wrap-around kid mode) | 5+ |
| `brickBreaker` | Rainbow Smash (8 picture levels, power-ups) | 5+ |
| `miniGolf` | Mini Golf (9 holes, windmill, portals) | 5+ |
| `spaceInvaders` | Cosmic Critters | 6+ |
| `asteroids` | Space Rocks (shielded ship, joystick) | 6+ |

## Local dev

`.claude/launch.json` has a `kidsGames` config (port 8756, no-store cache headers,
opens `/docs/forFun/kidsGames/`).
