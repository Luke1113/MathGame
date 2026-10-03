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

### Equate (`=`) and its meter

Exact kills fill a circle beside x (more for kills in quick succession). A full circle pays for one equate: it undoes the nearest enemy equal to x, and chains to any equals standing close beside it. Doors are free to equate, and so is a boss's final identity.

### Fallen digits

A whole number undone may drop one of its digits. Touching it joins it to x by the last sign used, so x keeps changing in the middle of a fight without stopping to type.

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

Negative numbers, fractions, powers and roots, the coordinate plane, linear equations, π.

Below zero, **the world is drawn in negative**: black ink on white. Negative numbers inside it are drawn as photographic negatives of themselves.

- Rooms: *the other side → reflection (hub) → the broken → growth → the other axis → the plane → the unknown → circumference → π*
- **± (the opposite).** A strike that takes more than there is carries the enemy *through* zero and it turns negative. Positive x makes a negative enemy *more* negative, so it must be undone with a negative x. `−` pressed twice negates x.
- **/ (a part).** Division no longer has to come out even: `3 ÷ 4` makes 3/4. All arithmetic is exact.
- **Wholes.** A circled number that can only be broken: strike it with a whole number k and it shatters into k pieces of 1/k of it. The choice of k is a real choice (2 pieces or 8). Pieces left alive drift together and add up (1/4 + 1/4 = 1/2), until the whole re-forms.
- **Slices.** A circle of six wedges, 1/6 each, turning, breaking away to dive one by one.
- **^ and √.** `2 ^ 6` makes 64; `81 √ 2` makes 9. Enemies first appear in power form (`4³`, `2⁶`). A root that never ends (√2) is refused: the first irrational, before π.
- **y (the other axis).** The dash follows the held direction, upward and diagonally, opening a shaft in the hub. The upward dash adds to a jump rather than replacing it.
- **The plane.** A room with coordinate axes. A door names two points; it opens when x has stood on both.
- **One equation door** (`3x + 1 = 3`), and `7x = 22` before the boss.
- **Boss: π, "the number that never ends."** It never stops moving. Its digits fly at x in order (3, 1, 4, 1, 5, 9…): a 9 is a slow heavy ring, a 1 a fast needle, a 0 a breath of silence. Strike a digit and it flies back, shattering whatever piece it meets or staggering π. Around π circle the pieces of an old measurement of the circle: 3 + 1/8 (Babylon), 3 + 1/7 (Archimedes), 3 + 1/10 + 1/25 (3.14). Break all the pieces, by exact strikes or struck-back digits, and it cracks. Each phase changes the arena: a figure of eight in the air; a wheel rolling round floor, wall, ceiling and wall; then a closing circle outside which there is nothing. At the end its circle unrolls into a line π long, which x takes up: **x = π**, and π = π.

### Chapter III — Functions *(high school)* — **playable**

Linear functions, the sine, the parabola, the floor function, exponential growth and logarithms.

Drawn as a **blueprint**: cold ink on near-black, with ruled graph-paper lines (bolder every fifth).

- Rooms: *the graph → the wave → the arc → the floor → the wall → doubling → the slow → the root → e*
- **Functions are weapons.** `F` fires the chosen function, `Q` chooses. A function's shot strikes whatever it meets with x, by the same exact-kill rule. Where it makes sense, x is also the function's parameter, so choosing x chooses a shape:
  - **ax** — a beam, aimed straight, up or down.
  - **sin** — a weaving wave of height x; negative x turns it over.
  - **x²** — a lob whose arc is x tall (negative x throws downward).
  - **⌊x⌋** — builds ⌊x⌋ one-tile steps (at most 6). A nine-tile wall can only be climbed on them: hold at least 5.
  - **ln** — carries no x. It counts growth back: e^k becomes the plain number k, and ln 1 = 0 undoes a 1. Anything else "never ends".
- **Graphs are terrain.** Standing surfaces defined by functions: a line ramp, a moving sine wave over a pit (ride it), a parabolic bowl. You can step onto a graph from the ground.
- **Telegraphs are graphs.** Plotters show the sine or parabola they will fire along before they fire.
- **Enemies:** plotters; doublers (1, 2, 4, 8, …, bursting past 128); e-forms (e², e³) that no number can lessen until ln counts them back; a gate of e³.
- **One equation door:** `x² = 16`, which opens to either root, 4 or −4.
- **Boss: e, "the number that grows by what it is."** It grows a power every few seconds (e¹, e², … e⁷, then bursts and begins again). Small, it darts and is hard to catch; grown, it is slow and dangerous. Only ln counts it back, to the plain number k, which must then be struck exactly to zero. Each phase it starts from a greater power, and from the second phase it also lobs parabolas. At the end it counts itself down, e³, e², e¹, e⁰ = 1, and x equates: 1 = 1. x receives e.

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
