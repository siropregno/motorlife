import { describe, it, expect } from "vitest";
import type { CarSpec } from "@contracts/car";
import { CARS } from "./cars";
import { ratingOf } from "./rating";
import {
  FACETS,
  EMPTY,
  decadeOf,
  matches,
  applyFilters,
  availableOptions,
  activeCount,
  clearFacet,
  groupBy,
  isActive,
  toggle,
  optionCounts,
} from "./filters";

const byId = (id: string) => CARS.find((c) => c.id === id) as CarSpec;
const f40 = byId("ferrari-f40"); // 1988, MR, supercar
const r12 = byId("renault-12-tl"); // 1971, FWD, saloon
const impreza = byId("subaru-impreza-22b"); // 1998, AWD, sports

describe("buckets", () => {
  it("puts a year in its decade", () => {
    expect(decadeOf(1970)).toBe("1970");
    expect(decadeOf(1979)).toBe("1970");
    expect(decadeOf(1980)).toBe("1980");
    expect(decadeOf(2005)).toBe("2000");
  });

  it("answers every facet for every car in the catalogue", () => {
    // A facet is total by construction; this is the test that keeps it that
    // way when a car arrives with a layout or class nobody mapped.
    for (const car of CARS) {
      for (const facet of FACETS) {
        const bucket = facet.bucket(car);
        const known = facet.options.some((o) => o.value === bucket);
        expect(known, `${car.id} -> ${facet.id} = "${bucket}"`).toBe(true);
      }
    }
  });

  it("collapses every rear-drive layout into one traccion", () => {
    const traccion = FACETS.find((f) => f.id === "traccion")!;
    expect(traccion.bucket(f40)).toBe("trasera"); // MR
    expect(traccion.bucket(byId("porsche-911-carrera-32"))).toBe("trasera"); // RR
    expect(traccion.bucket(byId("bmw-m5-e60"))).toBe("trasera"); // FR
    expect(traccion.bucket(r12)).toBe("delantera");
    expect(traccion.bucket(impreza)).toBe("integral");
  });
});

describe("matching", () => {
  it("passes everything when nothing is chosen", () => {
    expect(applyFilters(CARS, EMPTY)).toHaveLength(CARS.length);
    expect(isActive(EMPTY)).toBe(false);
    expect(isActive({ clase: [] })).toBe(false);
    expect(isActive({ clase: ["A"] })).toBe(true);
  });

  it("ORs within a facet", () => {
    const out = applyFilters(CARS, { decada: ["1970", "1980"] });
    expect(out.length).toBeGreaterThan(0);
    for (const c of out) expect(["1970", "1980"]).toContain(decadeOf(c.year));
    const seventies = applyFilters(CARS, { decada: ["1970"] });
    expect(out.length).toBeGreaterThan(seventies.length);
  });

  it("ANDs across facets", () => {
    const sel = { decada: ["1970"], traccion: ["delantera"] };
    const out = applyFilters(CARS, sel);
    for (const c of out) {
      expect(decadeOf(c.year)).toBe("1970");
      expect(c.layout).toBe("FWD");
    }
    // and it is genuinely narrower than either side alone
    expect(out.length).toBeLessThan(applyFilters(CARS, { decada: ["1970"] }).length);
    expect(out.length).toBeLessThan(applyFilters(CARS, { traccion: ["delantera"] }).length);
  });

  it("can select nothing at all", () => {
    // supercars are all rear or mid engined, so this pair has no members
    expect(applyFilters(CARS, { segmento: ["supercar"], traccion: ["delantera"] })).toEqual([]);
  });

  it("matches one car against its own buckets", () => {
    expect(matches(f40, { decada: ["1980"], segmento: ["supercar"], traccion: ["trasera"] })).toBe(true);
    expect(matches(f40, { decada: ["1990"] })).toBe(false);
    expect(matches(f40, { clase: [ratingOf(f40).letter] })).toBe(true);
  });
});

describe("toggle", () => {
  it("adds, removes, and leaves the other facets alone", () => {
    let sel = toggle(EMPTY, "clase", "A");
    expect(sel.clase).toEqual(["A"]);
    sel = toggle(sel, "clase", "B");
    expect(sel.clase).toEqual(["A", "B"]);
    sel = toggle(sel, "decada", "1990");
    sel = toggle(sel, "clase", "A");
    expect(sel.clase).toEqual(["B"]);
    expect(sel.decada).toEqual(["1990"]);
  });

  it("does not mutate the selection it is given", () => {
    const before = { clase: ["A"] };
    const after = toggle(before, "clase", "B");
    expect(before.clase).toEqual(["A"]);
    expect(after.clase).toEqual(["A", "B"]);
  });
});

