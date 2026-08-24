import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useSwap } from "../lib/swap";
import type { Mods, PartId, PartLevel } from "@contracts/mods";
import { levelOf, PART_IDS } from "@contracts/mods";
import { CARS } from "@catalog/cars";
import { ratingOf } from "@catalog/rating";
import { derive } from "@sim/derive";
import { engineWear, applyMods } from "@sim/mods";
import { topSpeed, zeroToHundred } from "@sim/physics";
import { formatCredits, repaintPriceFor } from "@progression/economy";
import { conditionOf, formatKm } from "@progression/mileage";
import { colorName, colorSwatch, colorsOf, imageFor } from "@progression/paint";
import { colorOfHeld, type OwnedCar } from "@progression/save";
import {
  LADDER,
  LEVEL_NAME,
  needsRebuild,
  partPrice,
  PART_NAME,
  rebuildPrice,
  withPart,
  withRebuild,
} from "@progression/mods";
import { classTierClass, PART_TIER } from "../lib/tiers";
import { ENGINE_ICON, ICON, PART_ICON } from "../lib/icons";
import { Glyph } from "../components/Glyph";
import { ScreenHead } from "../components/ScreenHead";

interface Props {
  owned: OwnedCar[];
  credits: number;
  /**
   * The car you are in, by UID. The workshop opens on it when you arrive by
   * pressing the tab, because it is the one you are about to race.
   *
   * A uid rather than a model id because this screen SPENDS: with two of a
   * model in the garage, a ramp that resolved by model would happily charge you
   * for a racing turbo and bolt it to the other one.
   */
  currentUid: string;
  /**
   * A car named on the way in -- "Llevar al taller" on a card in the garage.
   * Null when you simply pressed the tab. A uid, like currentUid.
   */
  openOn?: string | null;
  onFit: (uid: string, part: PartId, level: PartLevel) => void;
  onRebuild: (uid: string) => void;
  /**
   * Repaint the car on the ramp. It used to be the garage's, raised as a dialog
   * of its own over the car sheet; the workshop is where everything else you
   * pay to change about a car happens, and it already has the big live photo
   * that choosing a colour needs.
   */
  onRepaint: (uid: string, color: string) => void;
  /**
   * Get into the car on the ramp.
   *
   * The workshop is where you find out a car is ready, and it was the one
   * screen that could not act on that -- you fitted the part, then went to the
   * garage to get in. Same handler the garage and its menu use, so there is one
   * answer to "which car am I in" and the topbar sees this one too.
   */
  onDrive: (uid: string) => void;
}

/**
 * One row of the ficha, with the change the part under consideration would
 * make to it.
 *
 * The point of the screen: you should be able to see "52 CV" become "75 CV"
 * in green before any money moves. So the row swaps to the NEW value and
 * carries the old one and the delta beside it, rather than showing the old
 * value with a hint -- the number you are about to have is the number you are
 * deciding about, and it should be the big one.
 *
 * `better` says which DIRECTION is good, because it is not the same for every
 * figure: more CV is better and more seconds to 100 is worse. Getting that
 * from the caller rather than guessing from the sign is what stops a slower
 * 0-100 from being painted green.
 */
function Figure({
  k,
  now,
  next,
  fmt,
  better,
  sub,
}: {
  k: string;
  now: number;
  next: number | null;
  fmt: (n: number) => string;
  /** +1 when a bigger number is an improvement, -1 when it is a regression. */
  better: 1 | -1;
  /** Quiet text under the value when nothing is being previewed. */
  sub?: string | undefined;
}) {
  /*
   * A change too small to show is not a change. Without the epsilon, floating
   * point noise in the lap solve paints a green arrow on a figure that rounds
   * to the same displayed number, which reads as the screen lying.
   */
  const moved = next !== null && Math.abs(next - now) > 0.05;
  const up = moved && next! > now;
  const good = moved && (up ? better === 1 : better === -1);
  const shown = moved ? next! : now;

  return (
    <div className="spec-row">
      <span className="spec-k">{k}</span>
      <span className={`spec-v${moved ? (good ? " up" : " down") : ""}`}>
        {fmt(shown)}
        {moved ? (
          <em className="figure-was">
            {/* The arrow says direction, the old value says from where. Both,
                because green alone does not tell you how big the change is. */}
            {up ? "▲" : "▼"} de {fmt(now)}
          </em>
        ) : sub ? (
          <em>{sub}</em>
        ) : null}
      </span>
    </div>
  );
}

