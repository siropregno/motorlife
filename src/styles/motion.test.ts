import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * The motion CHARACTER, gated.
 *
 * What is tested here is not that anything animates -- that needs a browser and
 * is checked in tools/flows.mjs. It is that the rules the character is made of
 * still hold across the stylesheets, which is a property of the text and can be
 * read in the free lane.
 *
 * This exists because the character is the kind of thing that decays silently.
 * Nobody ever breaks it on purpose; somebody adds a screen, reaches for a
 * duration, and writes `0.25s` because it looked right on the surface they were
 * building. That is exactly how the app got to eight durations and five easings
 * before tokens.css, and none of the eight was wrong on its own either. A test
 * is the only thing that makes the eighth one fail loudly instead of just
 * making the app feel slightly unaccountable.
 */

const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");

const SHEETS = ["app.css", "card.css", "menu.css", "modal.css", "motion.css", "toast.css", "tokens.css", "tower.css"];

/**
 * How a deliberate exception declares itself.
 *
 * The character has exactly one exception today -- the race tower's row, where
 * the animation is the CONTENT rather than chrome: a row moving is a car
 * overtaking, and the half-second overshoot is what makes a pass readable at
 * speed. That is a real reason and it should be allowed to stand.
 *
 * What it must not do is stand SILENTLY, because "this file is different" is
 * how a system stops being one. So an exception is opted into in the
 * stylesheet, on the rule itself, and the marker is the word: a line tagged
 * `motion-exception` is exempt, and every one of them is greppable in a second.
 *
 * The test is therefore not "tower.css is allowed to be weird" -- it is "a
 * deviation has to be signed". Adding a new one is a deliberate act that shows
 * up in a diff as a claim somebody made, which is the whole difference between
 * an exception and a drift.
 */
const SIGNED = "motion-exception";

/**
 * Strip comments, so the prose ABOUT durations is not mistaken for durations --
 * these stylesheets discuss their own timings at length.
 *
 * Comments are replaced by a blank line each rather than deleted, so the line
 * numbers a failure reports still point at the real line in the file. A stray
 * value reported 60 lines off is a failure somebody has to go hunting for.
 *
 * The signed marker is lifted out first: it lives in a comment, and it has to
 * survive the stripping to still be readable on the line it exempts.
 */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (c) => {
    const lines = "\n".repeat((c.match(/\n/g) ?? []).length);
    return c.includes(SIGNED) ? `/*${SIGNED}*/${lines}` : lines;
  });

/**
 * Every declaration in a stylesheet, as {property...semicolon} with the line it
 * starts on and whether it is signed.
 *
 * A declaration rather than a line because the house style puts one value per
 * line inside a `transition:`, so half the times in this app are on a line that
 * does not contain the word "transition" at all. Splitting on lines would miss
 * exactly the cases worth catching.
 *
 * `signed` is true when the marker appears anywhere from the end of the
 * previous declaration up to this one -- which is where a comment explaining a
 * rule actually sits.
 */
function declarations(src: string): { text: string; line: number; signed: boolean }[] {
  const out: { text: string; line: number; signed: boolean }[] = [];
  const lineAt = (i: number) => src.slice(0, i).split("\n").length;

  let start = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (c === ";" || c === "{" || c === "}") {
      const chunk = src.slice(start, i);
      // A declaration is the part after the last brace or semicolon that
      // actually looks like `property: value`.
      if (c === ";" && /:/.test(chunk)) {
        out.push({
          text: chunk,
          line: lineAt(start + chunk.search(/\S/)),
          signed: chunk.includes(SIGNED),
        });
      }
      start = i + 1;
    }
  }
  return out;
}

