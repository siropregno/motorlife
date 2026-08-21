import { useCallback, useEffect, useState } from "react";
import type { Build } from "@contracts/race";
import { CARS, carById } from "@catalog/cars";
import { TRACKS, trackById } from "@catalog/tracks";
import { ratingOf } from "@catalog/rating";
import { loadSave, writeSave, type Save } from "@progression/save";
import { buyCar, formatCredits, payoutFor, sellCar } from "@progression/economy";
import { Garage } from "./screens/Garage";
import { SetupScreen } from "./screens/Setup";
import { Race } from "./screens/Race";
import { Shop } from "./screens/Shop";
import { useToast } from "./components/Toasts";
import { TopNav } from "./components/TopNav";
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
  const [carId, setCarId] = useState(() => loadSave().owned[0] ?? CARS[0]!.id);
  const [trackId, setTrackId] = useState(TRACKS[0]!.id);
  const [build, setBuild] = useState<Build>(() => ({
    carId: loadSave().owned[0] ?? CARS[0]!.id,
    compound: "medium",
    setup: { aero: 0, gearing: 0, springs: 0, brakeBias: 0 },
  }));

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
  const buy = (id: string, price: number) => {
    const next = buyCar(save, id, price);
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
    if (save.owned.includes(carId)) return;
    const next = save.owned[0];
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
          <TopNav screen={screen} onGo={setScreen} />
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
          currentId={carId}
          onDrive={pickCar}
          onSell={sell}
        />
      )}

      {screen === "shop" && (
        <Shop save={save} onBuy={buy} />
      )}

      {screen === "setup" && (
        <SetupScreen
          carId={carId}
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
    </div>
  );
}
