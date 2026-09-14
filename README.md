# Tilted Towers Burger Munch

A complete, playable re-creation of the classic arcade maze game — rebuilt with a
new cast:

| Classic          | This game                                              |
| ---------------- | ------------------------------------------------------ |
| Pac-Man          | a pixel **burger** (sesame bun, cheese, patty, olive)   |
| The four ghosts  | four **pixel Jonesy** operators, colour-coded by squad  |
| The blue maze    | the **Tilted Towers** city block — concrete towers, asphalt roads, grass and the river on the east side |
| A black screen   | the **Tilted Towers aerial map** behind the board — terrain, the river, the roads into town, tree cover and outskirts buildings |
| Dots / power pellets | gold **coins** / blue **shield potions**           |
| Cherries & fruit | **loot** — llama, fries, chug jug, shield              |

Everything is drawn procedurally as pixel art on a canvas at load time, so the
game has **no image files and no build step**. Open `index.html` and play.

## Play it

```bash
# any static server works, or just open the file directly
python3 -m http.server 8000
# then browse to http://localhost:8000
```

| Control | Action |
| --- | --- |
| Arrow keys / WASD | Move |
| Enter / Space | Start, restart, pause |
| P | Pause |
| M | Sound on / off |
| F | Full screen |
| Swipe or on-screen D-pad | Move (touch devices) |

## What's implemented

The maze is the original 28 × 31 arcade layout (all 244 pick-ups), and the rules
follow the arcade closely:

- **Four distinct ghost personalities.** Blinky chases directly, Pinky aims four
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
index.html        page shell and HUD
css/style.css     styling, responsive + touch layout
js/backdrop.js    the aerial map of Tilted Towers behind the page
js/layout.js      sizes the board to fill the window without clipping the HUD
js/maze.js        the 28x31 tile map and tile helpers
js/sprites.js     all pixel art: burger, Jonesys, coins, potions, loot
js/render.js      paints the Tilted Towers board to an offscreen canvas
js/audio.js       WebAudio sound effects
js/game.js        game loop, movement, ghost AI, scoring, input
```

`window.__game` is exposed in the console for poking at state while debugging.
