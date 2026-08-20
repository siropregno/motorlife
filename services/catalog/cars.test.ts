import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { CARS, carById } from "./cars";

/*
 * Asset wiring is deterministic, so it gets a gate test rather than an eye.
 * A logo path that does not resolve renders as a broken <img> on the card and
 * nothing in the type system notices -- `logo` is just a string.
 *
 * The four checks, in the order they catch things:
 *   1. every path a car names is a file that is actually in public/, matched
 *      case-sensitively -- see below
 *   2. paths are lowercase, because that is the only way the case rule stays
 *      easy to follow rather than something you have to remember per file
 *   3. logos follow the <marque>-logo.png convention, so a file dropped in as
 *      logo-honda.png is caught at the point it is wired rather than in the UI
 *   4. a marque whose logo file exists uses it on every one of its cars, which
 *      is the case of a logo sitting in public/ that nobody ever referenced
 *
 * On the case-sensitivity: this is developed on Windows, where fs.existsSync
 * happily resolves ford-taunus-2300gt.png to a file named ...2300GT.png. Any
 * Linux host serving the build would 404 it. So the check reads the directory
 * and compares names exactly rather than asking the filesystem, which makes
 * the test mean the same thing on both.
 */

/** Vite serves public/ at the site root, so a "/x.png" is public/x.png. */
const publicDir = fileURLToPath(new URL("../../public/", import.meta.url));
const files = new Set(
  readdirSync(publicDir, { recursive: true, encoding: "utf8" }).map((f) =>
    f.replaceAll("\\", "/"),
  ),
);
const inPublic = (p: string) => files.has(p.replace(/^\//, ""));

/** The marque's slug in a filename: "Volkswagen" -> "volkswagen". */
const slug = (make: string) => make.toLowerCase().replace(/[^a-z0-9]+/g, "-");

describe("catalogue assets", () => {
  it("points every logo and photo at a file that exists", () => {
    const missing = CARS.flatMap((c) =>
      [c.logo, c.image]
        .filter((p): p is string => typeof p === "string")
        .filter((p) => !inPublic(p))
        .map((p) => `${c.id} -> ${p}`),
    );
    expect(missing).toEqual([]);
  });

  it("keeps every asset path lowercase", () => {
    const shouty = CARS.flatMap((c) =>
      [c.logo, c.image]
        .filter((p): p is string => typeof p === "string")
        .filter((p) => p !== p.toLowerCase())
        .map((p) => `${c.id} -> ${p}`),
    );
    expect(shouty).toEqual([]);
  });

  it("names logos <marque>-logo.png", () => {
    const offenders = CARS.filter((c) => c.logo)
      .filter((c) => !/^\/[a-z0-9-]+-logo\.png$/.test(c.logo as string))
      .map((c) => `${c.id} -> ${c.logo}`);
    expect(offenders).toEqual([]);
  });

  it("wires a marque's logo to every car of that marque once the file is there", () => {
    const unwired = CARS.filter(
      (c) => !c.logo && inPublic(`/${slug(c.make)}-logo.png`),
    ).map((c) => `${c.id} has no logo but /${slug(c.make)}-logo.png exists`);
    expect(unwired).toEqual([]);
  });
});

describe("catalogue integrity", () => {
  it("has no duplicate ids", () => {
    const seen = new Set<string>();
    const dupes = CARS.filter((c) => (seen.has(c.id) ? true : (seen.add(c.id), false)));
    expect(dupes.map((c) => c.id)).toEqual([]);
  });

  it("looks a car up by id", () => {
    expect(carById("ferrari-f40")?.model).toBe("F40");
    expect(carById("honda-nsx")?.model).toBe("NSX");
    expect(carById("nothing-here")).toBeUndefined();
  });
});
