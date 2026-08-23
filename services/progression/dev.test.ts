import { describe, it, expect } from "vitest";
import { DEV_CREDITS, grantCredits, refreshMarket } from "./dev";
import { SAVE_VERSION, STARTING_SAVE, resetSave, type Save } from "./save";
import { LOT_SIZE, usedLot } from "./market";

const save = (over: Partial<Save> = {}): Save => ({
  version: SAVE_VERSION,
  credits: 10_000,
  owned: [{ id: "renault-12-tl", km: 200_000 }],
  racesRun: 7,
  lotNudge: 0,
  ...over,
});

const ids = (s: Save) => usedLot(s.racesRun + s.lotNudge).map((o) => o.spec.id);

describe("refreshing the marketplace", () => {
  it("gives you a different lot", () => {
    const before = save();
    const after = refreshMarket(before);
    expect(after).not.toBe(before);
    expect(after.lotNudge).toBe(1);
    expect(ids(after)).not.toEqual(ids(before));
    expect(usedLot(after.racesRun + after.lotNudge)).toHaveLength(LOT_SIZE);
  });

  /*
   * The whole reason the nudge exists as its own field. racesRun is a stat the
   * player is shown and the race screen counts with; a refresh that bumped it
   * would be printing races nobody drove.
   */
  it("without claiming you raced, or touching anything else", () => {
    const before = save({ credits: 41_250, racesRun: 7 });
    const after = refreshMarket(before);
    expect(after.racesRun).toBe(7);
    expect(after.credits).toBe(41_250);
    expect(after.owned).toEqual(before.owned);
    expect(after.version).toBe(SAVE_VERSION);
  });

  /*
   * The lot a refresh lands on is one racing could have reached, because both
   * feed the SAME seed. That is what keeps the dev button from being able to
   * show a rotation the real game cannot produce.
   */
  it("lands on a rotation racing could have reached", () => {
    const raced = save({ racesRun: 8, lotNudge: 0 });
    const nudged = refreshMarket(save({ racesRun: 7, lotNudge: 0 }));
    expect(ids(nudged)).toEqual(ids(raced));
  });

  /* And racing after a refresh still moves the lot ON by one rather than back
     to a rotation the player has already seen. */
  it("and a race after a refresh still advances", () => {
    const nudged = refreshMarket(save({ racesRun: 7 }));
    const thenRaced = { ...nudged, racesRun: nudged.racesRun + 1 };
    expect(thenRaced.racesRun + thenRaced.lotNudge).toBe(9);
    expect(ids(thenRaced)).not.toEqual(ids(nudged));
  });

  it("stacks, so pressing it five times is five rotations on", () => {
    let s = save({ racesRun: 0 });
    for (let i = 0; i < 5; i++) s = refreshMarket(s);
    expect(s.lotNudge).toBe(5);
    expect(ids(s)).toEqual(ids(save({ racesRun: 5 })));
  });

  it("and a reset puts the marketplace back to the first rotation", () => {
    const fresh = resetSave();
    expect(fresh.lotNudge).toBe(0);
    expect(STARTING_SAVE.lotNudge).toBe(0);
  });
});

describe("granting credits", () => {
  it("adds the amount and nothing else", () => {
    const before = save({ credits: 10_000, racesRun: 7, lotNudge: 3 });
    const after = grantCredits(before);
    expect(after).not.toBe(before);
    expect(after.credits).toBe(10_000 + DEV_CREDITS);
    expect(after.racesRun).toBe(7);
    expect(after.lotNudge).toBe(3);
    expect(after.owned).toEqual(before.owned);
  });

  it("stacks, because one press is not meant to be enough for everything", () => {
    let s = save({ credits: 0 });
    for (let i = 0; i < 3; i++) s = grantCredits(s);
    expect(s.credits).toBe(DEV_CREDITS * 3);
  });

  it("takes an explicit amount", () => {
    expect(grantCredits(save({ credits: 100 }), 2_500).credits).toBe(2_600);
  });

  /*
   * The refusal contract every other save move has. This is called from a click
   * handler, and NaN in the wallet is not a caught error -- it is "NaN CR" in
   * the topbar, written to localStorage, surviving a reload.
   */
  it("refuses an amount that is not a positive number, unchanged", () => {
    const s = save();
    expect(grantCredits(s, 0)).toBe(s);
    expect(grantCredits(s, -1_000)).toBe(s);
    expect(grantCredits(s, NaN)).toBe(s);
    expect(grantCredits(s, Infinity)).toBe(s);
  });

  it("rounds, so the wallet never holds a fraction of a credit", () => {
    expect(grantCredits(save({ credits: 0 }), 10.4).credits).toBe(10);
  });

  /* Worth having as a fact rather than a comment: one press buys a real car,
     several are needed for the top of the catalogue. */
  it("is worth enough to move a tier and not enough to end the game", () => {
    expect(DEV_CREDITS).toBeGreaterThan(STARTING_SAVE.credits);
    expect(DEV_CREDITS).toBeLessThan(150_000);
  });
});
