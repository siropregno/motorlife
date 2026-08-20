import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "tools/shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

const wallet = () => page.locator(".wallet").innerText();

await page.goto("http://localhost:5177/", { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.removeItem("motorlife.save"));
await page.reload({ waitUntil: "networkidle" });

// --- garage: you own one car ---------------------------------------------
await page.waitForSelector(".car-card");
console.log(`garage: ${await page.locator(".car-card").count()} owned, wallet ${(await wallet()).replace(/\s+/g, " ")}`);
console.log(`        current car ${(await page.locator(".topcar").innerText()).replace(/\s+/g, " ")}`);
await page.screenshot({ path: `${OUT}/1-garage.png`, fullPage: true });

// --- dealership: cannot afford anything yet -------------------------------
await page.getByRole("button", { name: "Dealership" }).click();
await page.waitForSelector(".shop-item");
const stock = await page.locator(".shop-item .card-title-bold").allInnerTexts();
const prices = await page.locator(".shop-price").allInnerTexts();
const buyLabels = await page.locator(".shop-buy .btn").allInnerTexts();
console.log(`shop:   ${stock.length} listed -> ${stock.map((s, i) => `${s.trim()} ${prices[i]} [${buyLabels[i]}]`).join(", ")}`);
await page.screenshot({ path: `${OUT}/2-shop.png`, fullPage: true });

// --- race for the money ---------------------------------------------------
await page.getByRole("button", { name: /Garage/ }).click();
await page.getByRole("button", { name: /Set up/ }).click();
await page.waitForSelector(".feel");

// There is no predicted lap any more, so there is nothing to hill-climb.
// Set the car the way a player reading the feel bars would: wing on for a
// twisty circuit, springs left alone so the tyres last the stint.
const setSlider = (name, v) =>
  page.getByLabel(name).evaluate((el, val) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(el, String(val));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);
for (const [name, v] of [["Aero", 0.5], ["Gearing", -0.25], ["Springs", 0.35], ["Brake bias", 0.35]]) {
  await setSlider(name, v);
  await page.waitForTimeout(60);
}
await page.screenshot({ path: `${OUT}/2b-setup.png`, fullPage: true });
console.log(`feel:   ${(await page.locator(".feel").innerText()).replace(/s+/g, " | ")}`);
if (await page.locator(".laptime").count()) errors.push("the predicted lap is still on the Setup screen");
await page.getByRole("button", { name: /Race/ }).click();
await page.waitForSelector(".tower-row");
const heading = (await page.locator(".screen-sub").innerText()).replace(/\s+/g, " ");
console.log(`race:   ${heading}`);
await page.getByRole("button", { name: /Skip to flag/ }).click();
await page.waitForTimeout(700);
const rows = await page.locator(".tower-row").allInnerTexts();
console.log("final classification (class cap should keep these close):");
for (const r of rows) console.log("   " + r.replace(/\n/g, "  "));
console.log(`payout: ${(await page.locator(".payout").innerText()).replace(/\s+/g, " ")}`);
console.log(`wallet: ${(await wallet()).replace(/\s+/g, " ")}`);
await page.screenshot({ path: `${OUT}/3-race.png`, fullPage: true });
const race1 = rows.map((r) => r.replace(/\s+/g, " ")).sort().join(" / ");

// --- race the SAME setup again: it must be a different event --------------
const rerun = async () => {
  await page.getByRole("button", { name: /Setup/ }).click();
  await page.waitForSelector(".feel");
  await page.getByRole("button", { name: /Race/ }).click();
  await page.waitForSelector(".tower-row");
  await page.getByRole("button", { name: /Skip to flag/ }).click();
  await page.waitForTimeout(700);
  return (await page.locator(".tower-row").allInnerTexts()).map((r) => r.replace(/\s+/g, " ")).sort().join(" / ");
};
const race2 = await rerun();
console.log("second race, same setup:");
for (const r of (await page.locator(".tower-row").allInnerTexts())) console.log("   " + r.replace(/\n/g, "  "));
if (race1 === race2) errors.push("re-racing the same setup produced an identical result");

// --- earn enough, then actually buy --------------------------------------
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("motorlife.save"));
  s.credits = 200000;
  localStorage.setItem("motorlife.save", JSON.stringify(s));
});
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: "Dealership" }).click();
await page.waitForSelector(".shop-item");
const before = await page.locator(".shop-item").count();
// HURACAN PROBE: the longest plausible model name, checked live rather than
// estimated. If it ellipsises the name column is too narrow.
const fits = await page.locator(".shop-item .card-title-bold > span").first().evaluate((el) => {
  el.textContent = "Huracan Performante";
  const row = el.parentElement;
  return { clipped: el.scrollWidth > el.clientWidth + 1, rowFits: row.scrollWidth <= row.clientWidth + 1 };
});
console.log(`longname: clipped=${fits.clipped} rowFits=${fits.rowFits}`);
if (fits.clipped) errors.push("a 19-char model name is clipped on the card");
await page.screenshot({ path: `${OUT}/4-shop-rich.png`, fullPage: true });
await page.locator(".shop-buy .btn").first().click();
await page.waitForTimeout(300);
const after = await page.locator(".shop-item").count();
console.log(`buy:    stock ${before} -> ${after}, wallet ${(await wallet()).replace(/\s+/g, " ")}`);
const buyToast = await page.locator(".toast").innerText().catch(() => "");
console.log(`toast:  "${buyToast.replace(/\s+/g, " ")}"`);
if (!/^Compraste un /.test(buyToast)) errors.push(`no buy toast, got "${buyToast}"`);
await page.getByRole("button", { name: /Garage/ }).click();
await page.waitForSelector(".car-card");
console.log(`garage: ${await page.locator(".car-card").count()} owned after purchase`);
await page.screenshot({ path: `${OUT}/5-garage-two.png`, fullPage: true });

