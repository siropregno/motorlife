import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

/**
 * The flows that only exist once a browser is involved.
 *
 *     npm run dev                       # in another terminal
 *     node tools/flows.mjs [port]       # default 5173
 *
 * The services under services/ are covered by vitest and that is where the
 * rules live -- what a repaint costs, who refuses what. None of it proves the
 * button is wired to the function, that the card behind the sheet repaints, or
 * that any of it reaches localStorage. This does, by driving the real app.
 *
 * It ASSERTS rather than screenshots. A screenshot needs a human to look at it,
 * and a check nobody runs is not a check; this exits non-zero and says which
 * step broke. Screenshots are still the right tool for "does it look right",
 * which is tools/shots.mjs.
 */

const PORT = process.argv[2] ?? "5173";
const failures = [];
let checks = 0;

function check(label, got, want) {
  checks++;
  const ok = got === want;
  if (!ok) failures.push(`${label}\n      wanted ${JSON.stringify(want)}\n      got    ${JSON.stringify(got)}`);
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${ok ? "" : ` -- got ${JSON.stringify(got)}`}`);
}

/** A garage with paint on one car, none on another, and money to spend. */
const SAVE = {
  version: 3,
  credits: 120_000,
  racesRun: 4,
  owned: [
    { id: "renault-12-tl", km: 214_000, color: "light-blue" },
    { id: "bmw-m3-e30", km: 293_800, color: "black" },
    { id: "chevrolet-chevy-250", km: 317_500 },
  ],
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const noise = [];
page.on("response", (r) => { if (r.status() >= 400) noise.push(`${r.status()} ${r.url()}`); });
page.on("console", (m) => { if (m.type() === "error") noise.push(`console: ${m.text()}`); });
page.on("pageerror", (e) => noise.push(`pageerror: ${e.message}`));

const wallet = () => page.locator(".wallet").innerText();
const card = (model) => page.locator(".car-card", { hasText: model });
const photo = (model) => card(model).locator(".card-car img").getAttribute("src");
const garage = async () => {
  await page.locator('.topnav-btn[aria-label="Garaje"]').click();
  await page.waitForSelector(".car-card");
};

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
  await page.evaluate((s) => localStorage.setItem("motorlife.save", JSON.stringify(s)), SAVE);
  await page.reload({ waitUntil: "networkidle" });
  await garage();

  console.log("\nthe garage sheet");
  await card("M3 E30").click();
  await page.waitForSelector("dialog.modal");
  check("left click opens the sheet", await page.locator(".modal-title h2").innerText(), "BMW M3 E30");
  // Icon-only buttons, so the accessible name is the ONLY name they have --
  // this check is the one that notices if a glyph ever ships without one.
  check(
    "it offers the three things you can do with a car you own",
    (await page.locator(".modal-acts .btn").evaluateAll((els) =>
      els.map((e) => e.getAttribute("aria-label")))).join(" | "),
    "Subirse al auto | Repintar | Vender",
  );

  check(
    "each action carries its glyph",
    await page.locator(".modal-acts .btn-icon").evaluateAll((els) => els.map((e) => new URL(e.src).pathname).join(" ")),
    "/car-key.png /paint-brush.png /sell.svg",
  );
  check(
    "and every one of them actually loaded",
    await page.locator(".modal-acts .btn-icon").evaluateAll((els) => els.every((e) => e.complete && e.naturalWidth > 0)),
    true,
  );

  console.log("\nthe paint shop");
  await page.locator('.modal-acts .btn[aria-label="Repintar"]').click();
  await page.waitForSelector("dialog.paint-modal");
  const pay = page.locator(".paint-pay");
  check(
    "it is its own dialog, over the sheet",
    await page.locator("dialog.modal:not(.paint-modal)").isVisible(),
    true,
  );
  check(
    "holding a photo and nothing about the machine",
    await page.locator("dialog.paint-modal .spec-list").count(),
    0,
  );
  check(
    "every colour is a dot, the current one marked and still clickable",
    await page.locator(".paint-dot").evaluateAll((els) =>
      els.map((e) => `${e.getAttribute("aria-label")}${e.disabled ? "*" : ""}`).join(" | ")),
    "Negro, el color actual | Rojo | Blanco | Amarillo",
  );
  check(
    "each dot is painted its own colour rather than a default",
    await page.locator(".paint-dot").evaluateAll((els) =>
      new Set(els.map((e) => getComputedStyle(e).backgroundColor)).size),
    4,
  );
  // The layout the row exists for: arrow hard left, dots on the centre of the
  // dialog, price hard right. Measured, because "centred" is the whole ask and
  // a flex row with space-between would pass every other check here.
  const laid = await page.evaluate(() => {
    const box = (s) => document.querySelector(s).getBoundingClientRect();
    const row = box(".paint-row");
    const back = box(".paint-back");
    const dots = box(".paint-swatches");
    const price = box(".paint-pay");
    const mid = (r) => r.left + r.width / 2;
    return {
      backIsLeftmost: back.left < dots.left && back.left - row.left < 24,
      priceIsRightmost: price.right > dots.right && row.right - price.right < 24,
      dotsCentred: Math.abs(mid(dots) - mid(row)) < 2,
    };
  });
  check("the arrow sits at the left edge", laid.backIsLeftmost, true);
  check("the price at the right", laid.priceIsRightmost, true);
  check("and the dots on the centre of the dialog", laid.dotsCentred, true);

  const walletBefore = await wallet();
  await page.locator('.paint-dot[aria-label="Amarillo"]').click();
  check("the photo previews the colour", await page.locator(".paint-hero img").getAttribute("src"), "/bmw-m3-e30-yellow.png");
  check("previewing is free", await wallet(), walletBefore);
  check("the price is the label and nothing else", await pay.innerText(), "5.700 CR");

  // Picking the colour it already is: allowed, but there is nothing to buy.
  await page.locator('.paint-dot[aria-label="Negro, el color actual"]').click();
  check("the current colour is selectable", await page.locator(".paint-hero img").getAttribute("src"), "/bmw-m3-e30-black.png");
  check("and cannot be paid for", await pay.evaluate((e) => e.disabled), true);
  await page.locator('.paint-dot[aria-label="Amarillo"]').click();
  check("picking a real change arms the price again", await pay.evaluate((e) => e.disabled), false);

  await pay.click();
  await page.waitForSelector("dialog.paint-modal", { state: "detached" });
  check("paying charges exactly that", await wallet(), "114.300CR");
  check("the sheet behind it kept the new colour", await page.locator(".modal-hero img").getAttribute("src"), "/bmw-m3-e30-yellow.png");
  await page.locator(".modal-x").click();
  await page.waitForSelector("dialog.modal", { state: "detached" });
  check("so does the card behind it", await photo("M3 E30"), "/bmw-m3-e30-yellow.png");

  await page.reload({ waitUntil: "networkidle" });
  await garage();
  check("and it survives a reload, so it reached the save", await photo("M3 E30"), "/bmw-m3-e30-yellow.png");

  console.log("\nwhat the sheet refuses");
  await card("Chevy 250").click();
  await page.waitForSelector("dialog.modal");
  check(
    "a car that comes in one colour cannot be repainted",
    await page.locator(".modal-acts .btn").evaluateAll((els) =>
      els.map((e) => `${e.getAttribute("aria-label")}${e.disabled ? "*" : ""}`).join(" | ")),
    "Subirse al auto | Repintar* | Vender",
  );

  console.log("\nselling");
  await page.locator('.modal-acts .btn[aria-label="Vender"]').click();
  await page.waitForSelector("dialog.confirm");
  check("it asks, in words, naming the car", await page.locator(".confirm-q").innerText(), "¿Vender tu Chevrolet Chevy 250?");
  check(
    "and says what you get and that it is final",
    await page.locator(".confirm-detail").innerText(),
    "Te pagan 7.300 cr. No se puede deshacer.",
  );
  check(
    "with the way out focused, so a stray Enter does not sell",
    await page.evaluate(() => document.activeElement.getAttribute("aria-label")),
    "Volver",
  );
  check(
    "and the answers are a back arrow and one word",
    await page.locator(".confirm-acts .btn").evaluateAll((els) =>
      els.map((e) => e.getAttribute("aria-label") ?? e.textContent.trim()).join(" | ")),
    "Volver | Vender",
  );
  check("nothing sold while the question is up", await wallet(), "114.300CR");
  // The sheet is still there behind it: you can see the car you are answering about.
  check("the car is still on screen behind the question", await page.locator("dialog.modal:not(.confirm)").isVisible(), true);

  await page.locator(".confirm-acts .btn").first().click();
  await page.waitForSelector("dialog.confirm", { state: "detached" });
  check("No keeps the car", await page.locator(".car-card").count(), 3);

  await page.locator('.modal-acts .btn[aria-label="Vender"]').click();
  await page.waitForSelector("dialog.confirm");
  await page.locator(".confirm-acts .btn.danger").click();
  await page.waitForSelector("dialog.confirm", { state: "detached" });
  check("yes sells", await wallet(), "121.600CR");
  check("and the car is gone", await page.locator(".car-card").count(), 2);
  check("and the sheet behind it closed with the car", await page.locator("dialog.modal").count(), 0);

  console.log("\nthe shop sheet, which shares the component");
  await page.locator('.topnav-btn[aria-label="Concesionaria"]').click();
  await page.getByRole("button", { name: /Concesionarios/ }).click();
  await page.getByRole("button", { name: /Pacheco/ }).click();
  await page.waitForSelector(".shop-item");
  await card("Chevy 250").click();
  await page.waitForSelector("dialog.modal");
  check("it still shows a price", await page.locator(".modal-price").innerText(), "12.200 cr");
  await page.locator(".modal-foot .btn").last().click();
  await page.waitForSelector("dialog.modal", { state: "detached" });
  check("and still buys", await wallet(), "109.400CR");

  console.log("\nthe right-click menu");
  await garage();
  await card("M3 E30").click({ button: "right" });
  await page.waitForSelector(".ctx");
  check(
    "every row has a glyph, left of the word",
    await page.locator(".ctx-item").evaluateAll((els) =>
      els.map((e) => {
        const img = e.querySelector(".ctx-icon");
        const label = e.querySelector(".ctx-label");
        const before = img && label && img.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING;
        return `${label.textContent}:${img ? new URL(img.src).pathname.replace(/^\//, "") : "NONE"}${before ? "" : "!ORDER"}`;
      }).join(" ")),
    "Subirse al auto:car-key.png Repintar:paint-brush.png Vender:sell.svg",
  );
  // Repintar from the menu lands on the colours rather than on the sheet you
  // would then have to click Repintar in again.
  await page.locator(".ctx-item", { hasText: "Repintar" }).click();
  await page.waitForSelector("dialog.paint-modal");
  check("the menu's Repintar opens the paint shop directly", await page.locator(".paint-dot").count(), 4);
  check(
    "with no spec sheet behind it, since it did not go through one",
    await page.locator("dialog.modal:not(.paint-modal)").count(),
    0,
  );
  await page.locator(".paint-back").click();
  await page.waitForSelector("dialog.paint-modal", { state: "detached" });

  console.log("\nthe menu sells the same way the sheet does");
  await card("M3 E30").click({ button: "right" });
  await page.waitForSelector(".ctx");
  await page.locator(".ctx-item", { hasText: "Vender" }).click();
  await page.waitForSelector("dialog.confirm");
  check("one click on the row, one question", await page.locator(".confirm-q").innerText(), "¿Vender tu BMW M3 E30?");
  await page.locator(".confirm-acts .btn").first().click();
  await page.waitForSelector("dialog.confirm", { state: "detached" });
  // Three, not two: the shop section above bought the Chevy 250 back.
  check("and No still keeps it", await page.locator(".car-card").count(), 3);

  check("nothing 404ed and nothing threw", noise.join(", "), "");
} finally {
  await browser.close();
}

console.log(`\n${checks - failures.length}/${checks} checks passed.`);
if (failures.length) {
  console.log(`\n${failures.length} failed:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
