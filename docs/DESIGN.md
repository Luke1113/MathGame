# x — Design Document

*Working title: **x**. Tagline: "Solve for x."*

## Vision

A single-player, keyboard-controlled 2D action platformer with an interconnected Metroidvania map. Mathematics is how the world works, and the player fights with it. The target audience is players who enjoy games and know some mathematics. Knowing math should be an advantage, but **you should never have to stop and calculate**.

### Pillars

1. **Math is physics, not homework.** Every rule of the world is a true mathematical rule.
2. **Knowledge is power.** Players who know a concept can predict and exploit it. Players who don't can still learn it by watching.
3. **Telegraphs are mathematics.** Attacks announce themselves as graphs, sequences and patterns that can be read.
4. **Elegance is rewarded.** Fewer, better operations beat button-mashing.

### Atmosphere

Mysterious, enigmatic, extremely minimal, dramatic.

- **Palette:** black void, one off-white ink (`#ecebe6`), nothing else. Solid matter is black, outlined in a thin line. Air carries a faint graph-paper dot grid.
- **Light:** darkness everywhere except a pool of light around x, lamps, glyphs and enemies.
- **Type:** an italic serif (Cormorant Garamond) for every number and every line of text. Numbers are the characters.
- **Words:** short, cryptic inscriptions that surface when x walks near ("You cannot take more than there is."). No tutorials, only lessons the world teaches.
- **Sound:** synthesized. A low drone, and bells whose pitch follows the harmonic series of the number involved, so related numbers sound consonant together.
- **Drama:** hit-stop, slow motion when composing a number, white flashes on revelations, letter-spaced title cards.

## Core systems (in the prototype)

### The held value: x

The player holds one number, x, and it is the weapon. It's shown in hand and in the HUD as `x = 7`.

- **Strike** subtracts x from the enemy's number. The enemy *is* its number, so you watch 7 become 4.
- **You cannot take more than there is.** If x > the enemy's number, the strike is refused (`9 > 4`). This is the core tension: large x kills fast but can't touch small enemies.
- **Reach grows with digit count.** A three-digit number is a long staff.

### Composing numbers (the two-tap grammar)

- A **digit alone** takes up that digit: `7` means x = 7.
- An **operator, then a digit**, applies it: `×`, `6` means x = 7 × 6 = 42.
- Pressing an operator **slows time** while you choose. This is drawn from a meter that refills over time and on hits. A dedicated focus key gives the same slowdown without composing.
- Illegal operations are refused and named: `3 − 5 < 1`, `4 ∤ 7`, `÷ 0 is undefined`.
- Digits and operators are **learned in the world** as Metroidvania pickups. Exploring makes composing easier.

### Equate (`=`)

Undoes every enemy on screen whose number equals x, as a frozen-time chain of lines and bells. It also opens **equation doors** (`= 24`) and finishes the boss.

### The bound (division)

Framed numbers ignore subtraction. Strike one with a divisor d of n and it breaks into **d pieces of n/d** each. Some gates are bound, so division is a traversal key.

## Chapter structure: the school curriculum

Each chapter is a region of one interconnected world, with its own map, lessons, enemies and boss. Each one is unlocked by understanding the previous chapter.

### Chapter I — Arithmetic *(elementary school)* — **prototype, playable**

Counting, + − × ÷, natural numbers, divisibility, equality.

- Rooms: *nothing → one → count → again and again (×) → beneath (−) → the bound (÷) → the long hall → the same (=) → threshold → Zero*
- Rule: natural numbers only. Nothing goes below one, and every division must come out even.
- Enemies: walkers, drifters, emitters (which fire dots), bound numbers, bound gates.
- **Boss — Zero, "the number that cannot be lessened."** Every strike is refused (`n > 0`). Zero swallows numbers to become vulnerable (12, then 24, then 36). Each time you bring it exactly back to nothing, it cracks. At the end its pulse makes x = 0, and the only move left is to **equate**: `0 = 0`. You receive the digit 0.
- Ending: "Past nothing, the line goes on — into numbers less than nothing."

### Chapter II — The Other Side *(middle school)* — **playable**

Negative numbers, fractions, powers, Pythagoras, the coordinate plane, linear equations, π.

Below zero, **the world is drawn in negative**: black ink on white. Negative numbers inside it are drawn as photographic negatives of themselves.

