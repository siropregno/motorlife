import { useCallback, useEffect, useState } from "react";
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
import type { Screen } from "./lib/screens";
import { classTierClass } from "./lib/tiers";

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
  const go = useCallback((next: Screen) => {
    if (next === "shop") setShopEpoch((n) => n + 1);
    setScreen(next);
  }, []);

  /** Ajustes is a dialog over the current screen, not a screen of its own. */
  const [settingsOpen, setSettingsOpen] = useState(false);

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

      {screen === "garage" && (
        <Garage
          owned={save.owned}
          credits={save.credits}
          currentId={carId}
          onDrive={pickCar}
          onSell={sell}
          onRepaint={repaint}
        />
      )}

      {screen === "shop" && (
        <Shop key={shopEpoch} save={save} onBuy={buy} />
      )}

      {screen === "setup" && (
        <SetupScreen
          carId={carId}
          km={kmOwned(save, carId) ?? 0}
          image={car ? imageFor(car, colorOwned(save, carId)) : undefined}
          build={build}
          onBuild={setBuild}
          track={track}
          onTrack={setTrackId}
          onRace={() => setScreen("race")}
        />
      )}

      {screen === "race" && (
        <Race
          carId={carId}
          build={build}
          track={track}
          racesRun={save.racesRun}
          onFinish={finishRace}
        />
      )}

      {/* Last in the tree and outside the screens, because it opens over any
          of them and must not unmount when the reset changes which one is up. */}
      {settingsOpen ? (
        <SettingsModal onReset={reset} onClose={() => setSettingsOpen(false)} />
      ) : null}
    </div>
  );
}
