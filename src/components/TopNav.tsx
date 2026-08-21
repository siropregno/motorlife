import type { Screen } from "../lib/screens";

interface Props {
  screen: Screen;
  onGo: (screen: Screen) => void;
}

/**
 * Three icons, four screens.
 *
 * Setup and Race are one section, not two. They are the same errand -- you go
 * to the Setup screen to choose a circuit and a setup, and the tower is what
 * happens when you press Race. Giving them a tab each would put a tab on the
 * board that you cannot reach without going through its neighbour first.
 *
 * So the Race tab lands on Setup, and stays lit through the race itself.
 */
const TABS: { to: Screen; lit: Screen[]; icon: string; label: string }[] = [
  { to: "garage", lit: ["garage"], icon: "/icon-garage.png", label: "Garaje" },
  { to: "shop", lit: ["shop"], icon: "/icon-shop.png", label: "Concesionaria" },
  { to: "setup", lit: ["setup", "race"], icon: "/icon-race.png", label: "Carrera" },
];

export function TopNav({ screen, onGo }: Props) {
  return (
    <nav className="topnav" aria-label="Secciones">
      {TABS.map((t) => {
        const on = t.lit.includes(screen);
        return (
          <button
            key={t.to}
            className={`topnav-btn${on ? " on" : ""}`}
            // aria-current is what says "you are here" to a screen reader; the
            // purple fill only says it to eyes
            aria-current={on ? "page" : undefined}
            aria-label={t.label}
            title={t.label}
            onClick={() => onGo(t.to)}
          >
            <img src={t.icon} alt="" />
          </button>
        );
      })}
    </nav>
  );
}