- Rooms: *the other side → reflection (hub) → the broken → growth → the diagonal → the plane → the unknown → circumference → π*
- **± — the opposite.** The floor under x is gone. A strike that takes more than there is carries the enemy *through* zero, and it turns negative (it is then pulled toward blows rather than pushed). Positive x makes a negative enemy *more* negative, so it must be undone with a negative x, because taking away less than nothing gives more. `−` pressed twice negates x.
- **/ — a part.** Division no longer has to come out even: `3 ÷ 4` makes x = 3/4. Fraction enemies, and fractions drawn stacked as they are by hand. All arithmetic is exact (rational numbers).
- **^ — power.** `2 ^ 6` makes 64. Enemies first show themselves in power form (`4³`, `2⁶`); equal forms fall to the same equate.
- **√2 — the diagonal.** The dash follows the held direction, upward and diagonally, which opens a shaft in the hub that a jump alone can't reach.
- **The plane.** A room with coordinate axes, ticks and labels. A door names two points; it opens when x has stood on both.
- **The unknown.** Equation doors: `x + 9 = 4`, `3x + 1 = 3`, `2^x = 64`. Hold the solution (−5, 2/3, 6) and strike or equate. Before the boss, `7x = 22` asks for Archimedes' 22/7.
- **Boss: π, "the number that never ends."** Its digits circle it. Its volleys follow π's digits in order (3 shots, then 1, then 4, 1, 5, 9…), and the next digit is shown before it fires. It rolls across the floor as a wheel, measuring the floor in circumferences, and sweeps the room with radii that only a dash passes through. When weak, it pretends to be a fraction: the old measurements of π (Babylon's 25/8, Egypt's 256/81, Archimedes' 22/7), each to be brought exactly to zero. After the third, its circle unrolls into a line π long, which x takes up: **x = π**, and equating ends it (π = π).

### Chapter III — Functions *(high school)*

Polynomials, graphs and transformations, trigonometry, exponentials and logarithms, sequences and series, complex numbers.

- **Function slots:** graphs as attacks and as terrain. `sin` weaves, `tan` throws asymptote spikes, `⌊x⌋` builds stairs, `|x|` bounces. Your x sets the amplitude, frequency or coefficient.
- **Enemy telegraphs are graphs.** A boss "plots" its attack faintly before it fires.
- **× i** rotates gravity 90°. Because i⁴ = 1, puzzles cycle in fours.
- **Bosses:** e (grows exponentially, so cut it with ln), i (fights across the complex plane), φ (spawns copies in Fibonacci numbers).

### Chapter IV — Calculus

Limits, derivatives, integrals, series.

- **d/dx** strips an enemy's polynomial degree, which works as armor. Constants die outright.
- **∫** fills the area under your last graph with damage and spawns a "+C" ally.
- **lim** is a dash that approaches a target but never touches it. It's invulnerable and passes through attacks.
- **Σ:** a convergent series gives infinitely many hits with a fixed total; a divergent one keeps growing.
- **Bosses:** the Collatz Hydra (even halves, odd becomes 3n + 1) and Mandelbrot (a fight that zooms into itself).

### Chapter V — Linear Algebra

Vectors, matrices, transformations, determinants, eigenvectors.

- **Matrix spells:** reflect (swap places), scale (shrink an enemy), shear (break a guard), and **det = 0**, which flattens an enemy into a line.
- **Vectors:** enemies charge along their arrows. Cross two of them to fire perpendicular.
- **Eigen-rooms:** spaces that transform everything except one direction, the only safe path.
- **Final arc:** Euler's identity, then the Undefined, a being that can't be lowered to zero inside the system's own rules.

## Progression

- **Glyphs** (digits, operators, functions, transformations) are the abilities, and the map is gated by them. Bound gates need ÷, equation doors need =, function stairs need ⌊x⌋, and so on.
- **Axioms** (planned) are equippable perks: Commutative, Distributive, Pigeonhole, Axiom of Choice…
- **Style ranks** (planned): Trivial → Elementary → Nontrivial → Elegant → Rigorous → Q.E.D.

## Difficulty modes (planned)

| Mode | Previews of results | Slow time |
|---|---|---|
| Calculator | always shown | generous |
| Standard | while composing | normal |
| Proof | never | scarce |

## Technical notes

- TypeScript and Canvas 2D, bundled with Vite. No engine and no image or audio assets. Everything is drawn and synthesized at runtime.
- Fixed logical resolution of 960×540, letterboxed and scaled. Lighting is drawn on a half-resolution darkness layer with lights cut out of it.
- Maps are ASCII in `src/rooms.ts`. Exits pair automatically by letter. `npm run check:rooms` validates them.
- Progress is saved to `localStorage` at lamps and pickups.
