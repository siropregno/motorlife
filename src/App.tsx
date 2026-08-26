import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Build } from "@contracts/race";
import type { Mods, PartId, PartLevel } from "@contracts/mods";
import { CARS, carById } from "@catalog/cars";
import { TRACKS, trackById } from "@catalog/tracks";
import { ratingOf } from "@catalog/rating";
import {
  loadSave,
  writeSave,
  resetSave,
  colorOfHeld,
  countOwned,
  heldOf,
  modsOfHeld,
  ownsUid,
  type Save,
} from "@progression/save";
import {
  buyCar,
  formatCredits,
  installPart,
  payoutFor,
  rebuildEngine,
  repaintCar,
  sellCar,
} from "@progression/economy";
import { DEV_CREDITS, grantCredits, refreshMarket } from "@progression/dev";
import { dealerEra, takeOffFloor } from "@progression/market";
import { LEVEL_NAME, modCount, PART_NAME } from "@progression/mods";
import { colorName, imageFor } from "@progression/paint";
import { Garage } from "./screens/Garage";
import { SetupScreen } from "./screens/Setup";
import { Race } from "./screens/Race";
import { Shop } from "./screens/Shop";
import { Workshop } from "./screens/Workshop";
import { useToast } from "./components/Toasts";
import { TopNav } from "./components/TopNav";
import { SettingsModal } from "./components/SettingsModal";
import { directionBetween, type Direction, type Screen } from "./lib/screens";
import { classTierClass } from "./lib/tiers";

/**
 * How long a screen takes to cross.
 *
 * Shared with the stylesheet, which cannot import it -- the CSS animations run
 * for this long and this timer is what unmounts the outgoing screen when they
 * finish. The two are written out in both places and the flow checks compare
 * them, so a change to one that misses the other fails rather than leaving a
 * dead screen on top of a live one.
 *
 * The stylesheet's half is --dur-travel in tokens.css, which is where the
 * value is decided; this is the copy of it that JavaScript can see. Change
 * one and you must change the other.
 */
const SLIDE_MS = 450;

/** "Renault R12 TL" -- how a car is named in prose rather than on its card. */
const nameOf = (id: string) => {
  const spec = carById(id);
  return spec ? `${spec.make} ${spec.model}` : null;
};

