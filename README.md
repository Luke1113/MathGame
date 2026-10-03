# x

*Solve for x.*

A minimalist, dramatic action-platformer where mathematics is the combat system. You are **x**, an unknown, drawn into a dark world made of numbers. You fight by holding a number and changing it with arithmetic.

This repository contains the **first prototype: Chapter I — Arithmetic**. It's a complete slice that runs from the opening, through the first boss (Zero), to the end of the chapter.

## Run it

```bash
npm install
npm run dev            # play at http://localhost:5173
npm run build          # production build in dist/
npm run build:single   # one self-contained file: dist/x-chapter-1.html
npm run check:rooms    # validate the chapter maps
```

## Controls

| | Keyboard | Numpad (recommended) |
|---|---|---|
| move / aim | `A` `D` / `W` `S` | |
| jump · drop through | `Space` · `S`+`Space` | |
| dash | `Shift` | |
| strike | `J` | `Num 0` |
| hold a digit | `1`–`9` | `1`–`9` |
| `+` `−` `×` `÷`, then a digit | `U` `I` `O` `P` | `+` `−` `*` `/` |
| equate | `Enter` | `Enter` |
| slow time | `Tab` / `L` | `Num .` |
| pause / controls | `Esc` | |

## The rules of Chapter I

- **You hold a number, x.** Striking with it takes x away from an enemy's number.
- **You cannot take more than there is.** If x is larger than the enemy, the strike is turned aside. Lower x first.
- **A digit alone sets x to that digit. An operator followed by a digit changes x**, so `4`, `×`, `6` makes x = 24. Choosing a number slows time while you think. The slowdown draws on a small meter.
- **The bound** (framed numbers) can't be lessened, only *shared*. Strike them with a number that divides them, and they break into that many equal pieces.
- **Equate** (`Enter`) undoes every enemy on screen whose number equals x. It also opens doors marked with their number.
- **Lamps** save your progress and restore you.

## Code map

| File | Role |
|---|---|
| `src/rooms.ts` | Chapter maps (ASCII), entity legends, and the glyph texts |
| `src/game.ts` | Game states, the number rules, room loading, rendering, HUD |
| `src/player.ts` | Movement, dash, strikes, and drawing the stick figure |
| `src/enemies.ts` | Walkers, drifters, emitters, the bound, gates, doors |
| `src/boss.ts` | Zero, the Chapter I boss |
| `src/audio.ts` | Synthesized sound (Web Audio); no audio files |
| `src/room.ts`, `src/physics.ts` | Tile collision and terrain outlines |

See [`docs/DESIGN.md`](docs/DESIGN.md) for the full game design and chapter plan.
