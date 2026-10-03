# x

*Solve for x.*

A minimalist, dramatic action-platformer where mathematics is the combat system. You are **x**, an unknown, drawn into a dark world made of numbers. You fight by holding a number and changing it with arithmetic.

The prototype has three chapters, which follow the school curriculum:

- **Chapter I — Arithmetic** (elementary): counting, + − × ÷, divisibility, equality. Boss: Zero.
- **Chapter II — The Other Side** (middle school): negative numbers, fractions, powers, Pythagoras, the coordinate plane, equations. Drawn in negative, black on white. Boss: π.
- **Chapter III — Functions** (high school): functions that change what they touch, graphs as ground, the floor function, angles and sines, logarithms. Drawn as a blueprint on ruled paper. Met on the way: e. Boss: f(x).

Each chapter opens beneath the previous boss's arena. To start at a later chapter directly, choose **begin at chapter II** or **begin at chapter III** on the title screen.

## Run it

```bash
npm install
npm run dev            # play at http://localhost:5173
npm run build          # production build in dist/
npm run build:single   # one self-contained file: dist/x.html
npm run check:rooms    # validate the chapter maps
```

## Controls

| | Keyboard | Numpad (recommended) |
|---|---|---|
| move / aim | `A` `D` / `W` `S` | |
| jump · drop through | `Space` · `S`+`Space` | |
| dash (with y: hold a direction, including up) | `Tab` | |
| strike | `J` | `Num 0` |
| hold a digit | `1`–`9` | `1`–`9` |
| `+` `−` `×` `÷`, then a digit | type `+` `-` `*` `/` (Shift as needed), or `U` `I` `O` `P` | `+` `−` `*` `/` |
| `^`, then a digit | type `^`, or `K` | |
| `√`, then a digit (2 = square root) | `R` | |
| the opposite of x | `-` then `-` | `−` then `−` |
| equate | `Enter` or `=` | `Enter` |
| aim a function · set its a · fire | hold `F` · a digit · let go | |
| turn the function over (negative a) · choose another | `S` while aiming · `Q` | |
| slow time | `L` | `Num .` |
| pause / controls | `Esc` | |

## The rules of Chapter I

- **You hold a number, x.** Striking with it takes x away from an enemy's number.
- **You cannot take more than there is.** If x is larger than the enemy, the strike is turned aside. Lower x first.
- **A digit alone sets x to that digit. An operator followed by a digit changes x**, so `4`, `×`, `6` makes x = 24. Choosing a number slows time briefly.
- **Digits fall from the undone.** Touch one and it joins x by the last sign you used (shown left of x).
- **Exact kills fill the circle beside x**, faster when they come close together.
- **The bound** (framed numbers) can't be lessened, only *shared*. Strike them with a number that divides them, and they break into that many equal pieces.
- **Equate** (`Enter`) spends a full circle to undo the nearest enemy equal to x, and any equals close beside it.
- **Doors** open to their own number: strike one while holding exactly that number, or equate beside it.
- **Lamps** save your progress and restore you.

## The rules of Chapter II

- **Past zero, numbers turn.** Taking more than there is carries an enemy through zero and it becomes negative. A negative enemy grows when struck with a positive x; hold a negative x to undo it.
- **Fractions are exact.** `3 ÷ 4` makes x = 3/4, and a 3/4 enemy falls to it in one strike.
- **Wholes** (circled numbers) can't be lessened, only broken: strike one with a whole number k and it shatters into k equal pieces. Pieces left alone drift back together and add up, until the whole is whole again.
- **A slice** is a circle of wedges, 1/6 each, that break away one at a time.
- **Roots:** `81`, `√`, `2` makes 9. A root that never ends (√2) cannot be held.
- **Powers:** `2 ^ 6` makes 64, the same number as the enemy written `4³`.
- **y, the other axis:** the dash follows the held direction, up and diagonally.
- **The plane:** a door names coordinates; stand on those points.

## The rules of Chapter III

- **Hold `F` to aim a function.** Time slows and its graph is drawn from your hand, with its equation. A digit sets its a (`y = 2x`, `y = 3 sin x`), `S` turns it over (`y = −2x`), and letting go fires it along that graph. `Q` chooses another function.
- **A function changes what it touches: f(n).** If it makes zero, the enemy is undone; otherwise the enemy becomes the new number, to be struck exactly as before.
  - **ax** multiplies: `y = 3x` turns 1/3 into 1.
  - **x²** squares, then divides by a: `y = x²/9` turns −3 into 1.
  - **sin** takes the sine. An angle θ becomes a number (`3 sin 90° = 3`; `sin 180° = 0` undoes it). Of a plain number the sine never ends, except at multiples of π.
  - **ln** counts growth back: `ln e³ = 3`, `ln 1 = 0`. Anything else never ends.
  - **⌊x⌋** is not fired. It draws `y = ⌊x⌋` from your feet, a steps high: flat floors with nothing between them, each jumped to from the last.
- **Rules carved in rock.** A groove shaped like a graph runs into the rock from a mouth. Stand at the mouth and fire exactly that rule (the right function, the right a, the right way up) and it runs the groove to the end and opens the lock.
- **Angles (θ)** turn 15° at a time and fire along the axes. A strike can't touch them: an angle is not a number until its sine is taken.
- **Graphs are ground.** Ride a moving sine, cross a parabolic bowl. In the rewritten room the floor itself is a graph that keeps changing; where it crosses the axis, its roots can be broken.
- **f(x)**, the last rule, is the ground of its room. It rewrites itself, fires along graphs, and breaks only at its roots. Growth has no roots: count it back with ln.

## Code map

| File | Role |
|---|---|
| `src/rooms.ts` | Chapter maps (ASCII), entity legends, and the glyph texts |
| `src/game.ts` | Game states, the number rules, room loading, rendering, HUD |
| `src/player.ts` | Movement, dash, strikes, and drawing the stick figure |
| `src/enemies.ts` | Walkers, drifters, emitters, the bound, gates, doors |
| `src/rooms2.ts` | Chapter II maps |
| `src/num.ts` | Exact numbers: fractions, and π |
| `src/draw.ts` | Stacked fractions and superscripts |
| `src/boss.ts` | The boss interface, and Zero (Chapter I) |
| `src/pi.ts` | π (Chapter II) |
| `src/rooms3.ts` | Chapter III maps |
| `src/curves.ts` | Graphs that can be stood on, and ⌊x⌋'s floors |
| `src/functions.ts` | The functions' shapes, and shots that fly along graphs |
| `src/floor.ts` | Ground that is a graph, its forms, and its roots |
| `src/eboss.ts` | e, met on the way (Chapter III) |
| `src/fxboss.ts` | f(x) (Chapter III) |
| `src/audio.ts` | Synthesized sound (Web Audio); no audio files |
| `src/room.ts`, `src/physics.ts` | Tile collision and terrain outlines |

See [`docs/DESIGN.md`](docs/DESIGN.md) for the full game design and chapter plan.
