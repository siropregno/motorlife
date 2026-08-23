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

/**
 * Wait for a section change to finish moving.
 *
 * Waits for the STATE rather than for a duration: .sliding is on the stage for
 * exactly as long as the transition runs, so this stays correct if the timing
 * is ever retuned. It was a pile of waitForTimeout(320) calls, every one of
 * which silently became too short the moment the slide went from 260ms to 340.
 */
const settled = () =>
  page.waitForFunction(() => !document.querySelector(".stage.sliding"), null, { timeout: 5000 });

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
    "it offers the four things you can do with a car you own",
    (await page.locator(".modal-acts .btn").evaluateAll((els) =>
      els.map((e) => e.getAttribute("aria-label")))).join(" | "),
    "Subirse al auto | Taller | Repintar | Vender",
  );

  check(
    "each action carries its glyph",
    await page.locator(".modal-acts .btn-icon").evaluateAll((els) => els.map((e) => new URL(e.src).pathname).join(" ")),
    "/car-key.png /wrench.png /paint-brush.png /icon-shop.png",
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
  check("the photo previews the colour", await page.locator(".paint-hero img").getAttribute("src"), "/bmw-m3-e30-yellow.webp");
  check("previewing is free", await wallet(), walletBefore);
  check("the price is the label and nothing else", await pay.innerText(), "5.700 CR");

  // Picking the colour it already is: allowed, but there is nothing to buy.
  await page.locator('.paint-dot[aria-label="Negro, el color actual"]').click();
  check("the current colour is selectable", await page.locator(".paint-hero img").getAttribute("src"), "/bmw-m3-e30-black.webp");
  check("and cannot be paid for", await pay.evaluate((e) => e.disabled), true);
  await page.locator('.paint-dot[aria-label="Amarillo"]').click();
  check("picking a real change arms the price again", await pay.evaluate((e) => e.disabled), false);

  await pay.click();
  await page.waitForSelector("dialog.paint-modal", { state: "detached" });
  check("paying charges exactly that", await wallet(), "114.300CR");
  check("the sheet behind it kept the new colour", await page.locator(".modal-hero img").getAttribute("src"), "/bmw-m3-e30-yellow.webp");
  await page.locator(".modal-x").click();
  await page.waitForSelector("dialog.modal", { state: "detached" });
  check("so does the card behind it", await photo("M3 E30"), "/bmw-m3-e30-yellow.webp");

  await page.reload({ waitUntil: "networkidle" });
  await garage();
  check("and it survives a reload, so it reached the save", await photo("M3 E30"), "/bmw-m3-e30-yellow.webp");

  console.log("\nwhat the sheet refuses");
  await card("Chevy 250").click();
  await page.waitForSelector("dialog.modal");
  check(
    "a car that comes in one colour cannot be repainted",
    await page.locator(".modal-acts .btn").evaluateAll((els) =>
      els.map((e) => `${e.getAttribute("aria-label")}${e.disabled ? "*" : ""}`).join(" | ")),
    // Taller carries no star: every car can be worked on, and the one with
    // nothing fitted is exactly the one the workshop is for.
    "Subirse al auto | Taller | Repintar* | Vender",
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
        const icon = e.querySelector(".ctx-icon");
        const label = e.querySelector(".ctx-label");
        const before = icon && label && icon.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING;
        const name = icon ? new URL(icon.src).pathname.replace(/^\//, "") : "NONE";
        return `${label.textContent}:${name}${before ? "" : "!ORDER"}`;
      }).join(" ")),
    "Subirse al auto:car-key.png Llevar al taller:wrench.png Repintar:paint-brush.png Vender:icon-shop.png",
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

  /*
   * The workshop.
   *
   * A section rather than a dialog, so the checks are about NAVIGATION as much
   * as about money: getting there by the tab, getting there by naming a car,
   * and the ficha previewing the outcome before anything is paid for.
   *
   * Its own save, because fitting parts moves the wallet and every check above
   * pins totals. Two cars so the picker exists.
   */
  console.log("\nthe workshop");
  await page.evaluate((s) => localStorage.setItem("motorlife.save", JSON.stringify(s)), {
    version: 3,
    credits: 900_000,
    racesRun: 3,
    owned: [
      { id: "renault-12-tl", km: 214_000, color: "light-blue" },
      { id: "bmw-m3-e30", km: 90_000, color: "black" },
    ],
  });
  await page.reload({ waitUntil: "networkidle" });
  await garage();

  // Reached from a card by name, which is the path that has to carry WHICH car
  // across a section change -- the tab alone would open on the car you drive.
  await card("M3 E30").click({ button: "right" });
  await page.waitForSelector(".ctx");
  await page.locator(".ctx-item", { hasText: "Llevar al taller" }).click();
  await page.waitForSelector(".workshop-stage");
  await settled();

  // The title carries the model, the year and the class badge. Only the model
  // is the answer to "which car is on the ramp".
  const onRamp = () =>
    page.locator(".workshop-name h2").first().innerText()
      .then((t) => t.split("\n")[0].trim());
  check(
    "Llevar al taller opens the workshop on THAT car, not the one you drive",
    await onRamp(),
    "M3 E30",
  );
  check(
    "and the nav says you are in the workshop",
    await page.locator('.topnav-btn[aria-label="Taller"]').getAttribute("aria-current"),
    "page",
  );

  /*
   * The top level: four parts plus the engine, each a tile. The engine is last
   * and behind a separator, because it is the only one that does not make the
   * car better than the factory made it.
   */
  check("four parts and the engine", await page.locator(".workshop-tile").count(), 5);
  check(
    "every tile drew its glyph rather than 404ing to an empty square",
    await page.locator(".workshop-tile .btn-icon").evaluateAll((els) =>
      els.every((e) => e.complete && e.naturalWidth > 0)),
    true,
  );
  check(
    "and nothing is fitted, so every part wears the factory colour",
    await page.locator(".workshop-tile").evaluateAll((els) =>
      els.slice(0, 4).every((e) => e.classList.contains("stock"))),
    true,
  );

  /*
   * Picking a part turns the same strip into that part's ladder. Four tiers --
   * stock plus the three you can buy -- in one row, so the whole decision is
   * visible without opening anything.
   */
  await page.locator('.workshop-tile[aria-label^="Turbo"]').click();
  await page.waitForTimeout(150);
  check(
    "opening a part names it",
    await page.locator(".workshop-bar-head h3").innerText(),
    "TURBO",
  );
  check("and lays out its four tiers", await page.locator(".workshop-tile").count(), 4);
  check(
    "coloured as a ladder: factory, then the three you can buy",
    await page.locator(".workshop-tile").evaluateAll((els) =>
      els.map((e) => ["stock", "street", "sport", "racing"].find((c) => e.classList.contains(c))).join(" ")),
    "stock street sport racing",
  );
  check(
    "with the factory one marked as what the car has",
    await page.locator(".workshop-tile.on").count(),
    1,
  );

  /*
   * THE check this screen exists for: the ficha says what the car WOULD be
   * before any money moves, and says it in colour -- green for a figure that
   * improves, red for one that gets worse.
   */
  const figure = (name) =>
    page.locator(".workshop-specs .spec-row", { hasText: name }).locator(".spec-v");
  const restingPower = await figure("Potencia").innerText();
  await page.locator(".workshop-tile").last().hover();
  await page.waitForFunction(
    (was) => document.querySelector(".workshop-specs .spec-v")?.textContent !== was,
    restingPower,
  );
  check(
    "hovering a tier shows the power you would end up with",
    (await figure("Potencia").innerText()) !== restingPower,
    true,
  );
  check(
    "in green, because more power is an improvement",
    await figure("Potencia").evaluate((e) => e.classList.contains("up")),
    true,
  );
  check(
    "and it says what it is coming from",
    /de \d+ CV/.test(await figure("Potencia").innerText()),
    true,
  );
  check(
    "top speed moves with it",
    await figure("Velocidad").evaluate((e) => e.classList.contains("up")),
    true,
  );
  /*
   * 0-100 in SECONDS: fewer is better, so a turbo has to paint it green even
   * though the number went DOWN. Taking this from the figure's own direction
   * rather than from the sign of the change is the whole reason `better` is a
   * parameter on the component.
   */
  /*
   * By index, not by text: "0–100" uses an en dash and matching on "0" alone
   * hits every row with a zero in it -- the top speed, the weight, the
   * odometer. The order of the ficha is the contract here, and it is the
   * third row.
   */
  check(
    "a quicker 0-100 is green even though the number falls",
    await page.locator(".workshop-specs .spec-row").nth(2).locator(".spec-v")
      .evaluate((e) => e.classList.contains("up")),
    true,
  );
  check(
    "a turbo leaves grip alone, so that row stays uncoloured",
    await figure("Agarre").evaluate((e) => e.className.trim()),
    "spec-v",
  );
  check(
    "the class badge previews too, and marks itself as a preview",
    await page.locator(".workshop-klass").evaluate((e) => e.classList.contains("preview")),
    true,
  );
  check("and nothing was charged for looking", await wallet(), "900.000CR");

  /*
   * Clicking a tile PICKS; only the price button pays. That split is what lets
   * you try all four tiers and read the consequence of each one for free.
   */
  await page.locator(".workshop-tile").last().click();
  await page.waitForTimeout(150);
  check("picking a tier is still free", await wallet(), "900.000CR");
  check(
    "and the pick survives the cursor leaving, marked as not yet paid for",
    await page.locator(".workshop-tile.picked").count(),
    1,
  );
  /*
   * The value and whatever aside follows it come back from innerText as one
   * string with no line break between them. Two asides exist: "▲ de 194 CV"
   * while previewing, and "de fábrica 194" once the part is on the car. The
   * value is everything before either.
   */
  const valueOf = (t) => t.split(/[▲▼]|de fábrica/)[0].trim();
  const promised = valueOf(await figure("Potencia").innerText());

  await page.locator(".workshop-pay").click();
  await page.waitForFunction(() => document.querySelectorAll(".workshop-tile.picked").length === 0);
  check("the price button is what spends the money", (await wallet()) !== "900.000CR", true);
  check(
    "the tier is now the one on the car",
    await page.locator(".workshop-tile.on").evaluate((e) => e.classList.contains("racing")),
    true,
  );
  check(
    "and the power the preview promised is the power you got",
    valueOf(await figure("Potencia").innerText()),
    promised,
  );

  const walletAfterTurbo = await wallet();
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('.topnav-btn[aria-label="Taller"]').click();
  await page.waitForSelector(".workshop-stage");
  await settled();
  check("and it survived a reload, so it reached the save", await wallet(), walletAfterTurbo);
  /*
   * The TAB opens on the car you are driving, which is the R12 -- not the M3
   * that was on the ramp last visit. A car left on the ramp across a section
   * change would be the wrong car quietly taking your money.
   */
  check(
    "the tab opens on the car you are in, not the one left on the ramp",
    await onRamp(),
    "R12 TL",
  );

  /*
   * A tier you cannot afford is still selectable. Greying it out would hide
   * the two things you came to find out -- what it costs and what it would do
   * to the car -- behind the fact that you are short today.
   */
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("motorlife.save"));
    s.credits = 300;
    localStorage.setItem("motorlife.save", JSON.stringify(s));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('.topnav-btn[aria-label="Taller"]').click();
  await page.waitForSelector(".workshop-stage");
  await settled();
  await page.locator('.workshop-tile[aria-label^="Turbo"]').click();
  await page.waitForTimeout(150);
  check(
    "with almost no money, every tier is still enabled",
    await page.locator(".workshop-tile").evaluateAll((els) => els.filter((e) => e.disabled).length),
    0,
  );
  await page.locator(".workshop-tile").last().click();
  await page.waitForTimeout(200);
  check(
    "and the button says how much you are short rather than going dead quietly",
    /^faltan [\d.]+ cr$/i.test(await page.locator(".workshop-pay").innerText()),
    true,
  );
  check(
    "the ficha still previews what it would do",
    await figure("Potencia").evaluate((e) => e.classList.contains("up")),
    true,
  );

  // Put the money back for the engine checks below.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("motorlife.save"));
    s.credits = 900000;
    localStorage.setItem("motorlife.save", JSON.stringify(s));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('.topnav-btn[aria-label="Taller"]').click();
  await page.waitForSelector(".workshop-stage");
  await settled();

  /*
   * The engine, which is not a part: it has no tiers, and what it does is put
   * back what the kilometres took rather than add anything.
   */
  await page.locator('.workshop-tile[aria-label^="Motor"]').click();
  await page.waitForTimeout(150);
  check("the engine opens on its own", await page.locator(".workshop-bar-head h3").innerText(), "MOTOR");
  check(
    "a car with 214.000 km is offered a rebuild, with a price on it",
    /^[\d.]+ cr$/i.test(await page.locator(".workshop-pay").innerText()),
    true,
  );
  check(
    "and says how long it has been since the last one",
    /desde la última rectificada/i.test(await page.locator(".workshop-wear-note").innerText()),
    true,
  );
  await page.locator(".workshop-pay").click();
  await page.waitForTimeout(300);
  check(
    "rebuilding it leaves nothing to rebuild",
    await page.locator('.workshop-tile[aria-label^="Motor"]').evaluate((e) =>
      e.classList.contains("worn")),
    false,
  );
  check(
    "and the odometer is untouched -- a rebuild is not a way to clock a car",
    (await page.locator(".workshop-specs .spec-row", { hasText: "Kilómetros" })
      .locator(".spec-v").innerText()).startsWith("214.000 km"),
    true,
  );

  /*
   * Back in the garage, the modified car says so from across the grid.
   *
   * settled() is not optional here. A screen on its way out stays mounted for
   * the length of the slide, and the workshop it is leaving renders a CarCard
   * of its own -- so counting cards mid-slide counts the ramp's car twice.
   */
  await garage();
  await settled();
  check(
    "the garage marks the car that has parts on it, and only that one",
    await page.locator(".car-card").evaluateAll((els) =>
      els.map((e) => `${e.querySelector(".card-title-bold").textContent.split("'")[0].trim()}:${e.querySelector(".card-tuned") ? "*" : "-"}`).join(" ")),
    "R12 TL:- M3 E30:*",
  );
  /*
   * The card reads what the car MAKES, not what the factory said.
   *
   * 194 CV stock; a racing turbo is 1.55x and 90.000 km of engine wear takes a
   * little back, which lands on 283. Pinned exactly rather than "more than
   * stock", because a card quietly showing catalogue power on a modified car
   * would pass any looser check -- and that is the bug worth catching.
   */
  check(
    "and its power reads as what it makes now, not what the factory said",
    (await card("M3 E30").locator(".card-text-light").innerText()).split(" /")[0],
    "283 CV",
  );

  /*
   * The collector's mark, on its own save.
   *
   * It runs last and reseeds rather than joining SAVE above, because every
   * check up to here counts cards and pins wallet totals -- adding a fourth car
   * to the garage would move all of them for a reason that has nothing to do
   * with what they test.
   *
   * The km are not round numbers picked to look shed-kept: they are 5% of
   * expectedKm(year), which is what conditionOf() calls "De colección". Pinning
   * the band here rather than the number means the mark follows the rule if the
   * rule ever moves.
   */
  console.log("\nthe collector's mark");
  await page.evaluate((s) => localStorage.setItem("motorlife.save", JSON.stringify(s)), {
    version: 3,
    credits: 400_000,
    racesRun: 6,
    owned: [
      { id: "bmw-m3-e30", km: 8_600, color: "white" }, // 5% of expected -> survivor
      { id: "chevrolet-chevy-250", km: 317_500 }, // hard used -> nothing
    ],
  });
  await page.reload({ waitUntil: "networkidle" });
  await garage();

  check(
    "it marks the shed-kept car and only that one",
    await page.locator(".car-card").evaluateAll((els) =>
      els.map((e) => `${e.querySelector(".card-title-bold").textContent.split("'")[0].trim()}:${e.querySelector(".card-shiny") ? "*" : "-"}`).join(" ")),
    "M3 E30:* Chevy 250:-",
  );
  check(
    "the glyph loaded rather than 404ing to an empty box",
    await page.locator(".card-shiny img").evaluateAll((els) =>
      els.every((e) => e.complete && e.naturalWidth > 0)),
    true,
  );
  // A purple square is not a word. In the garage there is no price line saying
  // "De colección", so without this the mark means nothing to a screen reader.
  check(
    "and it says so in words, not only in colour",
    await card("M3 E30").locator(".card-shiny").innerText(),
    "De colección",
  );
  // Bottom right, inside the card, and not eating the click that opens the
  // sheet. Measured: "bottom right" is the whole ask, and a badge that lands in
  // the wrong corner would pass every other check here.
  const mark = await page.evaluate(() => {
    const c = document.querySelector(".car-card:has(.card-shiny)");
    const b = c.querySelector(".card-shiny");
    const cr = c.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    return {
      inBottomRight:
        cr.right - br.right < 24 && cr.bottom - br.bottom < 24 &&
        br.left > cr.left + cr.width / 2 && br.top > cr.top + cr.height / 2,
      inside: br.right <= cr.right && br.bottom <= cr.bottom,
      clickThrough: getComputedStyle(b).pointerEvents === "none",
      // over the photo's darkening veil, or the gradient washes it out
      overVeil: +getComputedStyle(b).zIndex > +getComputedStyle(c.querySelector(".card-car")).zIndex,
    };
  });
  check("it sits in the bottom right corner", mark.inBottomRight, true);
  check("inside the card, not clipped by it", mark.inside, true);
  check("it does not swallow the click that opens the sheet", mark.clickThrough, true);
  check("and it draws over the photo rather than under the veil", mark.overVeil, true);

  // The shop prints "De colección" in purple next to the price. Two ways of
  // saying one thing, so they must never disagree.
  await page.locator('.topnav-btn[aria-label="Concesionaria"]').click();
  await page.getByRole("button", { name: /Concesionarios/ }).click();
  await page.getByRole("button", { name: /Pacheco/ }).click();
  await page.waitForSelector(".shop-item");
  check(
    "in the shop the mark agrees with the word beside the price, row for row",
    await page.locator(".shop-item").evaluateAll((els) =>
      els.filter((e) => !!e.querySelector(".card-shiny") !==
        (e.querySelector(".shop-flag")?.textContent.trim() === "De colección")).length),
    0,
  );
  check(
    "and the shop has some to show, so that check was not vacuous",
    (await page.locator(".shop-item .card-shiny").count()) > 0,
    true,
  );

  /*
   * Ajustes, and the reset.
   *
   * It runs last for one reason: it wipes the save. Anything after it would be
   * looking at a brand new game. Its own save goes in first so the numbers it
   * checks against are its own -- a played garage, obviously not the starting
   * one, so "you are back at the start" is a visible change rather than a
   * coincidence.
   */
  console.log("\najustes");
  await page.evaluate((s) => localStorage.setItem("motorlife.save", JSON.stringify(s)), {
    version: 3,
    credits: 412_500,
    racesRun: 37,
    owned: [
      { id: "ferrari-f40", km: 12_000, color: "red" },
      { id: "bmw-m3-e30", km: 240_100, color: "black" },
      { id: "chevrolet-chevy-250", km: 317_500 },
    ],
  });
  await page.reload({ waitUntil: "networkidle" });
  await garage();

  const gear = page.locator('.topnav-btn[aria-label="Ajustes"]');
  check("the nav has a gear beyond the sections", await gear.count(), 1);
  /*
   * Four sections then the gear, and the ORDER is the errand: you own a car,
   * you buy another, you build one, you race it. Taller sits third rather than
   * last because the slide direction is taken off this order -- putting it
   * after Carrera would animate "race, then prepare".
   */
  check(
    "and they read left to right in the order of the errand",
    await page.locator(".topnav-btn").evaluateAll((els) =>
      els.map((e) => e.getAttribute("aria-label")).join(" | ")),
    "Garaje | Concesionaria | Taller | Carrera | Ajustes",
  );
  check("its glyph loaded rather than 404ing", await gear.locator("img").evaluate((e) => e.complete && e.naturalWidth > 0), true);

  await gear.click();
  await page.waitForSelector("dialog.settings-modal");
  check("clicking it opens a dialog, not a screen", await page.locator("dialog.settings-modal").isVisible(), true);
  check("the garage is still behind it", await page.locator(".car-card").count(), 3);
  // The gear is an action, not a place. The tab you were on stays the one that
  // is lit, and nothing claims to be two sections at once.
  check(
    "the section you were in is still the lit one",
    await page.locator(".topnav-btn.on").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).join(" | ")),
    "Garaje",
  );
  check(
    "and the gear never says you-are-here",
    await gear.evaluate((e) => e.getAttribute("aria-current")),
    null,
  );
  check("it offers resetting the progress, in words", await page.locator(".settings-label").innerText(), "Resetear progreso");
  check(
    "spelling out what goes",
    await page.locator(".settings-note").innerText(),
    "Borra tus autos, tu plata y tus carreras. Volvés a empezar de cero.",
  );
  check("with the way out focused rather than the red button", await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Volver");

  console.log("\nthe way back out of ajustes");
  await page.locator('.settings-acts .btn[aria-label="Volver"]').click();
  await page.waitForSelector("dialog.settings-modal", { state: "detached" });
  check("the arrow closes it", await page.locator("dialog.settings-modal").count(), 0);
  check("and changed nothing", await wallet(), "412.500CR");

  console.log("\nresetting asks first");
  await gear.click();
  await page.waitForSelector("dialog.settings-modal");
  await page.locator(".settings-reset").click();
  await page.waitForSelector("dialog.confirm");
  check("one click does not wipe the save, it asks", await page.locator(".confirm-q").innerText(), "¿Resetear todo tu progreso?");
  check(
    "saying what is lost and that it is final",
    await page.locator(".confirm-detail").innerText(),
    "Perdés tus autos, tu plata y tus carreras. No se puede deshacer.",
  );
  check("with the way out focused, so a stray Enter does not wipe it", await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Volver");
  check("nothing reset while the question is up", await wallet(), "412.500CR");

  await page.locator(".confirm-acts .btn").first().click();
  await page.waitForSelector("dialog.confirm", { state: "detached" });
  check("No keeps the game", await wallet(), "412.500CR");
  check("and leaves ajustes open behind it", await page.locator("dialog.settings-modal").isVisible(), true);
  check("with the garage still whole", await page.locator(".car-card").count(), 3);

  console.log("\nand yes actually resets");
  await page.locator(".settings-reset").click();
  await page.waitForSelector("dialog.confirm");
  await page.locator(".confirm-acts .btn.danger").click();
  await page.waitForSelector("dialog.confirm", { state: "detached" });
  await page.waitForSelector("dialog.settings-modal", { state: "detached" });
  check("both dialogs close", await page.locator("dialog[open]").count(), 0);
  // The backdrop is the thing a nested dialog leaves behind when it is closed
  // in the wrong order: the page looks fine and nothing on it can be clicked.
  check("the page is clickable again, with no orphan backdrop", await page.locator(".car-card").first().isEnabled(), true);
  check("it says so", await page.locator(".toast").innerText(), "Empezás de cero");
  check("the money is back to the starting purse", await wallet(), "6.000CR");
  check("the garage is the starting garage", await page.locator(".car-card").count(), 1);
  check(
    "holding the one car a new player gets",
    await page.locator(".card-title-bold > span").first().innerText(),
    "R12 TL",
  );
  check("and it lands you in the garage", await page.locator(".topnav-btn.on").getAttribute("aria-label"), "Garaje");
  // The save is only half a reset. The car you are SITTING IN lives in React,
  // and a wipe that left it alone would leave the topbar naming a Ferrari that
  // is no longer in the garage below it.
  check(
    "and puts you in the car you now own, not the one the reset took away",
    await page.locator(".topcar-name").innerText(),
    "R12 TL'71",
  );

  await page.reload({ waitUntil: "networkidle" });
  await garage();
  check("and it survives a reload, so the old save really is gone", await wallet(), "6.000CR");
  check("with the old cars gone with it", await page.locator(".car-card").count(), 1);

  /*
   * The transition between sections.
   *
   * Runs after the reset, on the fresh save, because none of it cares what is
   * in the garage -- it cares which way a screen moves when you change tab.
   *
   * Everything here is read off getAnimations() rather than off screenshots.
   * "Which way did it go" is a fact the browser will state by name, and a pair
   * of screenshots 100ms apart is the flaky way to ask the same question.
   */
  console.log("\nthe screen transition");
  /** The animation on each half of the stage, by name. */
  const stage = () =>
    page.evaluate(() => {
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const a = el.getAnimations()[0];
        return a ? { name: a.animationName, ms: a.effect.getTiming().duration } : null;
      };
      return { going: pick(".screen.going"), coming: pick(".screen.coming") };
    });

  check("one screen on the stage when nothing is moving", await page.locator(".screen").count(), 1);

  // Garage -> Concesionaria is going RIGHT along the nav, so the garage leaves
  // to the left and the shop arrives from the right. This is the whole ask.
  await page.locator('.topnav-btn[aria-label="Concesionaria"]').click();
  const fwd = await stage();
  check("going right, the old screen leaves to the left", fwd.going?.name, "screen-out-left");
  check("and the new one comes in from the right", fwd.coming?.name, "screen-in-right");
  check("both for the same length of time", fwd.going?.ms === fwd.coming?.ms, true);
  check("which matches SLIDE_MS in App.tsx", fwd.coming?.ms, 340);
  check("with both screens on the stage while it runs", await page.locator(".screen").count(), 2);

  // Coming BACK is the mirror. A slide that went the same way in both
  // directions would pass every check above and still be wrong.
  await settled();
  await page.locator('.topnav-btn[aria-label="Garaje"]').click();
  const back = await stage();
  check("going back, the old screen leaves to the right", back.going?.name, "screen-out-right");
  check("and the new one comes in from the left", back.coming?.name, "screen-in-left");

  /*
   * The two screens share one grid cell, which is what replaced the old
   * arrangement of lifting the leaving one out of the flow and holding the
   * stage up with a height floor. Dealt into the same cell they are already
   * the same size and already stacked, so there is nothing to hold up.
   *
   * The stage still clips sideways -- each screen spends part of the slide a
   * full width off to one side -- and still must NOT clip vertically, because
   * menus and dropdowns are allowed to escape it.
   */
  const geom = await page.evaluate(() => {
    const st = document.querySelector(".stage");
    const go = document.querySelector(".screen.going");
    const co = document.querySelector(".screen.coming");
    const cell = (el) => (el ? getComputedStyle(el).gridArea : "none");
    return {
      sameCell: go && co && cell(go) === cell(co),
      sameSize: go && co
        ? Math.abs(go.getBoundingClientRect().height - co.getBoundingClientRect().height) < 1
        : false,
      clipX: getComputedStyle(st).overflowX,
      clipY: getComputedStyle(st).overflowY,
      held: st.getBoundingClientRect().height > 100,
      noHScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    };
  });
  check("both screens are dealt into the same grid cell", geom.sameCell, true);
  check("so they are the same size without anything holding them there", geom.sameSize, true);
  check("the stage holds its height rather than collapsing", geom.held, true);
  check("the stage clips sideways", geom.clipX, "clip");
  check("but never vertically", geom.clipY, "visible");
  check("so nothing opens a horizontal scrollbar", geom.noHScroll, true);

  /*
   * The travel is a WHOLE SCREEN WIDTH, not a nudge.
   *
   * This is the check the first version of the slide would have failed. It
   * moved 38px -- three percent of the frame -- which passed every "did it
   * animate, and which way" question above and still looked like a plain
   * crossfade. Measuring the distance is the only way to ask whether anything
   * actually appears to move.
   *
   * Read at the animation's own end state rather than by sampling mid-flight,
   * so it is a fact about the keyframes and not a race with the clock.
   */
  const travel = await page.evaluate(() => {
    const go = document.querySelector(".screen.going");
    const a = go.getAnimations()[0];
    const was = a.currentTime;
    a.pause();
    a.currentTime = a.effect.getTiming().duration;
    const m = new DOMMatrix(getComputedStyle(go).transform);
    const out = { moved: Math.abs(m.m41), width: go.getBoundingClientRect().width };
    // Put it back and let it run, so the checks after this one still see a
    // slide that finishes on its own.
    a.currentTime = was;
    a.play();
    return out;
  });
  check(
    "the leaving screen travels its own full width, not a nudge",
    travel.moved >= travel.width * 0.95,
    true,
  );

  /*
   * An arriving screen must not be cropped, whatever is on it.
   *
   * This is the bug that shipped once. The stage was pinned to the height of
   * the screen being replaced and clipped with overflow: hidden, so arriving
   * at the shop from a one-car garage cut the shop's cards in half -- their
   * names and notes simply absent -- until the timer released the clamp a
   * third of a second later. It looked exactly like content loading in late,
   * which is the worst kind of bug: the explanation that comes to mind is the
   * wrong one.
   *
   * The stage is the height of the frame now whatever is in it, so the
   * mismatch that caused this cannot arise -- and the check stays, aimed at
   * the thing that actually matters: everything on the arriving screen is
   * inside the frame while the slide is running.
   *
   * Checked DURING the slide, with the animations paused, because afterwards
   * everything is correct. The whole failure lived inside those 340ms.
   */
  await settled();
  await garage();
  await settled();
  const gh = await page.evaluate(() => document.querySelector(".stage").getBoundingClientRect().height);
  await page.locator('.topnav-btn[aria-label="Concesionaria"]').click();
  await page.waitForSelector(".pick-grid");
  const crop = await page.evaluate(() => {
    for (const s of [".screen.going", ".screen.coming"]) {
      const a = document.querySelector(s)?.getAnimations()[0];
      if (a) { a.pause(); a.currentTime = a.effect.getTiming().duration / 2; }
    }
    const st = document.querySelector(".stage").getBoundingClientRect();
    // The last thing on the arriving screen. If the stage were clamped short,
    // this would sit below its bottom edge, invisible to the player.
    const cards = [...document.querySelectorAll(".screen.coming .pick-card")];
    const lowest = Math.max(...cards.map((c) => c.getBoundingClientRect().bottom));
    const named = cards.every((c) => {
      const n = c.querySelector(".pick-name")?.getBoundingClientRect();
      return n && n.bottom <= st.bottom + 1;
    });
    for (const s of [".screen.going", ".screen.coming"]) {
      document.querySelector(s)?.getAnimations()[0]?.play();
    }
    return { fits: lowest <= st.bottom + 1, named, stage: st.height };
  });
  check("mid-slide, the stage is still the height of the frame", Math.abs(crop.stage - gh) < 1, true);
  check("the arriving cards are not cut off by the frame", crop.fits, true);
  check("and every one of them still has its name visible", crop.named, true);
  await settled();

  // And it is really gone afterwards, rather than left stacked invisibly over
  // the live screen where it would eat clicks.
  await settled();
  check("the old screen is dropped once it has left", await page.locator(".screen").count(), 1);
  check("the stage stops being a stage", await page.locator(".stage.sliding").count(), 0);
  /*
   * At rest there is no animation on the screen AT ALL, rather than a finished
   * one hanging around. That is a consequence of the direction living in
   * data-dir: once the slide ends App sets it back to 0, no rule matches, and
   * the `both` fill goes with it. Worth pinning, because the alternative -- a
   * finished animation still holding the element at its end state -- is how a
   * screen ends up stuck at opacity 0 if a keyframe is ever edited wrong.
   */
  check(
    "and the one left is at rest, full opacity, with no animation on it",
    await page.evaluate(() => {
      const el = document.querySelector(".screen.coming");
      return `${el.getAnimations().length} anims @ opacity ${getComputedStyle(el).opacity}`;
    }),
    "0 anims @ opacity 1",
  );

  // Pressing the tab you are already on is not a change of section, so it must
  // not slide -- but it must still take the shop back to its top level.
  await page.locator('.topnav-btn[aria-label="Concesionaria"]').click();
  await settled();
  // Two levels down -- the chooser, then a dealer -- so "back to the top" is
  // a real journey rather than one click undone.
  await page.getByRole("button", { name: /Concesionarios/ }).click();
  await page.getByRole("button", { name: /Pacheco/ }).click();
  await page.waitForSelector(".shop-item");
  await page.locator('.topnav-btn[aria-label="Concesionaria"]').click();
  check("pressing the tab you are on does not slide", await page.locator(".screen.going").count(), 0);
  check("but it does take you back to the top of the section", await page.locator(".pick-grid").count(), 1);

  // Opening a dialog must not move the screen behind it: it did not arrive
  // anywhere, it is just being covered.
  await settled();
  await page.locator('.topnav-btn[aria-label="Ajustes"]').click();
  await page.waitForSelector("dialog.settings-modal");
  check("opening a dialog does not slide the screen behind it", await page.locator(".screen.going").count(), 0);
  await page.locator('.settings-acts .btn[aria-label="Volver"]').click();
  await page.waitForSelector("dialog.settings-modal", { state: "detached" });

  /*
   * The race, which is a dialog rather than a section.
   *
   * The lock is the part worth testing. The purse is paid when the tower
   * reaches the flag, so a race that could be dismissed on lap 9 would be a
   * race you entered, watched and got nothing for.
   */
  console.log("\nthe race");
  await page.locator('.topnav-btn[aria-label="Carrera"]').click();
  await page.waitForSelector(".setup-grid");
  await settled();
  const before = await wallet();
  await page.locator(".btn.primary", { hasText: "Correr" }).first().click();
  await page.waitForSelector("dialog.race-modal");
  check("pressing Race opens the tower as a dialog", await page.locator("dialog.race-modal").isVisible(), true);
  check("it is not a section, so no screen slid", await page.locator(".screen.going").count(), 0);
  check(
    "and the section behind it is still the lit one",
    await page.locator(".topnav-btn.on").getAttribute("aria-label"),
    "Carrera",
  );
  check("the tower is up", (await page.locator(".tower-row").count()) > 0, true);

  // Escape, mid-race. Refused.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  check("Escape cannot abandon a race in progress", await page.locator("dialog.race-modal").isVisible(), true);
  check("and nothing was paid for a race that has not finished", await wallet(), before);
  check("there is no way out on the screen either", await page.locator(".race-out").count(), 0);

  /*
   * To the flag, which is the one way to end it.
   *
   * The wallet is waited FOR rather than read the moment .payout appears: the
   * payout line is rendered by the race and the wallet by App, so they land on
   * different ticks and reading straight away catches the old number.
   */
  await page.locator(".btn.ghost", { hasText: "bandera" }).click();
  await page.waitForSelector(".payout");
  await page.waitForFunction(
    (was) => document.querySelector(".wallet")?.innerText !== was,
    before,
    { timeout: 5000 },
  );
  const paidWallet = await wallet();
  check("finishing pays the purse", paidWallet !== before, true);
  check("and now there is a way out", await page.locator(".race-out").count(), 1);

  // Paid ONCE. The payout is guarded by a ref against React running an effect
  // twice; this is that guard, asked from the outside.
  await page.waitForTimeout(400);
  check("and it is paid exactly once, not once per render", await wallet(), paidWallet);

  await page.locator(".race-out").click();
  await page.waitForSelector("dialog.race-modal", { state: "detached" });
  await settled();
  check(
    "leaving the tower lands you in the garage",
    await page.locator(".topnav-btn.on").getAttribute("aria-label"),
    "Garaje",
  );
  check("with the cars in it", (await page.locator(".car-card").count()) > 0, true);
  check("and the money still there", await wallet(), paidWallet);

  /*
   * The frame, and what scrolls inside it.
   *
   * The app is exactly the height of the window: the topbar and the credit are
   * rows of it that cannot move, and the only thing that scrolls is the list
   * inside the current section. That is the whole arrangement, and each half
   * of it is checked -- that the document itself CANNOT scroll matters as much
   * as that the list can, because the bug being prevented is a second
   * scrollbar running down the outside of the window past two pinned bars.
   *
   * Needs a garage tall enough to scroll, so it seeds its own. A first attempt
   * at this used six cars in an 800px viewport and the page did not overflow
   * at all -- every assertion passed against a page that never moved, which is
   * the quiet way a scrolling test proves nothing.
   *
   * The eighth car was "ford-f-100", which is not a car: the id is "ford-f100",
   * so the garage quietly had seven and the check below counting on a tall page
   * was doing it with one card less than it thought.
   */
  console.log("\nthe frame, and the scrolling inside it");
  await page.setViewportSize({ width: 1100, height: 620 });
  await page.evaluate((s) => localStorage.setItem("motorlife.save", JSON.stringify(s)), {
    version: 3,
    credits: 900_000,
    racesRun: 4,
    owned: [
      { id: "ferrari-f40", km: 12_000, color: "red" },
      { id: "honda-nsx", km: 90_000, color: "white" },
      { id: "bmw-m3-e30", km: 200_000, color: "black" },
      { id: "renault-12-tl", km: 214_000, color: "light-blue" },
      { id: "peugeot-504-tn", km: 250_000, color: "blue" },
      { id: "fiat-128-iava", km: 180_000, color: "red" },
      { id: "ford-f100", km: 300_000, color: "red" },
      { id: "bmw-m5-e60", km: 95_000, color: "white" },
    ],
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".car-card");
  await settled();

  const frame = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.querySelector(".screen.coming .screen-body");
    return {
      docCanScroll: doc.scrollHeight > doc.clientHeight,
      docHasScrollbar: window.innerWidth - doc.clientWidth > 0,
      listOverflows: body.scrollHeight - body.clientHeight > 100,
      appFitsWindow: Math.round(document.querySelector(".app").getBoundingClientRect().height)
        === window.innerHeight,
    };
  });
  check("the garage is long enough that scrolling means something", frame.listOverflows, true);
  check("the app is exactly the height of the window", frame.appFitsWindow, true);
  check("the document itself cannot scroll", frame.docCanScroll, false);
  check("so the window never draws a scrollbar of its own", frame.docHasScrollbar, false);

  // Scrolling the LIST must not move the frame around it.
  await page.evaluate(() => document.querySelector(".screen.coming .screen-body").scrollTo(0, 400));
  await page.waitForTimeout(150);
  const bars = await page.evaluate(() => {
    const t = document.querySelector(".topbar").getBoundingClientRect();
    const f = document.querySelector(".credit").getBoundingClientRect();
    return {
      listScrolled: Math.round(document.querySelector(".screen.coming .screen-body").scrollTop) > 0,
      windowStillZero: Math.round(window.scrollY) === 0,
      topStuck: Math.round(t.top) === 0,
      footPinned: Math.round(f.bottom) === window.innerHeight,
      // Opaque, or the cards passing behind would read straight through it.
      topOpaque: getComputedStyle(document.querySelector(".topbar")).backgroundImage !== "none",
    };
  });
  check("the list actually scrolled", bars.listScrolled, true);
  check("and the window did not move with it", bars.windowStillZero, true);
  check("the topbar stays at the top of the window", bars.topStuck, true);
  check("the credit stays at the bottom of it", bars.footPinned, true);
  check("and the topbar is opaque, so nothing reads through it", bars.topOpaque, true);

  /*
   * The header stays while its own list moves.
   *
   * This is the point of the whole arrangement and the thing a page-level
   * scroll cannot do: on a dealer's forecourt the sort bar is wanted most when
   * you are deep in the list it sorts, and it used to be the first thing to
   * leave the screen.
   */
  console.log("\nthe header that stays while the list moves");
  await page.locator('.topnav-btn[aria-label="Concesionaria"]').click();
  await settled();
  await page.getByRole("button", { name: /Concesionarios/ }).click();
  await page.getByRole("button", { name: /Don Beto/ }).click();
  await page.waitForSelector(".shop-item");
  const pinned = await page.evaluate(() => {
    const at = () => ({
      title: Math.round(document.querySelector(".screen-title").getBoundingClientRect().top),
      bar: Math.round(document.querySelector(".shopbar").getBoundingClientRect().top),
      back: Math.round(document.querySelector(".head-back").getBoundingClientRect().top),
      card: Math.round(document.querySelector(".shop-item").getBoundingClientRect().top),
    });
    const body = document.querySelector(".screen.coming .screen-body");
    const before = at();
    body.scrollTo(0, 500);
    const after = at();
    return {
      moved: Math.round(body.scrollTop) > 0,
      titleHeld: before.title === after.title,
      barHeld: before.bar === after.bar,
      backHeld: before.back === after.back,
      cardsMoved: before.card !== after.card,
    };
  });
  check("the list scrolled", pinned.moved, true);
  check("the title did not move with it", pinned.titleHeld, true);
  check("nor did the sort bar", pinned.barHeld, true);
  check("nor the way back up", pinned.backHeld, true);
  check("but the cars did", pinned.cardsMoved, true);

  /*
   * The way back up is IN the title line now, not a breadcrumb floating on a
   * row above it -- and being two very different type sizes, they only read as
   * one line if their boxes are centred on each other. Measured, because
   * "looks aligned" is the entire reason this changed.
   */
  const aligned = await page.evaluate(() => {
    const mid = (s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return r.top + r.height / 2;
    };
    return Math.abs(mid(".head-back") - mid(".screen-title"));
  });
  check("the back button is centred against the title, not hanging below it", aligned <= 1, true);

  // A screen with nothing below the fold must not draw a scroll box.
  await page.locator('.topnav-btn[aria-label="Concesionaria"]').click();
  await settled();
  check(
    "the shop's front door has no scroll box, having nothing to scroll",
    await page.locator(".screen.coming .screen-body.still").count(),
    1,
  );

  check(
    "the credit says who made it, and links out",
    await page.locator(".credit").innerText(),
    "De Tiki Tiki Studios",
  );
  check(
    "to the studio, in a new tab, without handing it a window handle",
    await page.locator(".credit a").evaluate((a) => `${a.href} ${a.target} ${a.rel}`),
    "https://www.tikitikistudios.online/es _blank noreferrer",
  );

  /*
   * Changing section from halfway down a list must land at the top of the new
   * one, not keep the old offset. Nothing scrolls back into view to tell you
   * otherwise now: the topbar and the section title both stay put, so arriving
   * mid-list looks like a section that simply starts in the middle.
   *
   * Each section owns its own scroll box, so this asks the arriving one where
   * it is rather than asking the window.
   */
  await garage();
  await settled();
  await page.evaluate(() => document.querySelector(".screen.coming .screen-body").scrollTo(0, 400));
  await page.waitForTimeout(100);
  await page.locator('.topnav-btn[aria-label="Concesionaria"]').click();
  await settled();
  check(
    "arriving at a section puts you at the top of it",
    await page.evaluate(() => {
      const b = document.querySelector(".screen.coming .screen-body");
      return b ? Math.round(b.scrollTop) : 0;
    }),
    0,
  );
  // And the section you left is back at its own top when you return to it.
  await garage();
  await settled();
  check(
    "and going back does not restore the old offset either",
    await page.evaluate(() => Math.round(document.querySelector(".screen.coming .screen-body").scrollTop)),
    0,
  );
  await page.setViewportSize({ width: 1280, height: 900 });

  check("nothing 404ed and nothing threw", noise.join(", "), "");

  /*
   * Reduced motion, on its own page: the emulation is a property of the
   * context, so it cannot be turned on halfway through the one above.
   *
   * The screen still has to BE there. The risk with cancelling an animation
   * that starts at opacity 0 is shipping a blank page to exactly the people
   * who asked for less motion, so this checks the content is visible and fully
   * opaque, not merely that the animation is gone.
   */
  console.log("\nthe same transition, for someone who asked for less motion");
  const calm = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  await calm.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
  await calm.waitForSelector(".car-card");
  check(
    "no animation runs",
    await calm.evaluate(() => document.querySelector(".screen.coming").getAnimations().length),
    0,
  );
  check(
    "and the screen is fully there rather than left at opacity 0",
    await calm.evaluate(() => {
      const el = document.querySelector(".screen.coming");
      return `opacity ${getComputedStyle(el).opacity}, ${el.getBoundingClientRect().height > 100 ? "visible" : "COLLAPSED"}`;
    }),
    "opacity 1, visible",
  );
  await calm.locator('.topnav-btn[aria-label="Concesionaria"]').click();
  await calm.waitForSelector(".pick-grid, .shop-item, .card-grid");
  check(
    "and changing section still changes section",
    await calm.evaluate(() => getComputedStyle(document.querySelector(".screen.coming")).opacity),
    "1",
  );
  /*
   * The leaving screen must never sit stacked at full opacity over the live
   * one -- with no animation to carry it away that is the one outcome worse
   * than the movement itself.
   *
   * Two answers are both right and which one you get is a race with the timer
   * that unmounts it: still in the DOM but display:none, or already gone. The
   * check names the property that matters (it is not covering anything) rather
   * than pinning one of the two timings, because pinning the timing is how a
   * test starts failing on a slower machine for no reason.
   */
  check(
    "the leaving screen is never left stacked on top",
    await calm.evaluate(() => {
      const go = document.querySelector(".screen.going");
      if (!go) return "not covering";
      return getComputedStyle(go).display === "none" ? "not covering" : "COVERING";
    }),
    "not covering",
  );
  await calm.close();
} finally {
  await browser.close();
}

console.log(`\n${checks - failures.length}/${checks} checks passed.`);
if (failures.length) {
  console.log(`\n${failures.length} failed:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
