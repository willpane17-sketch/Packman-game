# Playing Burger Munch with a joystick

There are two ways. **Try the first one before installing anything** - the
game now reads a pad directly, so JoyToKey may not be needed at all.

## 1. Plug it in and play (no JoyToKey)

Plug the pad or arcade stick in, open the game, and push the stick. That is
the whole setup. It uses the browser's own gamepad support, so there is no
translation layer between the stick and the game and nothing extra running.

| Control | Does |
| --- | --- |
| Stick or d-pad | Move; picks the map and mode on the menus |
| **A** or **Start** | Start, restart, pause |
| **B** | Pause |
| **X** | Sound on / off |
| **Y** | Full screen |

The stick has to pass a little over half its travel to register, and falls
back to about a third before it lets go. That gap stops a worn stick sitting
on the line from flickering between two directions.

Both sticks work, and the d-pad and the left stick can be used
interchangeably - pressing both at once does not double up.

## 2. JoyToKey

Use this if the pad is not recognised, or you already have JoyToKey set up.

JoyToKey turns stick movement into key presses, so map it to the keys the
game already uses:

| JoyToKey row | Assign |
| --- | --- |
| Axis 1 (left / right) | Left arrow / Right arrow |
| Axis 2 (up / down) | Up arrow / Down arrow |
| Button 1 | Enter |
| Button 2 | P |
| Button 3 | M |
| Button 4 | F |

**Leave auto-repeat off.** The game tracks a key being held down and released,
so a normal press-and-hold is what it wants. Auto-repeat sends the same key
over and over while you hold the stick, which the game copes with but does not
need.

If a diagonal push sometimes turns the wrong way, raise the axis threshold in
JoyToKey so a direction only fires when the stick is pushed most of the way
over.

## Why a stick works properly now

Three things were changed for it:

- **A held direction stays queued.** The game watches for the key going down
  *and* coming back up. Hold the stick towards a wall and the turn waits for
  as long as you hold it, instead of ageing out after a second the way a
  tapped key does.
- **Diagonals resolve to the way that is open.** An analog stick crossing a
  corner sends two directions a few milliseconds apart. Rather than taking
  whichever landed last, the game takes whichever one you can actually turn
  into, so pushing up-and-right at a corner turns up the moment up exists.
- **Alt-tabbing releases the stick.** Losing focus mid-push used to swallow
  the key release and leave the burger driving into a wall.

Turning itself is forgiving - a turn is accepted within 10px before a junction
and 8px after it - so a stick's slightly softer timing is not punished.