/**
 * The workshop.
 *
 * Two levels in one frame, which is what keeps the car on screen the whole
 * time: the top level is the four parts, and picking one turns the same row
 * into that part's four tiers. Nothing slides, nothing opens over anything --
 * the strip under the photo changes what it is a strip OF.
 *
 * The car is the biggest thing on the screen for the same reason it is in the
 * paint shop: you are deciding what to do to it, and everything that is not it
 * is in the way of that. The figures that matter while you decide -- power,
 * class -- sit in the ficha on the left and change as you choose.
 *
 * CLICKING a tier previews the class the car would rate at BEFORE the money is
 * gone. A racing turbo on a class D car can make it a class C car, where the
 * grid is faster, and finding that out after paying is the version of this
 * feature that makes people quit. It is a preview, not a warning: being priced
 * out of your own class by your own turbo is a decision, and this screen's job
 * is to make it an informed one rather than to refuse the sale.
 *
 * It was hover once, and moving it to the click is what made the ficha
 * readable: with the preview on hover, every figure on the left changed as the
 * cursor crossed the row on its way anywhere, so the numbers you were reading
 * flickered through four values you had not asked for. Choosing is still free
 * -- the price button is the only thing that spends -- so you can still try all
 * four before committing. You just have to ask.
 */
export function Workshop({
  owned,
  credits,
  currentUid,
  openOn,
  onFit,
  onRebuild,
  onDrive,
  onRepaint,
}: Props) {
  const cars = useMemo(
    () =>
      owned.flatMap((o) => {
        const spec = CARS.find((c) => c.id === o.id);
        // The colour travels alongside the image rather than only inside it:
        // the paint row needs to know which dot is the one the car WEARS, which
        // a rendered photo cannot tell it.
        const color = colorOfHeld(o);
        return spec
          ? [{ uid: o.uid, spec, km: o.km, mods: o.mods, color, image: imageFor(spec, color) }]
          : [];
      }),
    [owned],
  );

  /**
   * Which car is on the ramp. You do not choose it HERE.
   *
   * It is the car the garage named on the way in ("Llevar al taller"), else the
   * one you are driving. There is deliberately no picker on this screen: a list
   * of your cars is what the garage IS, and putting a second one here made the
   * workshop read as a browser of the collection rather than as a screen about
   * one car. You pick the car where cars live, and you arrive here with it.
   *
   * Derived rather than held in state, so it cannot go stale: a car sold or
   * driven elsewhere changes what this resolves to on the next render instead
   * of leaving a dead id on the ramp.
   */
  const wanted = openOn ?? currentUid;
  const car =
    cars.find((c) => c.uid === wanted) ?? cars.find((c) => c.uid === currentUid) ?? cars[0];

  /**
   * Which part's ladder is open. Null is the top level -- the four parts.
   *
   * "engine" and "paint" are in here alongside the four because they belong to
   * the same strip: both are things you do to the car from the same row of
   * tiles, even though neither is a part and neither has tiers. Paint arrived
   * last, from a dialog of its own raised over the car sheet -- but choosing a
   * colour wants a big live photo of the car, and this screen already is one.
   */
  const [openPart, setOpenPart] = useState<PartId | "engine" | "paint" | null>(null);
  /**
   * The colour under consideration, while the paint row is open.
   *
   * Separate from `picked` because a colour is not a PartLevel and cannot
   * share its state: that one drives the class preview and the ficha's
   * figures, and paint moves neither -- a yellow car and a black one lap the
   * same. One click, one value, and the hero renders it.
   */
  const [shade, setShade] = useState<string | null>(null);
  /**
   * The tier you have chosen and not yet paid for.
   *
   * There used to be a `hover` beside this, and the two were carefully kept
   * apart: a hovered tier was a question, a picked one an answer. The
   * distinction was real and the feature was still wrong -- the whole ficha
   * moved as the cursor crossed the row, so the figures you were trying to
   * read flickered through four values because the pointer passed over them on
   * its way somewhere else.
   *
   * One value now, set by a click. Choosing is still free; only the price
   * button spends.
   */
  const [picked, setPicked_] = useState<PartLevel | null>(null);

  /**
   * The strip's two halves while it changes.
   *
   * `openPart` above is still the source of truth for WHERE you are -- every
   * price, every heading and every preview reads it. This only remembers what
   * was on screen a moment ago, so it can be drawn dropping away.
   *
   * Driven from `openRow` below rather than from an effect on openPart, and
   * that is not a style choice: an effect runs AFTER the commit, so by the time
   * it set `before` React had already painted the new row and the old one never
   * appeared at all. The swap has to be told at the same moment the state
   * changes, which means both go through one function.
   */
  const row = useSwap<PartId | "engine" | "paint" | null>(null);

  /**
   * Open a row, or close back to the top level.
   *
   * The only way openPart is allowed to change. Everything that used to call
   * setOpenPart calls this instead, so the strip can never move without the
   * outgoing half being kept for its exit -- which is exactly the kind of thing
   * that gets forgotten at one call site out of six.
   */
  const openRow = (next: PartId | "engine" | "paint" | null) => {
    row.to(next);
    setOpenPart(next);
  };

  /*
   * Changing car closes whatever ladder was open. Without this, walking from a
   * car with a racing turbo to one that is stock leaves the turbo row showing,
   * with the tiers of a part on a different car -- and the ring on the tier the
   * PREVIOUS car had fitted.
   */
  useEffect(() => {
    setOpenPart(null);
    setPicked_(null);
    setShade(null);
    // Keyed on the UID, so walking from one Falcon to the other one closes the
    // row too. On the model id the two would look like the same car and the
    // strip would stay open on a ladder describing the one you just left.
  }, [car?.uid]);

  /*
   * Opening a different part starts with nothing chosen. Without this, walking
   * from a turbo where you had picked "competición" into the suspension row
   * arrives with competición already selected and its price armed -- a
   * different part, at a different price, that you never clicked.
   */
  useEffect(() => {
    setPicked_(null);
    // A colour tried in the paint row and walked away from is not a colour you
    // asked for. Leaving it set would put the photo back on the wrong car when
    // you returned to the top level.
    setShade(null);
  }, [openPart]);

  const now = useMemo(() => (car ? ratingOf(car.spec, car.mods, car.km) : null), [car]);

  /**
   * The tier the screen is currently describing, which is the one you clicked.
   *
   * Kept as its own name rather than using `picked` directly, because "what is
   * being previewed" and "what is armed for purchase" are different questions
   * that happen to have the same answer today -- they did not when a hover
   * could preview without arming anything.
   */
  const considering = picked;

  /**
   * The mods the car would have with the tier under consideration on it, or
   * its current ones when nothing is being considered. One value, so every
   * figure below is computed the same way and none of them can disagree about
   * which car is being described.
   */
  const wouldBe = useMemo(() => {
    if (!car || considering === null || openPart === null) return null;
    // Paint changes nothing the ficha measures -- a yellow car and a black one
    // lap the same -- so it never previews a figure. It is in this union for
    // the strip, not for the physics.
    if (openPart === "paint") return null;
    if (openPart === "engine") return withRebuild(car.mods);
    return withPart(car.mods, openPart, considering);
  }, [considering, openPart, car]);

  const preview = useMemo(() => {
    if (!car || !now || !wouldBe) return null;
    const next = ratingOf(car.spec, wouldBe, car.km);
    return next.index === now.index ? null : next;
  }, [wouldBe, car, now]);

  /**
   * The figures, as they are now and as they would be.
   *
   * Computed through the same `derive` + `applyMods` the race runs, not from
   * the multipliers directly: top speed and 0-100 are not fields you can scale,
   * they are what the car DOES, and reading them off the physics is the only
   * way the preview cannot drift from the racing. Top speed comes out of the
   * drag balance and 0-100 out of the same integration derive fits against.
   */
  const figures = useMemo(() => {
    if (!car) return null;
    const base = derive(car.spec);
    const read = (mods: Mods | undefined) => {
      const c = applyMods(base, mods, car.km);
      return {
        cv: Math.round(c.kW * 1.35962),
        kph: Math.round(topSpeed(c, c.kg) * 3.6),
        zero: zeroToHundred(c, c.kg),
        grip: c.muLateral,
      };
    };
    return { now: read(car.mods), next: wouldBe ? read(wouldBe) : null };
  }, [car, wouldBe]);

  if (!car || !now || !figures) return <p>No tenés autos.</p>;

  const wear = engineWear(car.mods?.wearKm ?? car.km);
  const rebuildable = needsRebuild(car.km, car.mods);
  const rebuild = rebuildPrice(car.spec, car.km, car.mods);
  const shown = preview ?? now;
  const cond = conditionOf(car.spec, car.km);
  const stockPower = Math.round(car.spec.kW * 1.35962);

  /**
   * The open row, when it is one of the four PARTS.
   *
   * Named once rather than re-narrowing at each use. `openPart` carries two
   * members that are not parts -- the engine and the paint -- and every line
   * below that asks about levels and prices means "if a part is open"; spelling
   * that as `!== "engine"` four times is how the paint row would have quietly
   * been treated as a part the day it was added.
   */
  const openTier: PartId | null =
    openPart !== null && openPart !== "engine" && openPart !== "paint" ? openPart : null;
  /**
   * The tier being offered: what you clicked, else what is already on the car.
   * The fallback is what makes an untouched row describe the car as it stands
   * rather than as nothing.
   */
  const fittedLevel = openTier ? levelOf(car.mods, openTier) : 0;
  const offered = considering ?? fittedLevel;
  const price = openTier ? partPrice(car.spec, car.km, openTier, offered) : 0;
  const payable = openTier !== null && offered !== fittedLevel;

  /**
   * The paint row: the colours this car comes in, what a change costs, and
   * whether the dot you clicked is one you can actually buy.
   *
   * Priced off the car's value like every other thing in here -- repaintPriceFor
   * is the garage's old function, unchanged; only the surface that calls it
   * moved.
   */
  const palette = colorsOf(car.spec);
  const paintPrice = repaintPriceFor(car.spec, car.km);
  /** Something picked, different from what it wears, and the money for it. */
  const paintable = shade !== null && shade !== car.color && credits >= paintPrice;
  /*
   * The photo shows the colour under consideration. This is the whole reason
   * paint belongs on this screen rather than in a dialog: the car is already
   * the biggest thing here and it is already live, so trying a colour is just
   * looking at the car you are looking at.
   */
  const hero = (shade ? imageFor(car.spec, shade) : null) ?? car.image;

  const onRamp = car.uid === currentUid;

  /**
   * The contents of the strip for a given state.
   *
   * A function rather than the inline block it replaced, because the row is
   * drawn TWICE while it swaps -- the one arriving and the one dropping away
   * -- and two copies of this markup would drift the moment a tier or a
   * colour changed on one of them. Same reasoning, and the same shape, as
   * App.tsx renderScreen.
   *
   * It reads `picked` from the component rather than taking it as an argument,
   * which is right for the arriving half and harmless for the leaving one: the
   * outgoing row is inert, so a ring drawn on a tile nobody can reach is a
   * detail of a picture that is already on its way out.
   */
  const tilesFor = (openPart: PartId | "engine" | "paint" | null) => (
    <>
        {openPart === null ? (
          <>
            {/*
              * The four parts. Each tile wears the colour of the tier
              * FITTED to it, so the row says how far each part has been
              * taken before you click anything.
              */}
            {PART_IDS.map((part) => {
              const level = levelOf(car.mods, part);
              return (
                <button
                  key={part}
                  type="button"
                  className={`workshop-tile ${PART_TIER[level]}`}
                  aria-label={`${PART_NAME[part]}${level > 0 ? `, ${LEVEL_NAME[level as 1 | 2 | 3]}` : ", de fábrica"}`}
                  title={`${PART_NAME[part]} · ${level === 0 ? "de fábrica" : LEVEL_NAME[level as 1 | 2 | 3]}`}
                  onClick={() => openRow(part)}
                >
                  <Glyph src={PART_ICON[part]} />
                </button>
              );
            })}
            {/*
              * The engine, on the same row and deliberately last. It is
              * the only thing here that does not make the car better
              * than it left the factory -- it makes it stop being
              * worse -- so it is separated by a hairline rather than
              * pretending to be a fifth part.
              */}
            <span className="workshop-tile-sep" aria-hidden="true" />
            <button
              type="button"
              className={`workshop-tile engine${rebuildable ? " worn" : ""}`}
              aria-label={`Motor${rebuildable ? ", pide rectificada" : ", al día"}`}
              title={rebuildable ? `Motor · ${formatKm(car.mods?.wearKm ?? car.km)} sin rectificar` : "Motor · al día"}
              onClick={() => openRow("engine")}
            >
              <Glyph src={ENGINE_ICON} />
            </button>
            {/*
              * The paint, after the engine and past the same hairline.
              * It belongs on the far side of it for the same reason the
              * engine does: it is not a part, and it is the only thing
              * in the row that does not change what the car DOES. It
              * wears the colour the car wears, which makes the tile the
              * only one here whose fill is a fact about this car rather
              * than about a tier.
              *
              * Under two colours there is nothing to change it to, so
              * the tile says why instead of opening an empty row.
              */}
            <button
              type="button"
              className={`workshop-tile paint${palette.length < 2 ? " lone" : ""}`}
              style={
                car.color
                  ? ({ "--tile": colorSwatch(car.color) } as CSSProperties)
                  : undefined
              }
              disabled={palette.length < 2}
              aria-label={`Pintura${car.color ? `, ${colorName(car.color)}` : ""}`}
              title={
                palette.length < 2
                  ? "Este auto viene en un solo color"
                  : `Pintura · ${car.color ? colorName(car.color) : "—"} · ${formatCredits(paintPrice)} cr`
              }
              onClick={() => openRow("paint")}
            >
              <Glyph src={ICON.paint} />
            </button>
          </>
        ) : openPart === "paint" ? (
          /*
           * The colours this car came in, as dots.
           *
           * Every dot is live, the one it wears included: clicking that
           * one is how you get the car back after trying another. What
           * it does not do is arm the price -- painting a car the colour
           * it already is is not a thing to charge for, which is the
           * same refusal repaintCar makes in the service.
           *
           * Dots rather than tiles, and the same .paint-dot the old
           * dialog used: a colour is the whole content of the control,
           * so a 68px square with a glyph on it would be a swatch
           * wearing a costume.
           */
          <div className="paint-swatches" role="group" aria-label="Colores">
            {palette.map((c) => (
              <button
                key={c}
                type="button"
                className={`paint-dot${(shade ?? car.color) === c ? " on" : ""}${
                  c === car.color ? " current" : ""
                }`}
                style={{ "--dot": colorSwatch(c) } as CSSProperties}
                aria-label={c === car.color ? `${colorName(c)}, el color actual` : colorName(c)}
                title={c === car.color ? `${colorName(c)} · el color actual` : colorName(c)}
                onClick={() => setShade(c)}
              />
            ))}
          </div>
        ) : openPart === "engine" ? (
          /*
           * The engine has no tiers, so its "row" is the wear bar. It
           * fills as the engine tires, left to right the way an
           * odometer climbs -- a full bar is a worn-out engine.
           */
          <div className="workshop-wear-wrap">
            <span
              className="workshop-wear"
              role="img"
              aria-label={`Desgaste del motor: ${Math.round(wear.fraction * 100)}%`}
            >
              <i style={{ width: `${Math.round(wear.fraction * 100)}%` }} />
            </span>
            <span className="workshop-wear-note">
              {rebuildable
                ? `${formatKm(car.mods?.wearKm ?? car.km)} desde la última rectificada`
                : "Recién hecho. No hay nada que devolverle."}
            </span>
          </div>
        ) : (
          /*
           * One part's ladder: the same glyph four times, the colour
           * saying which tier. Stock is a tier you can pick, because
           * taking a part back OFF is a real thing to want -- a racing
           * suspension you cannot remove is a car you cannot un-ruin
           * for a circuit that punishes tyre wear.
           */
          ([0, ...LADDER] as PartLevel[]).map((level) => {
            const on = fittedLevel === level;
            const p = partPrice(car.spec, car.km, openPart, level);
            const label = level === 0 ? "De fábrica" : LEVEL_NAME[level as 1 | 2 | 3];
            /*
             * A tier you cannot afford is still selectable, and that is
             * deliberate. Greying it out hides the two things you came
             * to find out -- what it costs and what it would do to the
             * car -- behind the fact that you are short today. Picking
             * it previews the class and the figures like any other, and
             * the price button is where "Faltan X CR" is said.
             */
            return (
              <button
                key={level}
                type="button"
                /*
                 * Two different rings. `on` is what the car HAS --
                 * solid purple, the same mark the paint shop puts on
                 * the colour a car wears. `picked` is what you have
                 * chosen and not yet paid for, which is a different
                 * claim and gets the dashed ring the class badge uses
                 * for the same reason.
                 */
                className={`workshop-tile ${PART_TIER[level]}${on ? " on" : ""}${
                  picked === level && !on ? " picked" : ""
                }`}
                aria-label={
                  on ? `${label}, es lo que tiene puesto` : `${label}, ${formatCredits(p)} créditos`
                }
                title={
                  on
                    ? `${label} · es lo que tiene puesto`
                    : `${label} · ${formatCredits(p)} cr`
                }
                /*
                 * No hover preview. Passing the cursor over a tile brightens
                 * it and does nothing else -- that is a CSS rule on the tile,
                 * not state.
                 *
                 * It used to drive the whole ficha: the class badge and every
                 * figure moved as the cursor crossed the row. It was a lot of
                 * screen changing for something as incidental as the pointer
                 * happening to pass over a tile on its way somewhere else, and
                 * the figures on the left flickered through four values while
                 * you were reading them.
                 *
                 * Clicking still previews, and previewing is still free -- the
                 * price button is the only thing that spends money. So you can
                 * try all four and read what each would give you; you just
                 * have to ask, rather than being answered on the way past.
                 */
                onClick={() => setPicked_(level)}
              >
                <Glyph src={PART_ICON[openPart]} />
              </button>
            );
          })
        )}
    </>
  );

  return (
    <>
      {/*
        * A header, like every other section has.
        *
        * It did not have one, on the theory that the car should fill the frame.
        * What that actually bought was a screen you could arrive at with no
        * idea what it was -- every other section names itself at the top left,
        * and this one started with a photo. The car is still the biggest thing
        * here; it just no longer has to double as the title.
        *
        * The subtitle is where the car on the ramp is NAMED, which is the fact
        * the old .workshop-name block inside the ficha was carrying. Same
        * information, in the place every other screen puts it.
        */}
      <ScreenHead
        title="Taller"
        sub={`${car.spec.make} ${car.spec.model} '${String(car.spec.year).slice(2)} · ${formatKm(car.km)}`}
      >
        {/*
          * Getting into the car, from the screen where you just finished it.
          *
          * Without this the workshop could make a car ready and not let you
          * take it -- fit the part, walk to the garage, right-click, subirse.
          * Disabled rather than hidden when you are already in it, because a
          * button that vanishes is a button you go looking for.
          */}
        <button
          type="button"
          className={`btn workshop-drive${onRamp ? "" : " primary"}`}
          disabled={onRamp}
          title={onRamp ? "Ya estás en este auto" : `Subirse al ${car.spec.model}`}
          onClick={() => onDrive(car.uid)}
        >
          <Glyph src={ICON.drive} />
          {onRamp ? "Estás en este" : "Subirse"}
        </button>
      </ScreenHead>

      <div className="workshop-stage">
        {/*
          * The ficha, left. Same figures the car sheet shows, because they are
          * the same facts -- but this one is LIVE: power carries what the parts
          * do to it, and the class badge up in the corner previews what the
          * tier under your cursor would make it.
          */}
        <aside className="workshop-specs">
          <div className="spec-list">
            {/*
              * The four figures a part can move, each showing what it WOULD
              * become. Top speed and 0-100 are run through the physics rather
              * than scaled off a multiplier -- see `figures` -- so what the
              * ficha promises is what the race will do.
              */}
            <Figure
              k="Potencia"
              now={figures.now.cv}
              next={figures.next?.cv ?? null}
              fmt={(n) => `${Math.round(n)} CV`}
              better={1}
              sub={figures.now.cv !== stockPower ? `de fábrica ${stockPower}` : undefined}
            />
            <Figure
              k="Velocidad máx."
              now={figures.now.kph}
              next={figures.next?.kph ?? null}
              fmt={(n) => `${Math.round(n)} km/h`}
              better={1}
            />
            {/* Seconds: LOWER is better, which is why `better` is a parameter
                rather than something inferred from the sign of the change. */}
            <Figure
              k="0–100"
              now={figures.now.zero}
              next={figures.next?.zero ?? null}
              fmt={(n) => `${n.toFixed(1)} s`}
              better={-1}
            />
            {/* Grip has no unit anybody would recognise, so it is shown as a
                percentage of what the car has now. A part that does not touch
                it leaves the row at 100%. */}
            <Figure
              k="Agarre"
              now={100}
              next={figures.next ? (figures.next.grip / figures.now.grip) * 100 : null}
              fmt={(n) => `${n.toFixed(0)}%`}
              better={1}
            />

            <div className="spec-row">
              <span className="spec-k">Peso</span>
              <span className="spec-v">{car.spec.kg} kg</span>
            </div>
            <div className="spec-row">
              <span className="spec-k">Año</span>
              <span className="spec-v">{car.spec.year}</span>
            </div>
            <div className="spec-row">
              <span className="spec-k">Kilómetros</span>
              <span className="spec-v">
                {formatKm(car.km)}
                <em>{cond.label}</em>
              </span>
            </div>
          </div>

        </aside>

        <div className="workshop-main">
          <div className="workshop-hero">
            {hero ? (
              <img
                src={hero}
                alt={`${car.spec.make} ${car.spec.model}${shade ? ` ${colorName(shade)}` : ""}`}
              />
            ) : (
              <span className="modal-nophoto">sin foto</span>
            )}
            {/*
              * The class badge, over the photo's top right. It is the number
              * the whole screen is about, so it stays visible while you work,
              * and it takes the dashed ring while a tier is under the cursor
              * to say the change has not been paid for yet.
              */}
            <span
              className={`klass-badge workshop-klass ${classTierClass(shown.letter)}${
                preview ? " preview" : ""
              }`}
              title={
                preview
                  ? `Con esta pieza: clase ${preview.letter}, índice ${preview.index}`
                  : `Clase ${now.letter}, índice ${now.index}`
              }
            >
              {shown.letter}
              {shown.index}
            </span>
          </div>

          {/*
            * The strip. One row, two states: the four parts, or one part's
            * four tiers. The heading names which.
            */}
          <div className="workshop-bar">
            <div className="workshop-bar-head">
              <h3>
                {openPart === null
                  ? "Modificaciones"
                  : openPart === "engine"
                    ? "Motor"
                    : openPart === "paint"
                      ? "Pintura"
                      : PART_NAME[openPart]}
              </h3>
              {/* The name of what is being offered, right of the heading, so
                  the word and the price sit on the same line as the tiles. */}
              {openTier ? (
                <span className="workshop-tier-name">
                  {offered === 0 ? "De fábrica" : LEVEL_NAME[offered as 1 | 2 | 3]}
                </span>
              ) : null}
              {/* The colour being tried, named. The dots say which one to
                  anyone looking at them; the word is what a screen reader and a
                  colour-blind player get, and it is the same "Celeste" the car
                  sheet prints in its Color row. */}
              {openPart === "paint" ? (
                <span className="workshop-tier-name">
                  {colorName(shade ?? car.color ?? "")}
                </span>
              ) : null}
              {openPart === "engine" ? (
                <span className="workshop-tier-name">
                  {rebuildable ? `${(( 1 - wear.kW) * 100).toFixed(1)}% menos` : "Al día"}
                </span>
              ) : null}
            </div>

            <div className="workshop-row">
              {/*
                * The row that is LEAVING, kept mounted while it drops away.
                *
                * This is the whole cost of a gesture with two halves: something
                * has to still be drawing the old tiles after they have stopped
                * being the current ones. The same trade App.tsx makes for the
                * screen slide, and it is the reason `leaving` exists there --
                * see useSwap, which is that pattern with the timer replaced by
                * the animation's own end event.
                *
                * INERT. aria-hidden, and every control inside it is unreachable
                * because the whole subtree is `inert`: it is a picture of a row
                * you have already left, and a tab stop or a screen reader
                * finding a button on its way off the screen would be offering a
                * control that is about to stop existing.
                */}
              {row.before ? (
                <div
                  className="workshop-tiles going"
                  key={`tiles-out-${row.before.value ?? "top"}`}
                  aria-hidden="true"
                  inert
                  onAnimationEnd={row.onLeft}
                >
                  {tilesFor(row.before.value)}
                </div>
              ) : null}

              <div className="workshop-tiles coming" role="group" key={`tiles-${openPart ?? "top"}`}>
                {tilesFor(openPart)}
              </div>

              {/*
                * Right of the tiles: the way back, and the money. Only inside a
                * part -- at the top level there is nothing to go back to and
                * nothing to pay for, so the strip is just the four doors.
                */}
              {/* Keyed on openPart rather than on a constant, so the pay
                  button re-animates when you walk from one row straight into
                  another -- the tiles beside it do, and a back arrow that sat
                  still while its own row changed underneath would read as part
                  of the furniture rather than as part of the row. */}
              {openPart !== null ? (
                <div className="workshop-acts" key={`acts-${openPart}`}>
                  <button
                    type="button"
                    className="btn workshop-back"
                    aria-label="Volver"
                    title="Volver"
                    onClick={() => {
                      openRow(null);
                    }}
                  >
                    <Glyph src={ICON.back} />
                  </button>

                  {openPart === "paint" ? (
                    /*
                     * Same split as everywhere else on this screen: the dots
                     * pick and preview for free, this is the only thing that
                     * spends. The label is the number and nothing else -- the
                     * dots are the choice, so what is left to say is the cost.
                     */
                    <button
                      type="button"
                      className={`btn workshop-pay${paintable ? " primary" : ""}`}
                      disabled={!paintable}
                      title={
                        shade === null
                          ? "Elegí un color"
                          : shade === car.color
                            ? "Ya es de este color"
                            : credits < paintPrice
                              ? `Faltan ${formatCredits(paintPrice - credits)} cr`
                              : `Pintar de ${colorName(shade)} · ${formatCredits(paintPrice)} cr`
                      }
                      onClick={() => {
                        if (shade) onRepaint(car.uid, shade);
                        // Back to the top level: the car IS that colour now, so
                        // the row would be sitting on a preview of what it
                        // already wears.
                        openRow(null);
                      }}
                    >
                      {credits < paintPrice
                        ? `Faltan ${formatCredits(paintPrice - credits)} CR`
                        : `${formatCredits(paintPrice)} CR`}
                    </button>
                  ) : openPart === "engine" ? (
                    <button
                      type="button"
                      className={`btn workshop-pay${rebuildable && credits >= rebuild ? " primary" : ""}`}
                      disabled={!rebuildable || credits < rebuild}
                      title={
                        !rebuildable
                          ? "El motor está recién hecho"
                          : credits < rebuild
                            ? `Faltan ${formatCredits(rebuild - credits)} cr`
                            : `Rectificar · ${formatCredits(rebuild)} cr`
                      }
                      onClick={() => {
                        onRebuild(car.uid);
                        openRow(null);
                      }}
                    >
                      {!rebuildable
                        ? "Al día"
                        : credits < rebuild
                          ? `Faltan ${formatCredits(rebuild - credits)} CR`
                          : `${formatCredits(rebuild)} CR`}
                    </button>
                  ) : (
                    /*
                     * The price button is the ONLY thing that spends money.
                     * Clicking a tile picks; this pays. That split is what
                     * makes trying tiers free -- the class badge previews the
                     * whole time and nothing is charged for looking, exactly
                     * the way the paint shop lets you try colours.
                     */
                    <button
                      type="button"
                      className={`btn workshop-pay${payable && credits >= price ? " primary" : ""}`}
                      disabled={!payable || credits < price}
                      title={
                        !payable
                          ? "Es lo que tiene puesto"
                          : credits < price
                            ? `Faltan ${formatCredits(price - credits)} cr`
                            : `${formatCredits(price)} cr`
                      }
                      /*
                       * Back to Modificaciones once it is paid for, the same
                       * way paying for paint and for a rectificada already
                       * leave their rows.
                       *
                       * Staying in the ladder was the odd one out, and it left
                       * the screen making a claim that had stopped being
                       * interesting: the tier you bought takes the solid `on`
                       * ring and every other tile in the row is now a DIFFERENT
                       * turbo you could put on the same car -- which is not
                       * what anyone is deciding a second after buying one. The
                       * question after fitting a part is "what else does this
                       * car need", and that question is the four tiles.
                       *
                       * Closing the row also clears the pick, via the effect on
                       * `openPart` -- so the dashed "chosen, not paid for" ring
                       * goes with it rather than being left on a tier that is
                       * now simply what the car has.
                       */
                      onClick={() => {
                        onFit(car.uid, openPart, offered);
                        openRow(null);
                      }}
                    >
                      {!payable
                        ? "Equipado"
                        : credits < price
                          ? `Faltan ${formatCredits(price - credits)} CR`
                          : `${formatCredits(price)} CR`}
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
