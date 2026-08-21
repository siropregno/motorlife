import { readFileSync, writeFileSync, statSync } from "node:fs";
import { basename, extname, dirname, join } from "node:path";
import { chromium } from "playwright";

/**
 * Brings an image to the house standard: 1376x768, 16:9, WebP.
 *
 *     node tools/shrink.mjs public/marketplace.png [more.png ...]
 *
 * tools/photos.ts states the standard and FAILS the files that miss it. This
 * is the other half -- the thing that fixes them -- because "resize to
 * 1376x768" as a verdict with no tool behind it is a chore that never gets
 * done. Same numbers, imported from nowhere: they are repeated here because
 * photos.ts is a checker for cars and this is a converter for any image, and
 * a shared constant would tie a tsx script to a plain-node one for two ints.
 *
 * WHY CHROMIUM. The repo has no image library and does not need one: Playwright
 * is already a devDependency for tools/shots.mjs, and a browser is a very good
 * resizer that also happens to be the exact decoder that will show these files
 * to a player. No sharp, no ImageMagick on PATH, no native build step.
 *
 * The page is served from a fake https origin through page.route rather than
 * loaded over file://, because a file:// image drawn into a canvas taints it
 * and toDataURL then throws SecurityError. Same-origin http does not taint.
 *
 * Cover-crops to 16:9 when the source is a different shape, which is what
 * background-size: cover would do to it in the browser anyway -- better to pay
 * for it once here than to ship the pixels and crop them on every paint.
 *
 * Never upscales. A source smaller than the standard is a source to replace,
 * and enlarging it only adds bytes; the file is left alone and reported.
 */

const WIDTH = 1376;
const HEIGHT = 768;
/** photos.ts fails anything over 400KB. q82 lands a photo well under it. */
const QUALITY = 0.82;

const args = process.argv.slice(2);
if (!args.length) {
  console.error("usage: node tools/shrink.mjs <image> [image ...]");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();

// One route serves the page and every source file, all from the same origin.
const served = new Map();
await page.route("https://shrink.local/**", (route) => {
  const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
  if (name === "") return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>shrink</title>" });
  const body = served.get(name);
  if (!body) return route.fulfill({ status: 404, body: "" });
  return route.fulfill({ contentType: "application/octet-stream", body });
});
await page.goto("https://shrink.local/");

console.log(`standard: ${WIDTH}x${HEIGHT} (16:9), webp q${QUALITY * 100}\n`);

let written = 0;
for (const src of args) {
  const name = basename(src);
  const before = statSync(src).size;
  served.set(name, readFileSync(src));

  const result = await page.evaluate(
    async ({ name, w, h, q }) => {
      const img = new Image();
      img.src = `https://shrink.local/${encodeURIComponent(name)}`;
      await img.decode();
      if (img.naturalWidth < w || img.naturalHeight < h) {
        return { tooSmall: true, w: img.naturalWidth, h: img.naturalHeight };
      }
      // Cover: take the biggest centred rectangle of the target ratio.
      const ratio = w / h;
      const sw = Math.min(img.naturalWidth, Math.round(img.naturalHeight * ratio));
      const sh = Math.min(img.naturalHeight, Math.round(img.naturalWidth / ratio));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
      return {
        source: { w: img.naturalWidth, h: img.naturalHeight },
        cropped: sw !== img.naturalWidth || sh !== img.naturalHeight,
        dataUrl: canvas.toDataURL("image/webp", q),
      };
    },
    { name, w: WIDTH, h: HEIGHT, q: QUALITY },
  );
  served.delete(name);

  if (result.tooSmall) {
    console.log(`  ${name.padEnd(28)} ${`${result.w}x${result.h}`.padEnd(11)} SKIPPED, smaller than the standard`);
    continue;
  }
  if (!result.dataUrl.startsWith("data:image/webp")) {
    console.log(`  ${name.padEnd(28)} FAILED, chromium did not encode webp`);
    continue;
  }

  const bytes = Buffer.from(result.dataUrl.split(",")[1], "base64");
  const out = join(dirname(src), basename(src, extname(src)) + ".webp");
  writeFileSync(out, bytes);
  written++;
  const from = `${result.source.w}x${result.source.h}`;
  console.log(
    `  ${name.padEnd(28)} ${from.padEnd(11)} -> ${WIDTH}x${HEIGHT}  ` +
      `${(before / 1024 / 1024).toFixed(1)}MB -> ${(bytes.length / 1024).toFixed(0)}KB  ` +
      `${basename(out)}${result.cropped ? "  (cropped to 16:9)" : ""}`,
  );
}

await browser.close();
console.log(`\n${written} of ${args.length} written. Delete the sources once the new files are wired up.`);