export default function App() {
  const toast = useToast();
  const [save, setSave] = useState<Save>(() => loadSave());
  const [screen, setScreen] = useState<Screen>("garage");
  /**
   * The car you are in, by UID rather than by model.
   *
   * The garage can hold two of anything now, and "I am in the Falcon" stopped
   * being an answer the moment there were two of them: the topbar, the setup
   * screen and the workshop would all have picked whichever one came first in
   * the list, which is not the one you clicked.
   *
   * The three initialisers below read `save` rather than calling loadSave()
   * again. There used to be three loads on the first render, which was merely
   * wasteful then and would be a correctness bug now -- loadSave can RENAME a
   * car (see repair), so three loads is three chances to hold a uid that the
   * save in state does not have.
   */
  const [carUid, setCarUid] = useState(() => save.owned[0]?.uid ?? "");
  const [trackId, setTrackId] = useState(TRACKS[0]!.id);
  const [build, setBuild] = useState<Build>(() => ({
    carId: save.owned[0]?.id ?? CARS[0]!.id,
    compound: "medium",
    setup: { aero: 0, gearing: 0, springs: 0, brakeBias: 0 },
  }));

  /*
   * The shop has its own navigation inside it -- chooser, dealer list, one
   * dealer, the used lot -- and that state only resets when Shop unmounts,
   * which is when you LEAVE the shop. So pressing the shop tab while already
   * standing in a dealer did nothing at all.
   *
   * Bumping a key on every press of that tab remounts it, which is what a nav
   * tab should do: take you to the top of its section, from anywhere,
   * including from inside it.
   */
  const [shopEpoch, setShopEpoch] = useState(0);

  /**
   * Which car is on the ramp, when the workshop is reached by NAME rather than
   * by pressing the tab.
   *
   * "Llevar al taller" on a card in the garage means that car, not the one you
   * happen to be driving, so the section has to be told which one. Null is the
   * ordinary case -- you pressed the tab -- and the workshop then opens on the
   * car you are in, which is the one you are about to race.
   *
   * It is cleared when the section is left, so walking out of the workshop and
   * back in through the tab does not silently reopen somebody else's car.
   */
  const [ramp, setRamp] = useState<string | null>(null);

  /**
   * The screen on its way out, kept rendered while it slides off.
   *
   * This is the whole cost of a directional slide: something has to still be
   * drawing the old screen after it has stopped being the current one. It
   * holds the screen AND the direction, because both are needed to place it --
   * and it is one piece of state rather than two so they can never disagree
   * about which way a transition is going.
   *
   * Null the rest of the time, which is the normal case: exactly one screen is
   * mounted unless a slide is in flight.
   */
  const [leaving, setLeaving] = useState<{ screen: Screen; dir: Direction } | null>(null);
  const sweep = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  /*
   * Clearing the outgoing screen is on a timer, so it has to be cancelled if
   * the app goes away mid-slide. Without this a tab pressed just before
   * unmount leaves a setState firing into nothing.
   */
  useEffect(() => () => {
    if (sweep.current) clearTimeout(sweep.current);
  }, []);

  /**
   * `screen` is the source of truth for where you are, so it is read here
   * rather than inside the setScreen updater below. React may call an updater
   * twice, and starting a timer or measuring the DOM from inside one is how
   * you get two slides for one click.
   */
  const go = useCallback(
    (next: Screen) => {
      if (next === "shop") setShopEpoch((n) => n + 1);
      /*
       * Pressing the Taller TAB always means "the car I am in". Only "Llevar
       * al taller" on a specific card names a different one, and it sets the
       * ramp immediately after calling this -- so clearing here is what stops
       * a car put on the ramp last visit from being there when you press the
       * tab three screens later.
       */
      if (next === "workshop") setRamp(null);

      /*
       * Pressing the tab you are already on is not a slide. It still means
       * something for the shop -- it takes you back to its top level -- but
       * sending the screen off the left edge and bringing the same screen back
       * from the right would be a lot of movement to say "you are already
       * here".
       */
      if (screen === next) return;

      /*
       * Arrive at the top of the new section.
       *
       * Each screen owns its own scroll box, so this is not one element to
       * reset but "whichever list the section you are arriving at has". The
       * arriving screen has not rendered yet at this point, so the reset is
       * queued for after it has -- see the effect below.
       *
       * Nothing measures or pins a height here any more. The stage is the size
       * of the frame whatever is in it, so there is no jump to prevent: the
       * old code remembered the outgoing height and held it as a floor,
       * because back then the stage was as tall as its content and swapping a
       * tall section for a short one collapsed the page under the cursor.
       */

      // A slide already running is abandoned rather than queued. Pressing
      // three tabs quickly should land on the third, not play three
      // animations in a row.
      if (sweep.current) clearTimeout(sweep.current);
      setLeaving({ screen, dir: directionBetween(screen, next) });
      setScreen(next);
      sweep.current = setTimeout(() => {
        setLeaving(null);
        sweep.current = null;
      }, SLIDE_MS);
    },
    [screen],
  );

  /**
   * Put the arriving section at the top of its own list.
   *
   * Keyed to `screen` so it runs after the new one has rendered -- doing it
   * inside `go` would reset the list of the section you are LEAVING, which is
   * the one still on screen at that moment.
   *
   * Scoped to `.screen.coming` rather than to every .screen-body on the page:
   * during a slide there are two, and resetting the outgoing one would make it
   * jump to its top while it is still visibly sliding away.
   *
   * Without this you keep the offset of the section you left, so walking out
   * of the bottom of a long garage drops you into the middle of the shop. The
   * topbar and the section title never move now, so there is not even a header
   * scrolling back into view to tell you that is what happened.
   */
  useEffect(() => {
    stage.current?.querySelector(".screen.coming .screen-body")?.scrollTo({ top: 0 });
  }, [screen, shopEpoch]);

  /** Ajustes is a dialog over the current screen, not a screen of its own. */
  const [settingsOpen, setSettingsOpen] = useState(false);

  /**
   * The tower, which is a dialog rather than a screen.
   *
   * Held as a flag here rather than as a Screen because a race is something
   * that happens OVER the game, not a place in it: you cannot reach it from
   * the nav, and while it is up the section behind it is still the section you
   * were in.
   */
  const [racing, setRacing] = useState(false);

  useEffect(() => writeSave(save), [save]);

  const track = trackById(trackId) ?? TRACKS[0]!;
  /**
   * The car you are in: the UNIT out of the garage, then the model behind it.
   *
   * Resolved on every render rather than held, so it cannot go stale -- selling
   * it, painting it or fitting a part to it changes what this reads on the next
   * render instead of leaving a copy of the old car in state.
   */
  const mine = heldOf(save, carUid);
  const car = mine ? carById(mine.id) : undefined;
  /*
   * The class you race in is the class of the car AS IT STANDS -- parts,
   * odometer and all -- not of the model in the catalogue. That is the whole
   * point of the class cap surviving mods: fit a racing turbo to a class D car
   * and you have a class C car, and the grid you meet has to agree with the
   * badge in the topbar.
   */
  const myKm = mine?.km ?? 0;
  const myMods = mine ? modsOfHeld(mine) : undefined;
  const rating = car ? ratingOf(car, myMods, myKm) : null;

  /**
   * The build as the race receives it: the sliders and tyres you chose, plus
   * the parts and odometer of the car you are actually sitting in.
   *
   * Merged HERE rather than kept in `build` state, because the parts are not
   * something the Setup screen sets -- they belong to the car, they change in
   * the workshop, and a copy of them living in React state would go stale the
   * moment you fitted a turbo without touching a slider. One source of truth
   * for what is bolted to the car, and it is the save.
   *
   * MEMOISED, and that is not a micro-optimisation. Race takes this as a
   * dependency of the useMemo that simulates the whole race, so a fresh object
   * on every render re-runs the simulation and restarts the playback effect --
   * the tower resets to lap 1 forever and the button that leaves a finished
   * race is torn out from under the cursor between renders. The flow checks
   * caught exactly that: ".race-out ... element was detached from the DOM".
   */
  const raceBuild = useMemo<Build>(
    () => ({ ...build, ...(myMods ? { mods: myMods } : {}), km: myKm }),
    [build, myMods, myKm],
  );

  /**
   * Get into a car, by uid.
   *
   * The build keeps the MODEL id, because that is what the simulation races --
   * a uid names which of your Falcons you are in, and the physics does not care
   * which. Both are set here so they can never disagree about the pair.
   */
  const pickCar = (uid: string) => {
    const held = heldOf(save, uid);
    if (!held) return;
    setCarUid(uid);
    setBuild((b) => ({ ...b, carId: held.id }));
    const name = nameOf(held.id);
    if (name) toast(`Te subiste a tu ${name}`, "good");
  };

  /*
   * Both of these resolve against the current `save` and pass a plain value to
   * setSave, rather than doing the work inside an updater. Two reasons: React
   * may call an updater twice, which would fire the toast twice, and the pure
   * functions return the save unchanged when the move is illegal -- comparing
   * by identity out here is what lets a refused click stay silent.
   */
  const buy = (
    id: string,
    price: number,
    km: number,
    color?: string,
    mods?: Mods,
    origin?: { source: string; rotation: number },
  ) => {
    const bought = buyCar(save, id, price, km, color, mods);
    if (bought === save) return;
    /*
     * The car leaves the window it was standing in.
     *
     * A listing is one CAR -- one odometer, one colour, one price -- so once it
     * is in your garage it is not still for sale. Without this the same 289.000
     * km Chevy sat on Pacheco's floor after you had driven it home, at the same
     * price, ready to be bought again as many times as you liked.
     *
     * Composed out here rather than folded into buyCar, because where a car
     * came FROM is not something buying knows about: the same function buys off
     * a forecourt, off the lot, and off whatever sells cars next. Two small
     * pure moves, applied in one setSave.
     */
    const next = origin ? takeOffFloor(bought, origin.source, origin.rotation, id) : bought;
    setSave(next);
    /*
     * And you land in the garage, next to what you just bought.
     *
     * Buying was the one thing in the game that left you exactly where you
     * started, looking at a forecourt -- so the only evidence it had worked was
     * a toast and a smaller number in the corner. The car is the point; go and
     * stand next to it.
     */
    go("garage");
    const name = nameOf(id);
    // A Marketplace car can arrive with parts on it, and that is the thing
    // worth saying: the price already told you what it cost.
    const fitted = modCount(mods);
    const extra = fitted > 0 ? `, con ${fitted} pieza${fitted === 1 ? "" : "s"} puesta${fitted === 1 ? "" : "s"}` : "";
    /*
     * How many you have now, said out loud when it is more than one.
     *
     * A second unit of a car you already own looks exactly like the first one
     * on its card, so without this the only evidence that the purchase did
     * anything is a card that was already there and a wallet that shrank. The
     * count is the confirmation.
     */
    const have = countOwned(next, id);
    const copies = have > 1 ? ` · ahora tenés ${have}` : "";
    if (name) toast(`Compraste un ${name} por ${formatCredits(price)} cr${extra}${copies}`, "good");
  };

  const sell = (uid: string) => {
    const name = nameOf(heldOf(save, uid)?.id ?? "");
    const next = sellCar(save, uid);
    if (next === save) return;
    setSave(next);
    const paid = next.credits - save.credits;
    if (name) toast(`Vendiste tu ${name} por ${formatCredits(paid)} cr`, "bad");
  };

  const repaint = (uid: string, color: string) => {
    const next = repaintCar(save, uid, color);
    if (next === save) return;
    setSave(next);
    const paid = save.credits - next.credits;
    const name = nameOf(heldOf(save, uid)?.id ?? "");
    if (name) toast(`Pintaste tu ${name} de ${colorName(color).toLowerCase()} por ${formatCredits(paid)} cr`, "good");
  };

  /**
   * Take a named car to the workshop.
   *
   * The only handler here that changes no save state: the workshop is a place,
   * so this navigates. `go` first and the ramp after, because `go` clears the
   * ramp on the way into the section -- doing it the other way round would set
   * the car and then immediately throw it away.
   */
  const tune = (uid: string) => {
    go("workshop");
    setRamp(uid);
  };

  /**
   * Fitting a part, and rectifying an engine.
   *
   * Same shape as buy/sell/repaint: resolve against the current save, compare
   * by identity, and stay silent when the move was refused. The toast names
   * the class the car ends up in whenever fitting the part moved it, because
   * that is the consequence the player is actually buying and it is the one
   * thing the price tag cannot tell them.
   */
  const fitPart = (uid: string, part: PartId, level: PartLevel) => {
    const next = installPart(save, uid, part, level);
    if (next === save) return;
    /*
     * Both ratings are read off the CAR THE PART WENT ON, not off the car you
     * happen to be sitting in. `car` was the wrong one to compare against even
     * before duplicates existed -- "Llevar al taller" can name any car in the
     * garage -- and with two of a model it would have been the wrong one twice
     * over.
     */
    const was = heldOf(save, uid);
    const now = heldOf(next, uid);
    const spec = now ? carById(now.id) : undefined;
    const before = spec && was ? ratingOf(spec, was.mods, was.km) : null;
    setSave(next);
    const paid = save.credits - next.credits;
    const name = nameOf(now?.id ?? "");
    const after = spec && now ? ratingOf(spec, now.mods, now.km) : null;
    const what =
      level === 0
        ? `Le sacaste el ${PART_NAME[part].toLowerCase()}`
        : `${PART_NAME[part]} ${LEVEL_NAME[level].toLowerCase()}`;
    const klass =
      before && after && before.letter !== after.letter ? ` · ahora corre en ${after.letter}` : "";
    if (name) toast(`${what} a tu ${name} por ${formatCredits(paid)} cr${klass}`, "good");
  };

  const rebuild = (uid: string) => {
    const next = rebuildEngine(save, uid);
    if (next === save) return;
    setSave(next);
    const paid = save.credits - next.credits;
    const name = nameOf(heldOf(save, uid)?.id ?? "");
    if (name) toast(`Rectificaste el motor de tu ${name} por ${formatCredits(paid)} cr`, "good");
  };

  /**
   * Start again.
   *
   * The save is only half of what a reset has to undo. The car you are sitting
   * in, the circuit, the setup sliders and the screen you are standing on all
   * live in React, not in the save, and a wipe that left them alone would drop
   * you into a Renault-only garage still holding an F40's gearing on a track
   * you unlocked in the game that no longer exists.
   *
   * A location.reload() would do all of it in one line, and is the wrong call:
   * it throws away the toast that says it happened, and it makes a reset the
   * only action in the game that flashes the page. Everything gets set back
   * here instead, explicitly, in the order a new player would find it.
   */
  const reset = useCallback(() => {
    const fresh = resetSave();
    const first = fresh.owned[0];
    setSave(fresh);
    setCarUid(first?.uid ?? "");
    setBuild({
      carId: first?.id ?? CARS[0]!.id,
      compound: "medium",
      setup: { aero: 0, gearing: 0, springs: 0, brakeBias: 0 },
    });
    setTrackId(TRACKS[0]!.id);
    setSettingsOpen(false);
    // A race still on screen belongs to the game that just stopped existing.
    setRacing(false);
    // Not the screen you reset from: the shop and the tower are both showing
    // a game that is gone. The garage is where a new save starts.
    go("garage");
    toast("Empezás de cero", "info");
  }, [go, toast]);

  /**
   * The two dev levers, wired the same way every other save move is: a pure
   * function resolves the next save, identity says whether anything happened,
   * and a toast reports it.
   *
   * Neither closes the dialog. Both are things you press more than once -- turn
   * the lot over until something good shows up, tap the money until you can
   * afford the car -- and a box that shuts itself after every press would make
   * the second press four clicks. The reset closes because it is terminal;
   * these are not.
   */
  /*
   * One press is one race's worth of clock, and the clock now drives two
   * things at two rates: the lot turns over every press, the concesionarias
   * every DEALER_PERIOD of them. The toast says when the slower one moved,
   * because otherwise the fifth press looks exactly like the other four while
   * being the one that changed every forecourt in the game.
   */
  const devRefreshMarket = () => {
    const next = refreshMarket(save);
    setSave(next);
    const rotated =
      dealerEra(next.racesRun + next.lotNudge) !== dealerEra(save.racesRun + save.lotNudge);
    toast(rotated ? "Marketplace y concesionarias rotados" : "Marketplace rotado", "info");
  };

  const devGrantCredits = () => {
    const next = grantCredits(save);
    if (next === save) return;
    setSave(next);
    toast(`+${formatCredits(DEV_CREDITS)} cr`, "good");
  };

  /**
   * Repairs the selection when the selected car leaves the garage. Selling is
   * the only way that happens today, but the rule belongs to the selection
   * rather than to the sell handler -- anything that can shrink `owned` gets
   * this for free, and neither this nor `sellCar` has to know about the other.
   *
   * It announces itself. Being moved into a different car without being told
   * is exactly the silent swap that clicking a card used to do.
   */
  useEffect(() => {
    if (ownsUid(save, carUid)) return;
    const next = save.owned[0];
    if (!next) return;
    setCarUid(next.uid);
    setBuild((b) => ({ ...b, carId: next.id }));
    const name = nameOf(next.id);
    if (name) toast(`Te subiste a tu ${name}`, "info");
  }, [save.owned, carUid, toast]);

  /**
   * Called once when a race reaches the flag. The purse belongs to the event,
   * so the payout depends on the class and finishing position, never on what
   * the car cost.
   */
  const finishRace = useCallback(
    (position: number, gridSize: number) => {
      if (!rating) return;
      const won = payoutFor(rating.letter, position, gridSize);
      setSave((s) => ({ ...s, credits: s.credits + won, racesRun: s.racesRun + 1 }));
    },
    [rating],
  );

  /**
   * One screen, by name.
   *
   * A function rather than the four inline blocks it replaced, because the
   * stage draws a screen TWICE during a slide -- the one arriving and the one
   * leaving -- and two copies of this markup would drift the moment a prop
   * changed on one of them.
   */
  const renderScreen = (which: Screen) => {
    switch (which) {
      case "garage":
        return (
          <Garage
            owned={save.owned}
            currentUid={carUid}
            onDrive={pickCar}
            onSell={sell}
            onTune={tune}
          />
        );
      case "shop":
        return <Shop save={save} onBuy={buy} />;
      case "workshop":
        return (
          <Workshop
            owned={save.owned}
            credits={save.credits}
            currentUid={carUid}
            openOn={ramp}
            onFit={fitPart}
            onRebuild={rebuild}
            onDrive={pickCar}
            onRepaint={repaint}
          />
        );
      case "setup":
        return (
          <SetupScreen
            carId={mine?.id ?? CARS[0]!.id}
            km={myKm}
            mods={myMods}
            image={car && mine ? imageFor(car, colorOfHeld(mine)) : undefined}
            build={raceBuild}
            onBuild={setBuild}
            track={track}
            onTrack={setTrackId}
            onRace={() => setRacing(true)}
          />
        );
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="wordmark">
          {/* The alt text is the h1's text: the heading still says Motorlife
              to a screen reader and to anything that fails to load the png. */}
          <img src="/logo.png" alt="Motorlife" />
        </h1>
        <div className="topbar-right">
          <TopNav screen={screen} onGo={go} onSettings={() => setSettingsOpen(true)} />
          {car && rating ? (
            <span className="topcar">
              <span className="topcar-logo">
                {car.logo ? <img src={car.logo} alt={car.make} /> : null}
              </span>
              <span className="topcar-name">
                {car.model}
                <span className="topcar-year">'{String(car.year).slice(2)}</span>
              </span>
              <span className={`klass-badge ${classTierClass(rating.letter)}`}>
                {rating.letter}
                {rating.index}
              </span>
            </span>
          ) : null}
          <span className="wallet">
            {formatCredits(save.credits)}
            <span>CR</span>
          </span>
        </div>
      </header>

      {/*
        * The frame, and inside it the stage.
        *
        * Nothing here scrolls. The app is the height of the window, the topbar
        * and the credit are rows of it that never move, and this is the row in
        * between -- so the stage is a box of known size rather than something
        * as tall as whatever is in it.
        *
        * That is what lets each SCREEN keep its own header on-screen and
        * scroll only its list. The scrollbar ends up beside the cards, next to
        * the thing it actually scrolls, instead of running down the edge of
        * the whole window past two bars that are pinned in place.
        *
        * The stage: the arriving screen, and the leaving one while it leaves.
        * Only during a slide are there two, and they are dealt into the same
        * grid cell -- already the same size, already stacked, which is why
        * neither has to be lifted out of the flow any more.
        *
        * The KEY is what animates each of them. A CSS animation runs once when
        * an element is created, so keying on the screen name hands React a new
        * element per arrival and the browser starts the animation over. The
        * direction rides in a data attribute rather than a class because it is
        * a value, not a state -- the stylesheet selects on it either way, and
        * this keeps `.screen` meaning one thing.
        *
        * shopEpoch is in the key because pressing the shop tab while already
        * in the shop remounts Shop to take you back to its top level.
        */}
      <div className="frame">
        <div ref={stage} className={`stage${leaving ? " sliding" : ""}`}>
          {/* The section's own name rides along as a class, so a screen that
              needs a different row layout -- setup pins its Correr button as a
              third row -- can say so in the stylesheet without App having to
              know why. */}
          {leaving ? (
            <div
              className={`screen going ${leaving.screen}`}
              data-dir={leaving.dir}
              key={`out-${leaving.screen}`}
              aria-hidden="true"
            >
              {renderScreen(leaving.screen)}
            </div>
          ) : null}

          <div
            className={`screen coming ${screen}`}
            data-dir={leaving ? leaving.dir : 0}
            key={`in-${screen}-${screen === "shop" ? shopEpoch : 0}`}
          >
            {renderScreen(screen)}
          </div>
        </div>
      </div>

      {/*
        * Outside the scroller, so it stays put while the sections slide and
        * scroll past it. It belongs to the app rather than to any one screen,
        * and a credit that slid off the left edge with the garage would be
        * claiming to be part of the garage.
        *
        * rel="noreferrer" alongside target: opening a tab with window.opener
        * live hands the other page a handle back to this one, and there is no
        * reason to.
        */}
      <footer className="credit">
        <span>De</span>{" "}
        <a href="https://www.tikitikistudios.online/es" target="_blank" rel="noreferrer">
          Tiki Tiki Studios
        </a>
      </footer>

      {/*
        * The tower, over whatever section you were in.
        *
        * Closing it lands you in the garage rather than back on Setup: the
        * race is over, the money is in, and the garage is where you go to
        * spend it. `go` rather than setScreen, so arriving there slides like
        * any other change of section.
        */}
      {racing ? (
        <Race
          carId={mine?.id ?? CARS[0]!.id}
          build={raceBuild}
          track={track}
          racesRun={save.racesRun}
          onFinish={finishRace}
          onClose={() => {
            setRacing(false);
            go("garage");
          }}
        />
      ) : null}

      {/* Last in the tree and outside the screens, because it opens over any
          of them and must not unmount when the reset changes which one is up. */}
      {settingsOpen ? (
        <SettingsModal
          onReset={reset}
          onRefreshMarket={devRefreshMarket}
          onGrantCredits={devGrantCredits}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}
