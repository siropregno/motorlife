/**
 * The four screens, in one place because both App (which switches on them)
 * and TopNav (which navigates between them) need the same list. Defining it in
 * App and importing it into TopNav would make a cycle, since App imports
 * TopNav; a short module is cheaper than a cycle.
 *
 * The race is NOT here. It used to be a fifth screen reached only by pressing
 * Race on the Setup screen -- a place on the board you could not get to from
 * the nav, which was already odd -- and it is a dialog now. What forced the
 * change was the sliding transition: a screen that slides out has to stay
 * mounted while it leaves, and the race is a live clock that ticks the tower
 * and pays out when the flag falls. A race left mounted to slide away would
 * keep running off-screen and could bank a purse for a race you walked out of.
 * As a dialog it never slides, so the question cannot come up.
 *
 * The WORKSHOP is here, and it was a dialog for exactly one commit. Fitting a
 * turbo is not a thing you do to a card in a grid -- it is a place you take a
 * car to, you stay a while, and the decisions in it are the ones the rest of
 * the game is about. It also cannot live over the garage for a concrete
 * reason: the class badge in the workshop is a live readout of what the car
 * would rate with the part you are hovering, and a dialog raised from a card
 * puts that readout on top of the grid it just changed.
 */
export type Screen = "garage" | "shop" | "workshop" | "setup";

/**
 * The order the sections sit in, left to right, which is the order the nav
 * draws them. It is what gives a transition its direction: going to a section
 * further right sends the old one out to the LEFT while the new one comes in
 * from the right, the way turning a page works.
 *
 * It is also the order of the errand, which is why the workshop goes third
 * rather than at the end: you own a car, you buy another, you build one, you
 * race it. Putting the workshop after Carrera would make the nav read as
 * "race, then prepare", and the slide direction would say so too.
 */
const ORDER: Record<Screen, number> = {
  garage: 0,
  shop: 1,
  workshop: 2,
  setup: 3,
};

/** 1 going right (the old screen exits left), -1 going back, 0 for no move. */
export type Direction = -1 | 0 | 1;

export function directionBetween(from: Screen, to: Screen): Direction {
  const d = ORDER[to] - ORDER[from];
  if (d === 0) return 0;
  return d > 0 ? 1 : -1;
}
