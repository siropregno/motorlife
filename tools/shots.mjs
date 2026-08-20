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
console.log(`        selected car ${(await page.locator(".topcar").innerText()).replace(/\s+/g, " ")}`);
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
await page.waitForSelector(".laptime");
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
await page.screenshot({ path: `${OUT}/4-shop-rich.png`, fullPage: true });
await page.locator(".shop-buy .btn").first().click();
await page.waitForTimeout(300);
const after = await page.locator(".shop-item").count();
console.log(`buy:    stock ${before} -> ${after}, wallet ${(await wallet()).replace(/\s+/g, " ")}`);
await page.getByRole("button", { name: /Garage/ }).click();
await page.waitForSelector(".car-card");
console.log(`garage: ${await page.locator(".car-card").count()} owned after purchase`);
await page.screenshot({ path: `${OUT}/5-garage-two.png`, fullPage: true });

// --- right-click menu: drive it, sell the second car ----------------------
await page.locator(".car-card").nth(1).click({ button: "right" });
await page.waitForSelector(".ctx");
console.log(`menu:   ${(await page.locator(".ctx-item").allInnerTexts()).map((t) => t.replace(/\s+/g, " ")).join(" | ")}`);
await page.screenshot({ path: `${OUT}/6-menu.png`, fullPage: true });

// first click arms, it must NOT have sold anything yet
await page.getByRole("menuitem", { name: /Vender/ }).click();
await page.waitForSelector(".ctx-item.armed");
const armedLabel = (await page.locator(".ctx-item.armed").innerText()).replace(/\s+/g, " ");
const stillOwned = await page.locator(".car-card").count();
console.log(`arm:    "${armedLabel}", still ${stillOwned} owned (must be 2)`);
await page.screenshot({ path: `${OUT}/7-menu-armed.png`, fullPage: true });
if (stillOwned !== 2) errors.push(`sell fired on the first click, before confirming`);

const beforeSell = await wallet();
await page.locator(".ctx-item.armed").click();
await page.waitForTimeout(300);
const leftInGarage = await page.locator(".car-card").count();
console.log(`sell:   ${stillOwned} -> ${leftInGarage} owned, wallet ${beforeSell.replace(/\s+/g, " ")} -> ${(await wallet()).replace(/\s+/g, " ")}`);
if (leftInGarage !== 1) errors.push(`confirm did not sell: ${leftInGarage} cars left`);
if (await page.locator(".ctx").count()) errors.push("menu stayed open after picking");
await page.screenshot({ path: `${OUT}/8-garage-sold.png`, fullPage: true });

// the last car is not for sale, and the menu must say why
await page.locator(".car-card").first().click({ button: "right" });
await page.waitForSelector(".ctx");
const sellItem = page.getByRole("menuitem", { name: /Vender/ });
console.log(`last:   "${(await sellItem.innerText()).replace(/\s+/g, " ")}" disabled=${await sellItem.isDisabled()}`);
if (!(await sellItem.isDisabled())) errors.push("your last car was sellable");
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
if (await page.locator(".ctx").count()) errors.push("Escape did not close the menu");

// "Subirse al auto" takes you to setup with that car
await page.locator(".car-card").first().click({ button: "right" });
await page.getByRole("menuitem", { name: "Subirse al auto" }).click();
await page.waitForSelector(".laptime");
console.log(`drive:  setup screen, ${(await page.locator(".topcar").innerText()).replace(/\s+/g, " ")}`);

await browser.close();
if (errors.length) {
  console.log("\nPAGE ERRORS:");
  for (const e of errors) console.log("  " + e);
  process.exit(1);
}
console.log("\nno page errors");
