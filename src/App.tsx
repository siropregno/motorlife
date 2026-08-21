import { useCallback, useEffect, useRef, useState } from "react";
import type { Build } from "@contracts/race";
import { CARS, carById } from "@catalog/cars";
import { TRACKS, trackById } from "@catalog/tracks";
import { ratingOf } from "@catalog/rating";
import { loadSave, writeSave, resetSave, colorOwned, kmOwned, ownsCar, type Save } from "@progression/save";
import { buyCar, formatCredits, payoutFor, repaintCar, sellCar } from "@progression/economy";
import { colorName, imageFor } from "@progression/paint";
import { Garage } from "./screens/Garage";
import { SetupScreen } from "./screens/Setup";
import { Race } from "./screens/Race";
import { Shop } from "./screens/Shop";
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
 */
const SLIDE_MS = 340;

/** "Renault R12 TL" -- how a car is named in prose rather than on its card. */
const nameOf = (id: string) => {
  const spec = carById(id);
  return spec ? `${spec.make} ${spec.model}` : null;
};

export default function App() {
  const toast = useToast();
  const [save, setSave] = useState<Save>(() => loadSave());
  const [screen, setScreen] = useState<Screen>("garage");
  const [carId, setCarId] = useState(() => loadSave().owned[0]?.id ?? CARS[0]!.id);
  const [trackId, setTrackId] = useState(TRACKS[0]!.id);
  const [build, setBuild] = useState<Build>(() => ({
    carId: loadSave().owned[0]?.id ?? CARS[0]!.id,
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
       * Pressing the tab you are already on is not a slide. It still means
       * something for the shop -- it takes you back to its top level -- but
       * sending the screen off the left edge and bringing the same screen back
       * from the right would be a lot of movement to say "you are already
       * here".
       */
      if (screen === next) return;

      /*
       * Remember the height before anything moves.
       *
       * It becomes a FLOOR under the stage for the length of the slide, not a
       * fixed height. The leaving screen goes position:absolute, so without
       * this the frame would snap to the arriving screen's height the instant
       * the transition starts -- and going from a tall section to a short one
       * that yanks the page up under the cursor mid-click.
       *
       * A floor rather than a pin because the arriving screen may well be
       * TALLER. Pinning it cropped every such arrival at the old screen's
       * height: the shop's cards were cut in half, names missing, until the
       * timer released the clamp a third of a second later.
       */
      const el = stage.current;
      if (el) el.style.setProperty("--stage-h", `${el.offsetHeight}px`);

      // A slide already running is abandoned rather than queued. Pressing
      // three tabs quickly should land on the third, not play three
      // animations in a row.
      if (sweep.current) clearTimeout(sweep.current);
      setLeaving({ screen, dir: directionBetween(screen, next) });
      setScreen(next);
      sweep.current = setTimeout(() => {
        setLeaving(null);
        sweep.current = null;
        stage.current?.style.removeProperty("--stage-h");
      }, SLIDE_MS);
    },
    [screen],
  );

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
  const car = carById(carId);
  const rating = car ? ratingOf(car) : null;

  const pickCar = (id: string) => {
    setCarId(id);
    setBuild((b) => ({ ...b, carId: id }));
    const name = nameOf(id);
    if (name) toast(`Te subiste a tu ${name}`, "good");
  };

  /*
   * Both of these resolve against the current `save` and pass a plain value to
   * setSave, rather than doing the work inside an updater. Two reasons: React
   * may call an updater twice, which would fire the toast twice, and the pure
   * functions return the save unchanged when the move is illegal -- comparing
   * by identity out here is what lets a refused click stay silent.
   */
  const buy = (id: string, price: number, km: number, color?: string) => {
    const next = buyCar(save, id, price, km, color);
    if (next === save) return;
    setSave(next);
    const name = nameOf(id);
    if (name) toast(`Compraste un ${name} por ${formatCredits(price)} cr`, "good");
  };

  const sell = (id: string) => {
    const name = nameOf(id);
    const next = sellCar(save, id);
    if (next === save) return;
    setSave(next);
    const paid = next.credits - save.credits;
    if (name) toast(`Vendiste tu ${name} por ${formatCredits(paid)} cr`, "bad");
  };

  const repaint = (id: string, color: string) => {
    const next = repaintCar(save, id, color);
    if (next === save) return;
    setSave(next);
    const paid = save.credits - next.credits;
    const name = nameOf(id);
    if (name) toast(`Pintaste tu ${name} de ${colorName(color).toLowerCase()} por ${formatCredits(paid)} cr`, "good");
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
    const first = fresh.owned[0]?.id ?? CARS[0]!.id;
    setSave(fresh);
    setCarId(first);
    setBuild({
      carId: first,
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
   * Repairs the selection when the selected car leaves the garage. Selling is
   * the only way that happens today, but the rule belongs to the selection
   * rather than to the sell handler -- anything that can shrink `owned` gets
   * this for free, and neither this nor `sellCar` has to know about the other.
   *
   * It announces itself. Being moved into a different car without being told
   * is exactly the silent swap that clicking a card used to do.
   */
  useEffect(() => {
    if (ownsCar(save, carId)) return;
    const next = save.owned[0]?.id;
    if (!next) return;
    setCarId(next);
    setBuild((b) => ({ ...b, carId: next }));
    const name = nameOf(next);
    if (name) toast(`Te subiste a tu ${name}`, "info");
  }, [save.owned, carId, toast]);

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
            credits={save.credits}
            currentId={carId}
            onDrive={pickCar}
            onSell={sell}
            onRepaint={repaint}
          />
        );
      case "shop":
        return <Shop save={save} onBuy={buy} />;
      case "setup":
        return (
          <SetupScreen
            carId={carId}
            km={kmOwned(save, carId) ?? 0}
            image={car ? imageFor(car, colorOwned(save, carId)) : undefined}
            build={build}
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
        * The stage: the arriving screen, and the leaving one while it leaves.
        *
        * Only during a slide are there two. The leaving one is lifted out of
        * the flow by CSS; the arriving one stays in it and is what gives the
        * stage its height, so the frame ends up the size of the screen you are
        * going to be looking at. `go` measures the old height first and leaves
        * it as a floor, so the page cannot jump upward mid-slide.
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
      <div ref={stage} className={`stage${leaving ? " sliding" : ""}`}>
        {leaving ? (
          <div className="screen going" data-dir={leaving.dir} key={`out-${leaving.screen}`} aria-hidden="true">
            {renderScreen(leaving.screen)}
          </div>
        ) : null}

        <div
          className="screen coming"
          data-dir={leaving ? leaving.dir : 0}
          key={`in-${screen}-${screen === "shop" ? shopEpoch : 0}`}
        >
          {renderScreen(screen)}
        </div>
      </div>

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
          carId={carId}
          build={build}
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
        <SettingsModal onReset={reset} onClose={() => setSettingsOpen(false)} />
      ) : null}
    </div>
  );
}
