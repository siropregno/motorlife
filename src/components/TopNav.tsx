import type { Screen } from "../lib/screens";
import { ICON } from "../lib/icons";

interface Props {
  screen: Screen;
  onGo: (screen: Screen) => void;
  onSettings: () => void;
}

/**
 * Four icons, four screens.
 *
 * Setup and the race are one section, not two. They are the same errand -- you
 * go to the Setup screen to choose a circuit and a setup, and the tower is what
 * happens when you press Race. The tower is a dialog rather than a place, so
 * this tab stays lit underneath it: while a race is on, the section you are in
 * is still Carrera.
 *
 * Taller sits third rather than last because this order is the errand -- you
 * own a car, you buy another, you build one, you race it -- and the slide
 * direction is taken off it. After Carrera it would animate "race, then
 * prepare".
 */
const TABS: { to: Screen; lit: Screen[]; icon: string; label: string }[] = [
  { to: "garage", lit: ["garage"], icon: "/icon-garage.png", label: "Garaje" },
  { to: "shop", lit: ["shop"], icon: "/icon-shop.png", label: "Concesionaria" },
  { to: "workshop", lit: ["workshop"], icon: ICON.wrench, label: "Taller" },
  { to: "setup", lit: ["setup"], icon: "/icon-race.png", label: "Carrera" },
];

export function TopNav({ screen, onGo, onSettings }: Props) {
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

      {/*
        * The fourth one is not a fourth screen, and it never lights.
        *
        * It opens a dialog over whatever you were doing, so the tab that IS
        * lit stays lit -- you did not leave the garage to change a setting,
        * you opened a box on top of it. Lighting this one as well would claim
        * two places at once, and aria-current on it would tell a screen reader
        * the page changed when no page did.
        *
        * The rule underneath: tabs navigate, this acts. It is separated by a
        * hairline for the same reason.
        */}
      <span className="topnav-sep" aria-hidden="true" />
      <button
        className="topnav-btn"
        aria-label="Ajustes"
        title="Ajustes"
        onClick={onSettings}
      >
        <img src={ICON.settings} alt="" />
      </button>
    </nav>
  );
}
