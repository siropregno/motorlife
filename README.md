# Motorlife

A car collection game where the race is a verdict, not something you drive.
You buy real cars, build them, and a timing tower decides who was right.

Phase 1 is scoped to answer exactly one question: **is watching the tower tense
when you are the one who tuned the car?** If it is not, no amount of content
fixes it, and the answer arrived in weeks rather than months.

```
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # gate tests, ~2s
pnpm build
```

## Layout

```
contracts/            types both sides import
packages/sim/         the race engine. pure, no IO, no clock, no Math.random
services/catalog/     cars (6 fields each) and committed track fixtures
src/                  React UI: garage -> setup -> race
tools/                probes and the screenshot driver
```

## The two ideas the whole thing rests on

**A car is six fields.** Name, year, power, mass, layout, class -- all readable
off a Wikipedia infobox in ten seconds. Everything the physics needs beyond
that is derived, never looked up:

- *Top speed is a measurement of drag.* At top speed engine power exactly
  balances drag plus rolling resistance, which leaves one unknown, and it is
  the one you could not look up: `CdA = 2(ηP/v − C_rr·m·g) / (ρv²)`.
- *A published 0-100 calibrates the car.* One scalar is fitted so the sim
  reproduces that exact time, absorbing gearing, launch and turbo lag. It
  scales power and launch traction **only** — never lateral grip, or a car
  with a good launch would silently corner better. There is a test for that.

Cars are labelled by how much the sim actually knows: Rough, Estimated,
Calibrated.

**`sim()` is a pure function.** Same entries, track, regulation and seed give
byte-identical output on any machine, forever. So the timing tower is not a
live simulation — the race finishes computing before the first row moves, and
the tower is playback. That is what makes replays cheap, what lets the garage
run true what-if previews, and what will let a server re-run a duel to verify
it.

## Physics that falls out rather than being coded

Nothing below is a rule in the source. Each is a consequence of four equations:

- A lighter car corners faster (tyre load sensitivity).
- Front-wheel drive spins up out of slow corners; rear drive hooks up. One
  sign flip in the load-transfer term.
- A wing pays with the square of speed, so it is worth a lot in a 300 m sweeper
  and nothing in a hairpin, while its drag is charged on every straight. The
  best aero setting at Monza is therefore not the best at Gálvez No. 6.
- Mass costs twice on a twisty circuit: once in the corner, once turning in.

## Tracks

Geometry is committed as JSON fixtures, never fetched at runtime —
OpenStreetMap changes under you and a lap record must not move because someone
edited a map. Provenance is in each file's `note`.

| Track | Source | Error vs published |
|---|---|---|
| Monza | OpenStreetMap `highway=raceway` | 0.02% |
| Gálvez No. 6 | OpenStreetMap | 0.23% |
| Gálvez No. 12 | Hand traced from satellite imagery | scaled to published |

Gálvez's outer perimeter is not in OSM, so No. 12 was traced by hand and
scaled 7.3% to the published length. Two independent traces agreed within a
metre, which proves the tracing is repeatable but not that it is accurate; the
diagram geometry measured 4% over from the other side, so the published figure
is the one to trust.

## Gate tests

Run on every commit, free, under three seconds. They assert the things that
would otherwise fail silently:

- The same seed gives a byte-identical race, 30 times over.
- `packages/sim` has no runtime imports outside itself and never calls
  `Math.random`.
- Every catalogue car imports with CdA in 0.4–1.4 m² and a fit scalar in
  0.6–1.5, and every calibrated car reproduces its published 0-100 within
  0.01 s.
- The calibration scalar cannot reach lateral grip.
- The best aero setting differs between a power circuit and a twisty one.
- No lap time is ever NaN or infinite on any car/track/setup pairing.