describe("the vocabulary is the only vocabulary", () => {
  /*
   * The rule that keeps every other rule honest: a duration in this app is one
   * of three named things, never a number chosen on the day.
   *
   * The three tokens' own definitions in tokens.css are the exception and are
   * skipped -- something has to say what 400ms is.
   */
  it("no stylesheet writes a raw duration", () => {
    const stray: string[] = [];

    for (const file of SHEETS) {
      // A time can span lines -- a `transition:` with one value per line is the
      // house style -- so the unit is the DECLARATION, from the property to its
      // semicolon, rather than the line.
      for (const d of declarations(code(read(file)))) {
        if (!/^\s*(transition|animation)(-duration|-delay)?\s*:/.test(d.text)) continue;
        if (d.signed) continue;
        if (/(?<![\w-])\d*\.?\d+m?s(?![\w-])/.test(d.text)) {
          stray.push(`${file}:${d.line}  ${d.text.trim().replace(/\s+/g, " ")}`);
        }
      }

      // The token definitions are the one place a raw duration belongs, and
      // they are checked separately: something has to say what 400ms is.
      const src = code(read(file));
      if (file === "tokens.css") {
        for (const name of ["tap", "move", "travel"]) {
          expect(
            new RegExp(`--dur-${name}:\\s*\\d+m?s`).test(src),
            `--dur-${name} must be defined with a real time`,
          ).toBe(true);
        }
      }
    }

    expect(stray).toEqual([]);
  });

  /*
   * The same rule for the two curves. A bezier written out by hand is a fifth
   * easing being born, and the reason it matters is rule 4: arriving
   * decelerates and leaving accelerates, which is only a rule while there are
   * exactly two curves for it to be about.
   *
   * `ease` on its own is allowed and is deliberately not caught here -- it is
   * what a press and a hover want, because both reverse and an asymmetric
   * curve makes the return trip feel unlike the outbound one. tokens.css says
   * so at the bottom.
   */
  it("no stylesheet writes a raw easing curve", () => {
    const stray: string[] = [];

    for (const file of SHEETS) {
      for (const d of declarations(code(read(file)))) {
        // The two tokens' own definitions.
        if (/^\s*--ease-(in|out)\s*:/.test(d.text)) continue;
        if (d.signed) continue;
        if (/cubic-bezier|\bease-in-out\b|\bsteps\(/.test(d.text)) {
          stray.push(`${file}:${d.line}  ${d.text.trim().replace(/\s+/g, " ")}`);
        }
      }
    }

    expect(stray).toEqual([]);
  });

  /*
   * The exceptions, counted.
   *
   * A signed deviation is allowed; a growing pile of them is the system
   * dissolving one reasonable decision at a time. Pinning the number means the
   * SECOND exception is a conversation rather than a commit -- whoever adds one
   * has to come here and change this line, which is exactly the moment to ask
   * whether the character is wrong instead.
   */
  it("has exactly one signed exception, and it is the race tower", () => {
    // The FILE, not the line: pinning a line number makes this fail every time
    // somebody edits a comment above it, which trains people to update the
    // expectation without reading it -- the opposite of what it is for.
    const signed: string[] = [];
    for (const file of SHEETS) {
      for (const d of declarations(code(read(file)))) {
        if (d.signed) signed.push(file);
      }
    }
    expect(signed).toEqual(["tower.css"]);
  });
});

describe("rule 4: arriving decelerates, leaving accelerates", () => {
  /*
   * The two curves have to actually BE the two things they are named for, or
   * the rule is a comment rather than a fact.
   *
   * A cubic-bezier's first control point is what decides the start: y1 well
   * above x1 means the curve leaves the origin fast and settles -- a
   * decelerate. y1 at or below x1 means it starts slow and builds -- an
   * accelerate. So the test is a comparison between the two, not a match
   * against literal numbers, which would just be the values written twice.
   */
  const control = (name: string) => {
    const src = read("tokens.css");
    const m = new RegExp(`--ease-${name}:\\s*cubic-bezier\\(([^)]+)\\)`).exec(src);
    if (!m) throw new Error(`--ease-${name} is not a cubic-bezier`);
    const [x1, y1] = m[1]!.split(",").map((n) => Number(n.trim()));
    return { x1: x1!, y1: y1! };
  };

  it("--ease-out leaves fast and settles", () => {
    const { x1, y1 } = control("out");
    expect(y1).toBeGreaterThan(x1);
  });

  it("--ease-in starts slow and builds", () => {
    const { x1, y1 } = control("in");
    expect(y1).toBeLessThan(x1);
  });

  it("and they are genuinely different curves", () => {
    expect(control("out")).not.toEqual(control("in"));
  });
});

describe("rule 1: one thing at a time", () => {
  /*
   * The taller's two-beat gesture, pinned as arithmetic rather than as a pair
   * of numbers that have to be remembered together.
   *
   * The arrival's DELAY has to be the exit's DURATION. That is the whole
   * mechanism -- it is what makes the row wait out the exit instead of
   * overlapping it -- and it is the thing that breaks the moment somebody
   * retunes one of the two by hand.
   */
  it("the workshop's arrival waits exactly as long as its exit takes", () => {
    const src = code(read("app.css"));

    const exit = /\.workshop-tiles\.going\s*\{[^}]*animation:[^;]*?\bvar\(--dur-out\)/s.test(src);
    expect(exit, ".workshop-tiles.going must run for --dur-out").toBe(true);

    // The arriving halves -- the tiles and the fixed acts beside them -- are
    // both delayed by that same token.
    for (const sel of ["\\.workshop-tiles\\.coming", "\\.workshop-acts"]) {
      const rule = new RegExp(`${sel}\\s*\\{[^}]*animation:([^;]*);`, "s").exec(src);
      expect(rule, `${sel} must have an animation`).not.toBeNull();
      expect(rule![1]).toContain("var(--dur-out)");
    }
  });

  /*
   * The setup screen's translation of the same idea: the right column starts
   * after the left has FINISHED, rather than counting in parallel with it.
   *
   * Without the offset the two columns arrive two panels at a time, side by
   * side, which is the identical failure the workshop's overlapping first cut
   * had -- two things moving at once and no single thing to look at.
   */
  it("setup's second column waits for the first", () => {
    const src = code(read("app.css"));
    const m = /\.setup-grid\.run\s*>\s*\.setup-col:nth-child\(2\)\s*>\s*\*\s*\{([^}]*)\}/s.exec(src);
    expect(m, "the second column must set its own --beat").not.toBeNull();
    // It waits out a full arrival, not merely one more step.
    expect(m![1]).toContain("var(--dur-move)");
  });
});

