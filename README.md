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

## Deploying

A static site: `pnpm build` writes `dist/`, and any host that serves a folder
can serve it. There is no server, no API and no database — the save lives in
the player's own `localStorage`, which is also why there are no accounts yet.

Vercel needs no configuration in its dashboard. `vercel.json` sets the build
command, the output directory and two cache rules, and the framework preset
does the rest. The two rules differ on purpose:

- `/assets/*` is `immutable` for a year. Vite content-hashes those filenames,
  so a change is a new name and a stale copy is impossible.
- Photos and glyphs get a day plus a week of `stale-while-revalidate`, NOT
  `immutable`. Their names are stable (`bmw-m3-e30-red.webp`), so re-rendering
  a car reuses the name; a year of `immutable` would leave players looking at
  the old photo with no way to bust it short of renaming every file.

There is deliberately no SPA catch-all rewrite. Screens are React state and the
URL never changes, so a rewrite would only turn a genuinely missing asset into
a 200 with HTML in it.

`packageManager` is pinned in package.json. Only `pnpm-lock.yaml` is committed,
so the host picks pnpm on its own, but pinning the version is what stops a
"works locally" build from breaking on a different pnpm major.

Before pushing a deploy, this is the sequence that has actually caught things:

```
pnpm install --frozen-lockfile   # what the host runs; fails if the lock drifted
pnpm build
pnpm exec vite preview --port 5200
node tools/flows.mjs 5200        # the flows against the BUILT site, not dev
```

## Photos

Car photos are WebP at about q82, 1376x768. `npx tsx tools/photos.ts` is the
checker and it fails anything over 400KB; `node tools/shrink.mjs <files>` is
the converter that fixes them.

They were PNG once, at roughly 1.5MB each, which is what a lossless format does
with a photograph — `public/` was 58MB and every car cost a second and a half
on a phone. The same frames as WebP are about 40KB and the difference is not
visible in a 205px card strip or a 448px hero. The whole deploy is now 2.4MB.

The extension lives in one place, `PHOTO_EXT` in `services/progression/paint.ts`,
because `imageFor` builds the filenames and `tools/photos.ts` checks them — two
copies of "png" would let the checker pass a set of photos the app cannot load.

## Layout

```
contracts/            types both sides import
packages/sim/         the race engine. pure, no IO, no clock, no Math.random
services/catalog/     cars (6 fields each) and committed track fixtures
src/                  React UI: garage / shop / setup, with the race over the top
tools/                probes and the screenshot driver
```

Three sections, and changing between them slides: the outgoing screen leaves
towards the side you came from while the next one arrives from the other, with
the direction taken off the tab order.

**The race is a dialog, not a section.** It used to be a fourth screen, reached
only by pressing Race on the Setup screen. The slide is what forced the change:
a screen on its way out has to stay mounted while it leaves, and the race is a
live clock — it ticks the tower on a timeout and pays the purse when the flag
falls. A race left mounted to slide away would keep running off-screen and could
bank a prize for a race you walked out of. As a dialog it never slides, so the
question cannot arise.

It also cannot be dismissed. Escape is refused until the flag, because the purse
is paid at the flag and a race abandoned on lap 9 would be one you entered,
watched, and got nothing for.

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

## A car in the garage is a unit, not a model

`owned` is a list of objects, each with a `uid` of its own. You can hold two
Falcons, and they are two cars: two odometers, two colours, two sets of parts.
Every move -- sell, paint, fit, rectify -- names one by uid, never by model id.

That distinction is the whole feature and it is load-bearing rather than
cosmetic. Keyed by model, `owned.find(o => o.id === id)` answers *the first
Falcon* to a question about either of them, and nothing throws: you pay for a
turbo and it lands on the wrong car, you sell one and both leave, you paint one
and the garage changes colour. `services/progression/units.test.ts` walks that
errand end to end, and `tools/flows.mjs` drives the same thing through the real
screens, because the failure was never inside one function -- it was in what the
whole chain agreed a car was.

The uid is minted from a counter in the save (`nextUid`) rather than randomly,
so `buyCar` stays a pure function of the save, and counted up rather than
derived from the garage, so a name is never recycled onto a different car.

## Buying, and the two clocks

Racing is the only clock the game has, and both shops read it -- at different
rates, which is what makes them different shops.

- **The Marketplace** takes `racesRun + lotNudge` whole and turns over every
  race. Six cars, mostly tired sedans, one lottery slot. You cannot plan for it.
- **Concesionarios** take the same clock divided by `DEALER_PERIOD` (5). What
  rotates is the **unit**, not the roster: the same dealer carries the same
  models forever at list price, and every five races it has a different example
  of each -- other kilometres, another colour, a price that moved with them.

So the forecourt keeps the promise that makes it a forecourt (the car you are
saving for is still there next week) while still being worth checking back on
(this rotation's example might be the clean one). Neither hides what you already
own, because two of a model are two cars.

The dev refresh in Ajustes adds to `lotNudge` rather than to `racesRun`, so it
moves both shops by exactly one race's worth without claiming you drove. Five
presses rotate the forecourts, and the toast says so on the press that does it.

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
- Two of one model are two cars: selling, painting, fitting a part or rebuilding
  an engine touches the unit named and never its twin.
- Every save ever written migrates to the current shape, and every car in it
  comes out with a name of its own -- including a hand-edited save whose uids
  collide, which is repaired rather than thrown away.
- A uid is never recycled onto a different car, however many are bought and sold.
- No listing anywhere, on any dealer rotation, costs less than the trade pays
  for that same car -- which is what stops buy-sell-repeat from printing money.
- A second unit prices exactly like the first, so duplicates are a thing to want
  and never a thing to farm.
