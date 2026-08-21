/**
 * The three screens, in one place because both App (which switches on them)
 * and TopNav (which navigates between them) need the same list. Defining it in
 * App and importing it into TopNav would make a cycle, since App imports
 * TopNav; a short module is cheaper than a cycle.
 *
 * The race is NOT here. It used to be a fourth screen reached only by pressing
 * Race on the Setup screen -- a place on the board you could not get to from
 * the nav, which was already odd -- and it is a dialog now. What forced the
 * change was the sliding transition: a screen that slides out has to stay
 * mounted while it leaves, and the race is a live clock that ticks the tower
 * and pays out when the flag falls. A race left mounted to slide away would
 * keep running off-screen and could bank a purse for a race you walked out of.
 * As a dialog it never slides, so the question cannot come up.
 */
export type Screen = "garage" | "shop" | "setup";

/**
 * The order the sections sit in, left to right, which is the order the nav
 * draws them. It is what gives a transition its direction: going to a section
 * further right sends the old one out to the LEFT while the new one comes in
 * from the right, the way turning a page works.
 */
const ORDER: Record<Screen, number> = {
  garage: 0,
  shop: 1,
  setup: 2,
};

/** 1 going right (the old screen exits left), -1 going back, 0 for no move. */
export type Direction = -1 | 0 | 1;

export function directionBetween(from: Screen, to: Screen): Direction {
  const d = ORDER[to] - ORDER[from];
  if (d === 0) return 0;
  return d > 0 ? 1 : -1;
}
