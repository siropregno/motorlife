import type { CarSpec } from "@contracts/car";
import type { ClassLetter } from "@sim/rating";
import { ratingOf } from "./rating";

/**
 * The dealership's facets.
 *
 * Four questions a buyer actually asks -- what era, how fast, what kind of
 * car, which wheels drive -- each answered by a field the catalogue already
 * has. Nothing here is stored per car: a facet is a function from a CarSpec to
 * one bucket, so adding a car cannot put the filters out of sync with the
 * list.
 *
 * The options are declared rather than harvested from CARS. Harvesting would
 * mean the filter row silently changes shape when a car is added or sold, and
 * an option list that reorders itself under the cursor is worse than one that
 * occasionally shows a bucket with nothing in it. optionCounts() reports the
 * empties so the UI can dim them.
 */

export type FacetId = "decada" | "clase" | "segmento" | "traccion";

export interface FacetOption {
  value: string;
  label: string;
}

export interface Facet {
  id: FacetId;
  label: string;
  options: FacetOption[];
  /** Which bucket this car falls in. Total: every car answers every facet. */
  bucket: (car: CarSpec) => string;
}

const CLASS_ORDER: ClassLetter[] = ["D", "C", "B", "A", "S", "X"];

/**
 * Traction is the driven axle, not the engine bay. FR, MR and RR are three
 * different places to put an engine and one answer to "which wheels pull",
 * so they collapse. Someone filtering for trasera wants the Torino and the
 * F40 in the same list.
 */
const TRACTION: Record<string, string> = {
  FWD: "delantera",
  AWD: "integral",
  FR: "trasera",
  MR: "trasera",
  RR: "trasera",
};

const SEGMENT_LABELS: Record<string, string> = {
  economy: "Económico",
  saloon: "Sedán",
  truck: "Pickup",
  muscle: "Muscle",
  sports: "Deportivo",
  supercar: "Superdeportivo",
  race: "Competición",
};

/** 1974 -> "1970". The bucket is the decade's first year, as a string. */
export function decadeOf(year: number): string {
  return String(Math.floor(year / 10) * 10);
}

export const FACETS: Facet[] = [
  {
    id: "decada",
    label: "Década",
    options: ["1960", "1970", "1980", "1990", "2000", "2010"].map((d) => ({
      value: d,
      label: `${d}s`,
    })),
    bucket: (c) => decadeOf(c.year),
  },
  {
    id: "clase",
    label: "Clase",
    options: CLASS_ORDER.map((l) => ({ value: l, label: l })),
    bucket: (c) => ratingOf(c).letter,
  },
  {
    id: "segmento",
    label: "Segmento",
    options: (["saloon", "sports", "muscle", "supercar", "truck", "economy", "race"] as const).map(
      (s) => ({ value: s, label: SEGMENT_LABELS[s]! }),
    ),
    bucket: (c) => c.cls,
  },
  {
    id: "traccion",
    label: "Tracción",
    options: [
      { value: "delantera", label: "Delantera" },
      { value: "trasera", label: "Trasera" },
      { value: "integral", label: "Integral" },
    ],
    bucket: (c) => TRACTION[c.layout] ?? "trasera",
  },
];

/** Chosen values per facet. An absent or empty list means "no preference". */
export type Selection = Partial<Record<FacetId, string[]>>;

export const EMPTY: Selection = {};

/** Within a facet the choices are OR; across facets they are AND. */
export function matches(car: CarSpec, sel: Selection): boolean {
  return FACETS.every((f) => {
    const picked = sel[f.id];
    return !picked?.length || picked.includes(f.bucket(car));
  });
}

export function applyFilters(cars: CarSpec[], sel: Selection): CarSpec[] {
  return cars.filter((c) => matches(c, sel));
}

export function isActive(sel: Selection): boolean {
  return FACETS.some((f) => (sel[f.id]?.length ?? 0) > 0);
}

/** Chips lit, across all facets. The badge on the advanced-filter button. */
export function activeCount(sel: Selection): number {
  return FACETS.reduce((n, f) => n + (sel[f.id]?.length ?? 0), 0);
}

