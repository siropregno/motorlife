import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "tools/shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto("http://localhost:5177/", { waitUntil: "networkidle" });

// --- garage ---------------------------------------------------------------
await page.waitForSelector(".car-card");
const cards = await page.locator(".car-card").count();
const confidences = await page.locator(".card-confidence").allInnerTexts();
await page.screenshot({ path: `${OUT}/1-garage.png`, fullPage: true });
console.log(`garage: ${cards} cards, confidence tags: ${confidences.join(", ")}`);

// pick the Renault, the one with no published 0-100
await page.getByRole("button", { name: /R12 TL/ }).click();
await page.getByRole("button", { name: /Set up/ }).click();

// --- setup ----------------------------------------------------------------
await page.waitForSelector(".laptime");
const lapBefore = (await page.locator(".laptime").innerText()).trim();
const cda = (await page.locator(".stats dd").first().innerText()).trim();
await page.screenshot({ path: `${OUT}/2-setup.png`, fullPage: true });
console.log(`setup: lap ${lapBefore}, derived CdA ${cda}`);

// drag the aero slider and confirm the predicted lap actually recomputes
const aero = page.getByLabel("Aero");
await aero.fill("1");
await page.waitForTimeout(120);
const lapAfter = (await page.locator(".laptime").innerText()).trim();
const delta = (await page.locator(".laptime-delta").innerText()).trim();
console.log(`setup: aero +1.00 -> lap ${lapAfter} (${delta})`);
if (lapBefore === lapAfter) errors.push("predicted lap did not change when aero moved");
await page.screenshot({ path: `${OUT}/3-setup-aero.png`, fullPage: true });

// pick the twisty circuit, where more wing should pay
await page.getByRole("button", { name: /No\. 6/ }).click();
await page.waitForTimeout(120);
console.log(`setup: on Galvez No.6 -> ${(await page.locator(".laptime").innerText()).trim()}`);

// --- race -----------------------------------------------------------------
await page.getByRole("button", { name: /Race/ }).click();
await page.waitForSelector(".tower-row");
await page.waitForTimeout(4200); // let a few laps tick over
const lap = (await page.locator(".tower-lap").innerText()).trim();
const rows = await page.locator(".tower-row").count();
const feed = await page.locator(".tower-feed div").allInnerTexts();
await page.screenshot({ path: `${OUT}/4-race.png`, fullPage: true });
console.log(`race: ${rows} rows, ${lap}`);
console.log(`feed: ${feed.join(" | ") || "(empty)"}`);

// skip to the flag and capture the classification
await page.getByRole("button", { name: /Skip to flag/ }).click();
await page.waitForTimeout(900);
const finalRows = await page.locator(".tower-row").allInnerTexts();
await page.screenshot({ path: `${OUT}/5-flag.png`, fullPage: true });
console.log("final order:");
for (const r of finalRows) console.log("   " + r.replace(/\n/g, "  "));

await browser.close();
if (errors.length) {
  console.log("\nPAGE ERRORS:");
  for (const e of errors) console.log("  " + e);
  process.exit(1);
}
console.log("\nno page errors");
