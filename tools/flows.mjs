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
  check(
    "it offers the three things you can do with a car you own",
    (await page.locator(".modal-acts .btn").allTextContents()).join(" | "),
    "Subirse al auto | Repintar | Vender",
  );

  console.log("\nrepainting");
  await page.getByRole("button", { name: "Repintar" }).click();
  await page.waitForSelector(".paint-swatches");
  check(
    "every colour is offered, and the one it wears is dead",
    await page.locator(".paint-chip").evaluateAll((els) =>
      els.map((e) => `${e.textContent}${e.disabled ? "*" : ""}`).join(" ")),
    "Negro* Rojo Blanco Amarillo",
  );
  const walletBefore = await wallet();
  await page.locator(".paint-chip", { hasText: "Amarillo" }).click();
  check("the hero previews the colour", await page.locator(".modal-hero img").getAttribute("src"), "/bmw-m3-e30-yellow.png");
  check("previewing is free", await wallet(), walletBefore);
  check("the confirm says what it costs", await page.locator(".modal-acts .btn").last().innerText(), "PINTAR POR 5.700 CR");

  await page.locator(".modal-acts .btn").last().click();
  await page.waitForSelector(".paint-swatches", { state: "detached" });
  check("paying charges exactly that", await wallet(), "114.300CR");
  check("the sheet keeps the new colour", await page.locator(".modal-hero img").getAttribute("src"), "/bmw-m3-e30-yellow.png");
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
      els.map((e) => `${e.textContent}${e.disabled ? "*" : ""}`).join(" | ")),
    "Subirse al auto | Repintar* | Vender",
  );
  await page.locator(".modal-x").click();
  await page.waitForSelector("dialog.modal", { state: "detached" });

  console.log("\nselling");
  await card("Chevy 250").click();
  await page.waitForSelector("dialog.modal");
  const sell = page.locator(".modal-acts .btn").last();
  await sell.click();
  check("the first click only arms it", await sell.innerText(), "VENDER POR 7.300 CR");
  check("and sells nothing", await wallet(), "114.300CR");
  await sell.click();
  await page.waitForSelector("dialog.modal", { state: "detached" });
  check("the second click sells", await wallet(), "121.600CR");
  check("and the car is gone", await page.locator(".car-card").count(), 2);

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

  check("nothing 404ed and nothing threw", noise.join(", "), "");
} finally {
  await browser.close();
}

console.log(`\n${checks - failures.length}/${checks} checks passed.`);
if (failures.length) {
  console.log(`\n${failures.length} failed:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