describe("grouping", () => {
  it("splits by any facet and keeps every car exactly once", () => {
    for (const facet of FACETS) {
      const groups = groupBy(CARS, facet.id);
      const seen = groups.flatMap((g) => g.cars.map((c) => c.id));
      expect(new Set(seen).size, facet.id).toBe(CARS.length);
    }
  });

  it("comes out in the facet's declared order, oldest and slowest first", () => {
    expect(groupBy(CARS, "decada").map((g) => g.value)).toEqual([
      "1970",
      "1980",
      "1990",
      "2000",
    ]);
    expect(groupBy(CARS, "clase").map((g) => g.value)).toEqual(["D", "C", "B", "A"]);
  });

  it("names the section with the facet, not just the bucket", () => {
    expect(groupBy(CARS, "clase")[0]!.label).toBe("Clase D");
    expect(groupBy(CARS, "decada")[0]!.label).toBe("Década 1970s");
    expect(groupBy(CARS, "traccion").map((g) => g.label)).toContain("Tracción Integral");
  });

  it("drops empty sections rather than showing a heading over nothing", () => {
    const oneCar = CARS.filter((c) => c.id === "ferrari-f40");
    expect(groupBy(oneCar, "clase")).toHaveLength(1);
    expect(groupBy(oneCar, "clase")[0]!.label).toBe("Clase A");
  });
});

describe("the advanced-filter badge", () => {
  it("counts chips lit across every facet", () => {
    expect(activeCount(EMPTY)).toBe(0);
    expect(activeCount({ clase: ["A", "B"] })).toBe(2);
    expect(activeCount({ clase: ["A"], traccion: ["integral"], decada: ["1990"] })).toBe(3);
  });

  it("clears one facet and leaves the rest", () => {
    const sel = { clase: ["A"], traccion: ["integral"] };
    expect(clearFacet(sel, "clase")).toEqual({ clase: [], traccion: ["integral"] });
    expect(sel.clase).toEqual(["A"]);
  });
});

describe("option counts", () => {
  it("ignores the facet's own choices so the row stays readable", () => {
    // Pick one decade; the other decades must still report their real totals
    // rather than collapsing to zero.
    const all = optionCounts(CARS, EMPTY, "decada");
    const picked = optionCounts(CARS, { decada: ["1970"] }, "decada");
    expect(picked).toEqual(all);
    expect(all.get("1970")).toBeGreaterThan(0);
    expect(all.get("1990")).toBeGreaterThan(0);
  });

  it("does narrow by the other facets", () => {
    const all = optionCounts(CARS, EMPTY, "traccion");
    const fwdIn70s = optionCounts(CARS, { decada: ["1970"] }, "traccion");
    expect(fwdIn70s.get("delantera")!).toBeLessThan(all.get("delantera")!);
  });

  it("reports zero for a bucket no car is in", () => {
    // S and X are declared but the catalogue tops out at A
    const counts = optionCounts(CARS, EMPTY, "clase");
    expect(counts.get("X")).toBe(0);
    expect(counts.get("A")).toBeGreaterThan(0);
  });

  it("drops buckets no car is in, and only those", () => {
    // permanently dead in this catalogue: no 1960s or 2010s car, nothing
    // above class A, nothing in Económico or Competición
    expect(availableOptions(CARS, "decada").map((o) => o.value)).toEqual([
      "1970",
      "1980",
      "1990",
      "2000",
    ]);
    expect(availableOptions(CARS, "clase").map((o) => o.value)).toEqual(["D", "C", "B", "A"]);
    expect(availableOptions(CARS, "traccion")).toHaveLength(3);
    for (const o of availableOptions(CARS, "segmento")) {
      expect(["economy", "race"]).not.toContain(o.value);
    }
  });

  it("keeps the declared order when it prunes", () => {
    // the row must not reorder itself; pruning is a filter, not a sort
    const facet = FACETS.find((f) => f.id === "segmento")!;
    const kept = availableOptions(CARS, "segmento").map((o) => o.value);
    const declared = facet.options.map((o) => o.value).filter((v) => kept.includes(v));
    expect(kept).toEqual(declared);
  });

  it("ignores the selection when deciding what exists", () => {
    // narrowing to one car must not collapse the rows to that car's buckets
    const sel = { segmento: ["truck"] };
    expect(availableOptions(applyFilters(CARS, sel), "decada")).toHaveLength(1);
    expect(availableOptions(CARS, "decada")).toHaveLength(4);
  });

  it("counts what clicking would actually give you", () => {
    const counts = optionCounts(CARS, { traccion: ["integral"] }, "segmento");
    for (const [value, n] of counts) {
      const got = applyFilters(CARS, { traccion: ["integral"], segmento: [value] }).length;
      expect(got, `segmento ${value}`).toBe(n);
    }
  });
});
