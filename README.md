# Burger Munch

A complete, playable re-creation of the classic arcade maze game — rebuilt with a
new cast:

| Classic          | This game                                              |
| ---------------- | ------------------------------------------------------ |
| Pac-Man          | a pixel **burger** (sesame bun, cheese, patty, olive)   |
| The four ghosts  | **Tomato Heads** in Tilted Towers, **Ravens** in Dusty Divot — each map has its own skin |
| The blue maze    | two Fortnite maps — **Tilted Towers** and **Dusty Divot** — each with its own layout and theme |
| A black screen   | the **aerial map** behind the board: the town and its river, or the meteor crater and its blast streaks |
| Dots / power pellets | **mini shields** / **chug jugs**                    |
| Cherries & fruit | the **Loot Llama**, worth more the further you get     |
| Spare lives      | **reboot cards**                                        |

Every sprite is drawn procedurally as pixel art, and the aerial map behind the
board is drawn at full resolution (the game stays pixelated; the world it sits
in does not), all at load time, so there is **no build step**. The only image file in the project
is the Victory Royale banner in `assets/` (Epic Games artwork, dropped in as-is
for the win screen; the game falls back to a drawn banner if it is missing).
The arcade font is bundled in `fonts/`, so it looks right with no internet.

## Play it

It runs as a desktop app in its own window - no address bar, no tabs, no
browser. Three ways in, easiest first:

**1. Double-click it** (nothing to install)

| Your machine | Double-click |
| --- | --- |
| Windows | `Burger Munch.bat` |
| macOS / Linux | `burger-munch.sh` |

These borrow the browser engine already on the machine and run it in app mode,
so you get a bare game window with no browser around it.

