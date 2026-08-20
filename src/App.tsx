import { useState } from "react";
import type { Build } from "@contracts/race";
import { CARS } from "@catalog/cars";
import { TRACKS, trackById } from "@catalog/tracks";
import { Garage } from "./screens/Garage";
import { SetupScreen } from "./screens/Setup";
import { Race } from "./screens/Race";

type Screen = "garage" | "setup" | "race";

/**
 * Three screens is a state variable, not a router. A router gets added when
 * it earns one -- deep links, back button, shareable duel URLs.
 */
export default function App() {
  const [screen, setScreen] = useState<Screen>("garage");
  const [carId, setCarId] = useState(CARS[0]!.id);
  const [trackId, setTrackId] = useState(TRACKS[0]!.id);
  const [build, setBuild] = useState<Build>({
    carId: CARS[0]!.id,
    compound: "medium",
    setup: { aero: 0, gearing: 0, springs: 0, brakeBias: 0 },
  });

  const track = trackById(trackId) ?? TRACKS[0]!;

  const pickCar = (id: string) => {
    setCarId(id);
    setBuild((b) => ({ ...b, carId: id }));
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="wordmark">
          Motor<span>life</span>
        </h1>
        <span className="crumb">
          {screen} · {track.name}
        </span>
      </header>

      {screen === "garage" && (
        <Garage selectedId={carId} onSelect={pickCar} onContinue={() => setScreen("setup")} />
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
        <Race carId={carId} build={build} track={track} onBack={() => setScreen("setup")} />
      )}
    </div>
  );
}