// --- the card is not a click target any more -------------------------------
const topcar = async () => (await page.locator(".topcar").innerText()).replace(/\s+/g, " ");
const screen = async () => (await page.locator(".screen-title").innerText()).trim().toLowerCase();

const beforeClick = await topcar();
await page.locator(".car-card").nth(1).click();
await page.waitForTimeout(200);
console.log(`click:  ${await screen()} screen, topcar ${beforeClick} -> ${await topcar()}`);
if ((await topcar()) !== beforeClick) errors.push("left-clicking a card still changed the car");
if ((await screen()) !== "garage") errors.push("left-clicking a card navigated somewhere");

// --- right-click menu ------------------------------------------------------
await page.locator(".car-card").nth(1).click({ button: "right" });
await page.waitForSelector(".ctx");
console.log(`menu:   ${(await page.locator(".ctx-item").allInnerTexts()).map((t) => t.replace(/\s+/g, " ")).join(" | ")}`);
await page.screenshot({ path: `${OUT}/6-menu.png`, fullPage: true });

// "Subirse al auto" changes the car and STAYS in the garage
await page.getByRole("menuitem", { name: "Subirse al auto" }).click();
await page.waitForTimeout(250);
console.log(`drive:  topcar ${beforeClick} -> ${await topcar()}, still on ${await screen()}`);
if ((await topcar()) === beforeClick) errors.push("Subirse al auto did not change the car");
if ((await screen()) !== "garage") errors.push("Subirse al auto navigated away from the garage");
const driveToast = (await page.locator(".toast").last().innerText().catch(() => "")).replace(/\s+/g, " ");
console.log(`toast:  "${driveToast}"`);
if (!/^Te subiste a tu .+$/.test(driveToast)) errors.push(`wrong drive toast: "${driveToast}"`);
await page.screenshot({ path: `${OUT}/7-garage-drive.png`, fullPage: true });

// the car you are already in cannot be got into again
await page.locator(".car-card").nth(1).click({ button: "right" });
await page.waitForSelector(".ctx");
const driveItem = page.locator(".ctx-item").first();
console.log(`in-car: "${(await driveItem.innerText()).replace(/\s+/g, " ")}" disabled=${await driveItem.isDisabled()}`);
if (!(await driveItem.isDisabled())) errors.push("the current car still offered Subirse al auto");
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
if (await page.locator(".ctx").count()) errors.push("Escape did not close the menu");

// --- sell the car we are sitting in: the selection has to repair itself ----
await page.locator(".car-card").nth(1).click({ button: "right" });
await page.waitForSelector(".ctx");
await page.getByRole("menuitem", { name: /Vender/ }).click();
await page.waitForSelector(".ctx-item.armed");
const armedLabel = (await page.locator(".ctx-item.armed").innerText()).replace(/\s+/g, " ");
const stillOwned = await page.locator(".car-card").count();
console.log(`arm:    "${armedLabel}", still ${stillOwned} owned (must be 2)`);
await page.screenshot({ path: `${OUT}/8-menu-armed.png`, fullPage: true });
if (stillOwned !== 2) errors.push("sell fired on the first click, before confirming");

const soldCar = await topcar();
const beforeSell = await wallet();
await page.locator(".ctx-item.armed").click();
await page.waitForTimeout(300);
const leftInGarage = await page.locator(".car-card").count();
console.log(`sell:   ${stillOwned} -> ${leftInGarage} owned, wallet ${beforeSell.replace(/\s+/g, " ")} -> ${(await wallet()).replace(/\s+/g, " ")}`);
console.log(`repair: topcar ${soldCar} -> ${await topcar()}`);
if (leftInGarage !== 1) errors.push(`confirm did not sell: ${leftInGarage} cars left`);
if ((await topcar()) === soldCar) errors.push("still sitting in the car that was just sold");
if (await page.locator(".ctx").count()) errors.push("menu stayed open after picking");
// selling the car you are in must say BOTH things: what you sold, and that
// you have been moved into another car
const pair = (await page.locator(".toast").allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
console.log(`toasts: ${pair.map((t) => `"${t}"`).join(" + ")}`);
if (!pair.some((t) => /^Vendiste tu .+ por [\d.]+ cr$/.test(t)))
  errors.push(`no sell toast in ${JSON.stringify(pair)}`);
if (!pair.some((t) => t === "Te subiste a tu Renault R12 TL"))
  errors.push(`the forced car change was silent: ${JSON.stringify(pair)}`);
await page.screenshot({ path: `${OUT}/9-garage-sold.png`, fullPage: true });

// the last car is not for sale, and the menu must say why
await page.locator(".car-card").first().click({ button: "right" });
await page.waitForSelector(".ctx");
const sellItem = page.getByRole("menuitem", { name: /Vender/ });
console.log(`last:   "${(await sellItem.innerText()).replace(/\s+/g, " ")}" disabled=${await sellItem.isDisabled()}`);
if (!(await sellItem.isDisabled())) errors.push("your last car was sellable");
await page.keyboard.press("Escape");

// --- keyboard: the menu is reachable without a mouse -----------------------
await page.locator(".car-card").first().focus();
await page.keyboard.press("Shift+F10");
await page.waitForTimeout(200);
const kbdOpen = await page.locator(".ctx").count();
console.log(`kbd:    Shift+F10 opened the menu = ${kbdOpen === 1}`);
if (kbdOpen !== 1) errors.push("Shift+F10 on a focused card did not open the menu");
await page.keyboard.press("Escape");

await browser.close();
if (errors.length) {
  console.log("\nPAGE ERRORS:");
  for (const e of errors) console.log("  " + e);
  process.exit(1);
}
console.log("\nno page errors");