**2. Run it from a terminal** (needs [Node.js](https://nodejs.org))

```bash
npm install      # once, downloads the Electron runtime
npm start        # opens the game window
```

**3. Build a standalone app** you can keep on the desktop or hand to someone

```bash
npm run build            # Windows -> dist/Burger Munch 1.0.0.exe (portable, no installer)
npm run build:installer  # Windows -> a normal setup .exe
npm run build:mac        # macOS   -> dist/*.dmg
npm run build:linux      # Linux   -> dist/*.AppImage
```

The result in `dist/` is a single file that runs on its own - the person you
give it to needs neither Node nor a browser.

<details>
<summary>Still want it in a browser tab?</summary>

```bash
python3 -m http.server 8000
# then browse to http://localhost:8000
```

</details>

| Control | Action |
| --- | --- |
| Arrow keys / WASD | Move |
| Enter / Space | Start, restart, pause |
| P | Pause |
| M | Sound on / off |
| F, or F11 in the app | Full screen |
| 1 / 2 / 3 | Easy / Hard / Extreme (on the menus) |
| Swipe or on-screen D-pad | Move (touch devices) |

## Maps

Pick a map on the title screen with the left and right arrows, or the Map
button in the HUD. Both are the same 28 x 31 arcade grid - so the ghost house,
the tunnel and the burger's start tile line up - but the layout and the theme
change, and each map keeps its own high scores.

| | Tilted Towers | Dusty Divot | Loot Lake | Pleasant Park |
| --- | --- | --- | --- | --- |
| Pick-ups | 244 | 298 | 292 | 296 |
| Walls | concrete towers | banks of earth | timber jetties | houses and hedges |
| Floor | asphalt | scorched dirt | shallow water | suburban streets |
| The middle | the ghost house | the research site | the house on the water | the football pitch |
| Enemy skin | Tomato Head | Raven | Tomato Head | Raven |
| Hazard | none | dust (slower) | shallows drag you | hedges hide quicker enemies |

Every layout is validated at build time: 28 x 31, every pick-up reachable,
exactly four power pellets, no dead-end corridors, no 2x2 open blocks, and the
tiles the engine hardcodes (the ghost door, the tunnel mouths, the burger's
start) all where they should be.

## What's in a run

Beyond the arcade rules, a run now carries:

- **Combos** — consecutive pick-ups build a chain; every ten raises the
  multiplier, to x8. Getting caught breaks it.
- **Power-ups** — chili pepper (speed), golden burger (double points), shield
  (survive one hit), freeze, shockwave (clears nearby enemies) and magnet.
- **Bosses** — every fourth board spawns a crowned enemy with three hit points.
  It is only vulnerable while a chug jug is running.
- **Random events** — double score, faster enemies, low light, bonus pellets,
  maze shift (new passages open) and speed round, each announced across the
  screen.
- **Secret vaults** — two hidden rooms per board, behind walls only the burger
  can pass. Worth 2500 and an achievement.
- **Bonus rounds** — every third board, the enemies leave and you have 22
  seconds to sweep up as much as you can.
- **Achievements** — eight of them, tracked across runs and shown on the menu.

## Difficulty

Pick a mode on the title screen with the arrow keys, <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd>,
or the Mode button in the HUD. Each mode scales the arcade curves rather than
replacing them, so level progression still behaves properly, and each keeps its
own high score.

| | Easy | Hard | Extreme |
| --- | --- | --- | --- |
| Boards to win | 5 | 8 | 3 |
| Power-up every | 9s (3 on board) | 16s (2) | 26s (1) |
| Random event every | 26s | 20s | 13s |
| Pinky cuts ahead | 4 tiles | 5 | 6 |
| Clyde loses nerve within | 8 tiles | 6 | 3 |
| Lives | 5 | 3 | 1 |
| Burger speed | 197 px/s | 188 px/s | 189 px/s |
| Jonesy speed | 138 px/s | 173 px/s | **208 px/s — faster than you** |
| Shield potion | 14s, never under 7s | arcade table (6s, falling) | ~2.7s, falls away fast |
| Ghosts out of the house | late (doubled dot counters) | arcade counters | all four immediately |
| Scatter (safe) phases | 1.7x longer | arcade | barely any |
| Extra life | 8 000 | 10 000 | 25 000 |
| Score | x1 | x2 | x4 |

Clear every board on a mode and you get a **Victory Royale** — #1, confetti, a
fanfare and your final score, with your win count on that mode kept alongside
its high score. The HUD counts your progress (`Lv 3/5`), so the finish line is
always visible.

The mode is remembered between visits, and the picker locks while a run is in
progress.

## What's implemented

The maze is the original 28 × 31 arcade layout (all 244 pick-ups), and the rules
follow the arcade closely:

- **Four distinct Tomato Head personalities.** Blinky chases directly, Pinky aims four
  tiles ahead of the burger, Inky uses the Blinky-through-burger vector, and
  Clyde chases until he gets within eight tiles then bolts for his corner. The
  original's "look up = also look left" targeting quirk is reproduced.
- **Scatter / chase waves** on the arcade timing table, with the forced
  direction reversal on every mode switch.
- **Shield potions (power pellets)** frighten every ghost, flash a warning
  before wearing off, and score 200 → 400 → 800 → 1600 for a chain of four.
- **Eaten ghosts** become floating eyes and return to the house along a
  breadth-first path, then re-launch.
- **Ghost house release** driven by the dot counter (Inky at 30, Clyde at 60)
  with a four-second stall timer as backup.
- **The tunnel** wraps on row 14, and ghosts crawl through it.
- **Loot** appears twice a level (after 70 and 170 pick-ups) and is worth
  100 – 1000 points depending on the level.
- **A real ending.** Clearing the last board on a mode wins the run outright
  rather than looping forever.
- **Cornering.** A turn is accepted within 10px before a junction and 8px
  after it, not only on the single frame the burger sits dead-centre. At
  200px/s that centre lasts about 3px, so without it an ordinary press missed
  the turn and fired at the next junction instead - the burger would carry on
  and swing down some corridor three tiles later. A queued turn that nothing
  can act on also expires after a second, so it cannot go off by surprise.
- **The map behind the board**, drawn procedurally and repainted on resize, so
  the city block reads as the middle of Tilted Towers rather than a board on a
  blank page.
- **Fills the window.** The board is drawn at 24px tiles (672 x 744) and scaled
  to the largest size that still leaves room for the HUD, measured live rather
  than guessed, so it grows with the window instead of sitting at a fixed
  width. `F` or the button goes full screen.
- Lives, an extra life at 10 000, level progression with rising speeds,
  death and level-clear animations, a `localStorage` high score, pause, and a
  WebAudio blip synth for every sound effect.

## Layout

```
main.js             the desktop app shell (Electron): the window the game lives in
package.json        app metadata, `npm start`, and the build targets
Burger Munch.bat    Windows launcher, nothing to install
burger-munch.sh     macOS / Linux launcher, nothing to install
index.html          page shell and HUD
css/style.css       styling, responsive + touch layout
css/fonts.css       the bundled arcade font
fonts/              PressStart2P.ttf, so the app needs no internet
assets/             the Victory Royale banner and the app icon
js/backdrop.js      the aerial map behind the page
js/layout.js        sizes the board to fill the window without clipping the HUD
js/maze.js          the four 28x31 tile maps and tile helpers
js/sprites.js       all pixel art: burger, enemies, shields, chug jugs, llama
js/render.js        paints a board to an offscreen canvas, themed per map
js/fx.js            particles, screen shake, floating score, announcements
js/achievements.js  the eight achievements and their toasts
js/audio.js         WebAudio sound effects
js/game.js          game loop, movement, enemy AI, combos, power-ups, scoring
```

`window.__game` is exposed in the console for poking at state while debugging.