describe("the run", () => {
  /*
   * The cap. A stagger with no ceiling is a bug that only shows up once
   * somebody owns thirty cars, which is to say it ships.
   */
  it("orders the first few and lands the rest with them", () => {
    const src = code(read("motion.css"));

    const base = /\.run\s*>\s*\*\s*\{([^}]*)\}/s.exec(src);
    expect(base, ".run > * must exist").not.toBeNull();

    // The default --i is the cap: anything with no nth-child rule of its own
    // inherits the last ordered position rather than counting on forever.
    const fallback = /--i:\s*(\d+)/.exec(base![1]!);
    expect(fallback, ".run > * must set a default --i").not.toBeNull();
    const cap = Number(fallback![1]);

    // Every explicitly ordered position is within the cap.
    const ordered = [...src.matchAll(/\.run\s*>\s*\*:nth-child\((\d+)\)\s*\{\s*--i:\s*(\d+)/g)];
    expect(ordered.length).toBeGreaterThan(0);
    for (const [, , i] of ordered) expect(Number(i)).toBeLessThanOrEqual(cap);

    // And the longest a run can take is bounded: the cap's delay plus one
    // arrival. At 45ms and 400ms that is 625ms, which is the number that must
    // not quietly become a second and a half.
    const step = Number(/--step:\s*(\d+)ms/.exec(base![1]!)![1]);
    const dur = Number(/--dur-move:\s*(\d+)ms/.exec(read("tokens.css"))![1]);
    expect(cap * step + dur).toBeLessThan(800);
  });

  /*
   * `backwards`, never `both`.
   *
   * This is the one that would be found by hand only after somebody noticed a
   * garage card could not be pressed. An animation holding its final keyframe
   * outranks the cascade, so `both` would silently pin transform and kill the
   * press on exactly the surfaces that use a run.
   */
  it("releases transform when it lands, so the press still works", () => {
    const base = /\.run\s*>\s*\*\s*\{([^}]*)\}/s.exec(code(read("motion.css")))![1]!;
    expect(base).toContain("backwards");
    expect(base).not.toMatch(/\bboth\b/);
  });
});

