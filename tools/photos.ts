import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { CARS } from "@catalog/cars";

/**
 * Checks every car photo against the house standard. Run it before dropping a
 * new photo in rather than finding out in the UI:
 *
 *     npx tsx tools/photos.ts
 *
 * The standard, and where each number comes from -- all measured off the real
 * DOM, not read off the CSS:
 *
 *   RATIO 1.90. A photo is drawn into exactly two boxes. The card strip is a
 *   fixed 235x118 (ratio 1.958) and the modal hero is 448x236 (1.898) at any
 *   viewport wide enough to keep the spec sheet in two columns. Both use
 *   object-fit: cover, and cover crops whichever axis is in excess. Keeping the
 *   source NARROWER than both boxes is the whole point: then the excess is
 *   always height, so the crop eats sky and tarmac instead of the front and
 *   rear of the car. A 2:1 photo is wider than both boxes and gets its bumpers
 *   trimmed instead.
 *
 *   SIZE 1140x600. The hero is the binding box and it is widest, 542x236, at a
 *   620px viewport -- the moment the grid collapses to one column. At 2x that
 *   is 1084x472, so 1140x600 covers every box on a retina screen with a little
 *   left over. Below 480px viewport the hero gets narrow enough to crop sides
 *   again; that is a phone looking at a 470px-wide card layout and not worth
 *   sizing for.
 *
 *   FORMAT the extension has to match the actual bytes. This is not
 *   pedantry: four of the first six photos were JPEG or WebP named .png,
 *   which works only because browsers sniff the content type. The two that
 *   really were PNG were also the two worst offenders on size, because PNG is
 *   lossless and a photograph is the one thing it is bad at.
 */

const MIN_W = 1140;
const MIN_H = 600;
const RATIO_LO = 1.8;
const RATIO_HI = 1.95;
/** Anything past this for a ~1140x600 photo means it was saved as PNG. */
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

console.log(`standard: at least ${MIN_W}x${MIN_H}, ratio ${RATIO_LO}-${RATIO_HI}, extension matches the bytes\n`);
console.log("car                       file                        size        ratio  fmt   on disk  verdict");

let bad = 0;
for (const car of CARS) {
  if (!car.image) continue;
  const name = car.image.replace(/^\//, "");
  let buf: Buffer;
  try {
    buf = readFileSync(new URL(name, `file://${publicDir.replaceAll("\\", "/")}`));
  } catch {
    console.log(`  ${(car.id + " ").padEnd(24)} ${name.padEnd(27)} MISSING`);
    bad++;
    continue;
  }
  const p = probe(buf);
  if (!p) {
    console.log(`  ${(car.id + " ").padEnd(24)} ${name.padEnd(27)} UNRECOGNISED FORMAT`);
    bad++;
    continue;
  }
  const ext = EXT_ALIASES[name.split(".").pop()!] ?? name.split(".").pop()!;
  const kb = buf.length / 1024;
  const ratio = p.w / p.h;

  const faults: string[] = [];
  if (p.w < MIN_W || p.h < MIN_H) faults.push(`under ${MIN_W}x${MIN_H}`);
  if (ratio < RATIO_LO || ratio > RATIO_HI) faults.push(`ratio ${ratio.toFixed(2)}`);
  if (ext !== p.format) faults.push(`${p.format} named .${ext}`);
  if (kb > MAX_KB) faults.push(`${kb.toFixed(0)}KB`);
  if (faults.length) bad++;

  console.log(
    `  ${(car.id + " ").padEnd(24)} ${name.padEnd(27)} ${`${p.w}x${p.h}`.padEnd(11)} ${ratio.toFixed(3)}  ${p.format.padEnd(5)} .${ext.padEnd(7)} ${
      faults.length ? "FAIL  " + faults.join(", ") : "ok"
    }`,
  );
}

const shot = CARS.filter((c) => c.image).length;
console.log(`\n${shot} of ${CARS.length} cars have a photo; ${bad} need work.`);