/** Clear one facet without touching the others. */
export function clearFacet(sel: Selection, id: FacetId): Selection {
  return { ...sel, [id]: [] };
}

/** Add or remove one value, leaving the other facets alone. */
export function toggle(sel: Selection, id: FacetId, value: string): Selection {
  const picked = sel[id] ?? [];
  const next = picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value];
  return { ...sel, [id]: next };
}

/**
 * Set a facet to exactly one value, or to nothing when given "".
 *
 * The dropdowns are single-choice but Selection stays a list per facet. That
 * costs nothing and keeps matches(), the counts and their tests untouched --
 * a dropdown is just the subset of the model where the list is never longer
 * than one. If a multi-select ever comes back, only the control changes.
 */
export function selectOne(sel: Selection, id: FacetId, value: string): Selection {
  return { ...sel, [id]: value ? [value] : [] };
}

/** The single chosen value, or "" for no preference. */
export function selectedOne(sel: Selection, id: FacetId): string {
  return sel[id]?.[0] ?? "";
}

export interface Group {
  value: string;
  /** "Clase D", "Década 1970s" -- the facet name carries into the heading. */
  label: string;
  cars: CarSpec[];
}

export type Direction = "asc" | "desc";

/**
 * Split a listing into sections by any facet.
 *
 * The same four buckets that filter the list also sort it, which is the whole
 * reason a facet is a function rather than a stored field: "group by década"
 * and "show me only the 1970s" are the same question asked twice.
 *
 * Ascending is the facet's declared order -- oldest decade first, D before A
 * -- with the rating ladder ascending inside each section. Descending flips
 * BOTH, which is the only reading of the word that does not surprise: a list
 * headed 2000s that still puts its slowest car on top is half-reversed and
 * reads as a bug. Empty sections are dropped either way.
 */
export function groupBy(cars: CarSpec[], id: FacetId, dir: Direction = "asc"): Group[] {
  const facet = FACETS.find((f) => f.id === id)!;
  const sign = dir === "asc" ? 1 : -1;
  const groups = facet.options
    .map((o) => ({
      value: o.value,
      label: `${facet.label} ${o.label}`,
      cars: cars
        .filter((c) => facet.bucket(c) === o.value)
        .sort((a, b) => sign * (ratingOf(a).index - ratingOf(b).index)),
    }))
    .filter((g) => g.cars.length > 0);
  return dir === "asc" ? groups : groups.reverse();
}

/**
 * The options worth putting on screen for one facet: those some car in the
 * pool is in, ignoring the current selection entirely.
 *
 * This is a different question from optionCounts. That one asks "what would
 * clicking this give me" and is allowed to answer zero -- a bucket that is
 * empty because of a choice you made stays visible and dims, so the row does
 * not reflow under the cursor. This one asks "does this bucket exist at all",
 * and prunes the ones that never will: the catalogue has no 1960s car, no
 * class S, nothing in Económico or Competición, and a permanently dead chip
 * is furniture. It only changes when the pool does, which is when you buy
 * something.
 */
export function availableOptions(cars: CarSpec[], id: FacetId): FacetOption[] {
  const facet = FACETS.find((f) => f.id === id)!;
  const present = new Set(cars.map((c) => facet.bucket(c)));
  return facet.options.filter((o) => present.has(o.value));
}

/**
 * How many cars each option of one facet would leave, given the OTHER facets'
 * choices but ignoring this facet's own.
 *
 * Ignoring its own is the point. Count it with the facet applied and every
 * unpicked option reads zero the moment you pick one, which tells you nothing
 * and makes the row look broken. This way the numbers answer "what happens if
 * I click this", which is the only question a facet count is ever asked.
 */
export function optionCounts(
  cars: CarSpec[],
  sel: Selection,
  id: FacetId,
): Map<string, number> {
  const facet = FACETS.find((f) => f.id === id)!;
  const others: Selection = { ...sel, [id]: [] };
  const counts = new Map<string, number>();
  for (const o of facet.options) counts.set(o.value, 0);
  for (const car of cars) {
    if (!matches(car, others)) continue;
    const b = facet.bucket(car);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  return counts;
}