describe("rule 5: motion is for change you caused", () => {
  /*
   * The press is a variable folded into a transform, not a transform of its
   * own -- because several of these controls already have a hover lift, and
   * two rules both writing `transform` means one of them is silently dropped.
   *
   * So: every hover that moves something must compose --press. A bare
   * `transform` on a :hover is the bug, and it is invisible without a mouse
   * held down on the exact element that has it.
   */
  it("every hover transform composes the press instead of replacing it", () => {
    const stray: string[] = [];

    for (const file of SHEETS) {
      const src = code(read(file));
      for (const [line, i] of src.split("\n").map((l, n) => [l, n + 1] as const)) {
        void line;
        void i;
      }
      // Rules whose selector mentions :hover, and whose body sets transform.
      for (const m of src.matchAll(/([^{}]*:hover[^{}]*)\{([^}]*)\}/g)) {
        const body = m[2]!;
        if (!/(?<!text-)transform\s*:/.test(body)) continue;
        if (body.includes("var(--press)")) continue;
        if (/transform\s*:\s*none/.test(body)) continue;
        stray.push(`${file}  ${m[1]!.trim()}`);
      }
    }

    expect(stray).toEqual([]);
  });

  it("the press is defined once, as a variable with a neutral default", () => {
    const src = code(read("motion.css"));
    // Default 1: an element that never matches :active is at its natural size.
    expect(/--press:\s*1\b/.test(src)).toBe(true);
    // And the pressed value is a shrink, not a grow -- a press goes INTO the
    // screen, which is the direction rules 2 and 3 leave free.
    const pressed = Number(/--press:\s*(0\.\d+)/.exec(src)![1]);
    expect(pressed).toBeLessThan(1);
    expect(pressed).toBeGreaterThan(0.95);
  });
});

describe("rule: nothing moves that you did not ask to move", () => {
  /*
   * No infinite animations. The app has no spinners, no pulsing, nothing
   * breathing in the corner of a screen you are trying to read.
   *
   * The race tower is content rather than chrome and is allowed its own
   * timing, but even it does not loop -- so this holds everywhere, which is
   * what makes it worth gating rather than describing.
   */
  it("no stylesheet loops an animation", () => {
    const stray: string[] = [];
    for (const file of SHEETS) {
      const src = code(read(file));
      for (const [line, i] of src.split("\n").map((l, n) => [l, n + 1] as const)) {
        if (/\binfinite\b/.test(line)) stray.push(`${file}:${i}  ${line.trim()}`);
      }
    }
    expect(stray).toEqual([]);
  });

  /*
   * Every animated surface answers prefers-reduced-motion.
   *
   * The failure this prevents is not a rough edge, it is a blank screen: an
   * animation with a fill holds its element at opacity 0 when it is switched
   * off, so a sheet that animates without a reduced-motion block hands the
   * person who asked for less movement a page with nothing on it.
   */
  it("every stylesheet that animates also says what happens without motion", () => {
    for (const file of SHEETS) {
      const src = code(read(file));
      if (!/animation:/.test(src)) continue;
      expect(
        src.includes("prefers-reduced-motion"),
        `${file} animates but never answers prefers-reduced-motion`,
      ).toBe(true);
    }
  });
});
