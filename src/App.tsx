import { useCallback, useEffect, useState } from "react";
import type { Build } from "@contracts/race";
import { CARS, carById } from "@catalog/cars";
import { TRACKS, trackById } from "@catalog/tracks";
import { ratingOf } from "@catalog/rating";
import { loadSave, writeSave, type Save } from "@progression/save";
import { formatCredits, payoutFor } from "@progression/economy";
import { Garage } from "./screens/Garage";
import { SetupScreen } from "./screens/Setup";
import { Race } from "./screens/Race";
import { Shop } from "./screens/Shop";
import { classTierClass } from "./lib/tiers";

type Screen = "garage" | "shop" | "setup" | "race";

export default function App() {
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
  };

  const buy = (id: string, price: number) => {
    setSave((s) =>
      s.credits < price || s.owned.includes(id)
        ? s
        : { ...s, credits: s.credits - price, owned: [...s.owned, id] },
    );
  };

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
          Motor<span>life</span>
        </h1>
        <div className="topbar-right">
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
          selectedId={carId}
          onSelect={pickCar}
          onShop={() => setScreen("shop")}
          onContinue={() => setScreen("setup")}
        />
      )}

      {screen === "shop" && (
        <Shop save={save} onBuy={buy} onBack={() => setScreen("garage")} />
      )}

      {screen === "setup" && (
        <SetupScreen
          carId={carId}
          build={build}
          onBuild={setBuild}
          track={track}
          onTrack={setTrackId}
          onRace={() => setScreen("race")}
          onBack={() => setScreen("garage")}
        />
      )}

      {screen === "race" && (
        <Race
          carId={carId}
          build={build}
          track={track}
          onFinish={finishRace}
          onBack={() => setScreen("setup")}
        />
      )}
    </div>
  );
}
