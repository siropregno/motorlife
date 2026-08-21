import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { CARS } from "@catalog/cars";

/**
 * Checks every car photo against the house standard. Run it before dropping a
 * new photo in rather than finding out in the UI:
 *
 *     npx tsx tools/photos.ts
 *
 * 1376x768 -- 16:9 -- Siro's call, matching the colour renders.
 *
 * A photo is drawn into exactly two boxes, both object-fit: cover, both
 * measured off the real DOM rather than read off the CSS:
 *
 *     card strip           205x118   ratio 1.737   fixed, never changes
 *     modal hero           448x252   ratio 1.778   any viewport wide enough
 *                                                  to keep two columns
 *     modal hero, widest   542x252   ratio 2.151   at a 620px viewport, the
 *                                                  moment the grid collapses
 *
 * 16:9 fits both far better than the 3:2 it replaced. The card strip is
 * already 1.737, so a 16:9 source loses 2.3% off the WIDTH instead of the
 * 24.7% of height 3:2 was costing -- the headroom rule that used to matter
 * here is gone, and the card shows very nearly the frame you cropped.
 *
 * The hero had to move with it: at 300 tall it was 1.493, and cover took 16%
 * off the width of a 16:9 photo -- the nose and the tail, which is the one
 * crop a car photo cannot afford. 252 is 448 / (16/9), so it now shows the
 * whole frame.
 *
 * On resolution, 1376x768 clears the widest hero at 2x (1084x504) and the card
 * strip (410x236) several times over.
 *
 * COLOURS. A car with `colors` has one file per colour, named
 * `<car-id>-<colour>.png`, and no `image` at all. This walks those too --
 * they are the photos that actually reach the screen.
 *
 * Never upscale to hit the number. Enlarging a small source adds no detail,
 * just bytes and a softer image. If a source is too small, get a better one.
 *
 * FORMAT: the extension has to match the actual bytes. Not pedantry -- four
 * of the first six photos were JPEG or WebP named .png, which works only
 * because browsers sniff content type. The two that really were PNG were also
 * the two worst on bytes-per-pixel, because PNG is lossless and a photograph
 * is the one thing it is bad at. WebP at about q82, or JPEG if the tool to
 * hand cannot write WebP.
 */

const WIDTH = 1376;
const HEIGHT = 768;
/** A rounding of 16:9 either way, not a licence to drift. */
const RATIO_LO = 1.77;
const RATIO_HI = 1.80;
/** Anything past this at 1376x768 means it was saved as PNG. */
const MAX_KB = 400;

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));

interface Probe {
  format: string;
  w: number;
  h: number;
}

/** Read the dimensions straight out of the header. No image library needed. */
function probe(buf: Buffer): Probe | null {
  if (buf.readUInt32BE(0) === 0x89504e47) {
    return { format: "png", w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    // Walk the marker segments to the frame header, which is the only place
    // a JPEG states its size.
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1]!;
      // SOF0..SOF15, skipping the four that are not frame headers
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { format: "jpg", h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return { format: "jpg", w: 0, h: 0 };
  }
  if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") {
    const chunk = buf.slice(12, 16).toString("ascii");
    if (chunk === "VP8X") return { format: "webp", w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (chunk === "VP8 ") return { format: "webp", w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = buf.readUInt32LE(21);
      return { format: "webp", w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
    return { format: "webp", w: 0, h: 0 };
  }
  return null;
}

const EXT_ALIASES: Record<string, string> = { jpeg: "jpg" };

console.log(
  `standard: ${WIDTH}x${HEIGHT} (16:9), extension matches the bytes, under ${MAX_KB}KB.\n` +
    `the hero shows the whole frame; the card strip trims 2% off the width.\n`,
);
console.log("car                       file                            size        ratio  fmt   on disk  verdict");

/**
 * Every photo that can reach a screen. A car with `colors` has one file per
 * colour and no `image` at all, and those are the ones players actually see --
 * walking `image` alone checked the files nothing renders.
 */
const photos = CARS.flatMap((car) =>
  (car.colors?.length
    ? car.colors.map((c) => `/${car.id}-${c}.png`)
    : car.image
      ? [car.image]
      : []
  ).map((path) => ({ car, path })),
);

let bad = 0;
let soft = 0;
for (const { car, path } of photos) {
  const name = path.replace(/^\//, "");
  let buf: Buffer;
  try {
    buf = readFileSync(new URL(name, `file://${publicDir.replaceAll("\\", "/")}`));
  } catch {
    console.log(`  ${(car.id + " ").padEnd(24)} ${name.padEnd(31)} MISSING`);
    bad++;
    continue;
  }
  const p = probe(buf);
  if (!p) {
    console.log(`  ${(car.id + " ").padEnd(24)} ${name.padEnd(31)} UNRECOGNISED FORMAT`);
    bad++;
    continue;
  }
  const ext = EXT_ALIASES[name.split(".").pop()!] ?? name.split(".").pop()!;
  const kb = buf.length / 1024;
  const ratio = p.w / p.h;

  const faults: string[] = [];
  const notes: string[] = [];
  if (p.w !== WIDTH || p.h !== HEIGHT) {
    // Right shape, wrong scale is a resize. Wrong shape is a re-crop, and if
    // the source cannot reach the standard after that crop it needs replacing.
    const reachable = Math.min(p.w, Math.round(p.h * (WIDTH / HEIGHT))) >= WIDTH;
    faults.push(
      reachable ? `resize to ${WIDTH}x${HEIGHT}` : `too small, crops to at most ${Math.min(p.w, Math.round(p.h * (WIDTH / HEIGHT)))}px wide`,
    );
  }
  if (ratio < RATIO_LO || ratio > RATIO_HI) faults.push(`ratio ${ratio.toFixed(2)}, not 16:9`);
  if (ext !== p.format) faults.push(`${p.format} named .${ext}`);
  if (kb > MAX_KB) faults.push(`${kb.toFixed(0)}KB`);
  if (faults.length) bad++;
  else if (notes.length) soft++;

  const verdict = faults.length
    ? "FAIL  " + faults.join(", ")
    : notes.length
      ? "note  " + notes.join(", ")
      : "ok";
  console.log(
    `  ${(car.id + " ").padEnd(24)} ${name.padEnd(31)} ${`${p.w}x${p.h}`.padEnd(11)} ${ratio.toFixed(3)}  ${p.format.padEnd(5)} .${ext.padEnd(7)} ${verdict}`,
  );
}

const shot = CARS.filter((c) => c.image || c.colors?.length).length;
console.log(
  `\n${photos.length} photos across ${shot} of ${CARS.length} cars; ${bad} need work` +
    (soft ? `, ${soft} would be sharper with more pixels` : "") +
    ".",
);
