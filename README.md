# x

*Solve for x.*

A minimalist, dramatic action-platformer where mathematics is the combat system. You are **x**, an unknown, drawn into a dark world made of numbers. You fight by holding a number and changing it with arithmetic.

The prototype has two chapters, which follow the school curriculum:

- **Chapter I — Arithmetic** (elementary): counting, + − × ÷, divisibility, equality. Boss: Zero.
- **Chapter II — The Other Side** (middle school): negative numbers, fractions, powers, Pythagoras, the coordinate plane, equations. Drawn in negative, black on white. Boss: π.

Chapter II opens beneath Zero's arena once Zero is beaten. To start there directly, choose **begin at chapter II** on the title screen.

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
| dash (with √2: hold a direction, including up) | `Tab` | |
| strike | `J` | `Num 0` |
| hold a digit | `1`–`9` | `1`–`9` |
| `+` `−` `×` `÷`, then a digit | type `+` `-` `*` `/` (Shift as needed), or `U` `I` `O` `P` | `+` `−` `*` `/` |
| `^`, then a digit | type `^`, or `K` | |
| the opposite of x | `-` then `-` | `−` then `−` |
| equate | `Enter` or `=` | `Enter` |
| slow time | `L` | `Num .` |
| pause / controls | `Esc` | |

## The rules of Chapter I

- **You hold a number, x.** Striking with it takes x away from an enemy's number.
- **You cannot take more than there is.** If x is larger than the enemy, the strike is turned aside. Lower x first.
- **A digit alone sets x to that digit. An operator followed by a digit changes x**, so `4`, `×`, `6` makes x = 24. Choosing a number slows time while you think. The slowdown draws on a small meter.
- **The bound** (framed numbers) can't be lessened, only *shared*. Strike them with a number that divides them, and they break into that many equal pieces.
- **Equate** (`Enter`) undoes every enemy on screen whose number equals x.
- **Doors** open to their own number: strike one while holding exactly that number, or equate beside it.
- **Lamps** save your progress and restore you.

## The rules of Chapter II

- **Past zero, numbers turn.** Taking more than there is carries an enemy through zero and it becomes negative. A negative enemy grows when struck with a positive x; hold a negative x to undo it.
- **Fractions are exact.** `3 ÷ 4` makes x = 3/4, and a 3/4 enemy falls to it in one strike.
- **Powers:** `2 ^ 6` makes 64, the same number as the enemy written `4³`.
- **The plane:** a door names coordinates; stand on those points.
- **The unknown:** an equation door opens to its solution.

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
| `src/audio.ts` | Synthesized sound (Web Audio); no audio files |
| `src/room.ts`, `src/physics.ts` | Tile collision and terrain outlines |

See [`docs/DESIGN.md`](docs/DESIGN.md) for the full game design and chapter plan.
