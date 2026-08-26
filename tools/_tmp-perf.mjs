import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.addInitScript((s) => { try { localStorage.setItem("motorlife.save", JSON.stringify(s)); } catch {} }, {
  version: 3, credits: 120000, racesRun: 4,
  owned: [
    { id: "renault-12-tl", km: 214000, color: "light-blue" },
    { id: "peugeot-504-tn", km: 293800 },
    { id: "chevrolet-chevy-250", km: 317500 },
    { id: "ford-f100", km: 180000 },
    { id: "renault-torino-zx", km: 150000 },
    { id: "ford-falcon-sprint", km: 120000 },
  ],
});
await p.goto("http://localhost:5199");
await p.waitForSelector(".car-card");
await p.waitForTimeout(1200);

// Count real presented frames across the open, using rAF timestamps.
async function measure(label) {
  await p.evaluate(() => {
    window.__f = [];
    const tick = (t) => { window.__f.push(t); if (window.__go) requestAnimationFrame(tick); };
    window.__go = true;
    requestAnimationFrame(tick);
  });
  await p.locator(".car-card.menuable").first().click();
  await p.waitForTimeout(600);
  await p.evaluate(() => { window.__go = false; });
  const f = await p.evaluate(() => window.__f);
  const gaps = [];
  for (let i = 1; i < f.length; i++) gaps.push(f[i] - f[i - 1]);
  gaps.sort((a, c) => a - c);
  const long = gaps.filter((g) => g > 20).length;
  console.log(`${label}
   frames=${f.length} over ${Math.round(f[f.length-1]-f[0])}ms  ->  ${(f.length/((f[f.length-1]-f[0])/1000)).toFixed(1)} fps
   median gap ${gaps[Math.floor(gaps.length/2)]?.toFixed(1)}ms   p95 ${gaps[Math.floor(gaps.length*0.95)]?.toFixed(1)}ms   worst ${gaps[gaps.length-1]?.toFixed(1)}ms
   janky frames (>20ms): ${long}/${gaps.length}`);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(700);
}

await measure("AS SHIPPED");

// Now kill the backdrop blur only, and re-measure.
await p.addStyleTag({ content: `
  .modal::backdrop, .modal[open]::backdrop { backdrop-filter: none !important; transition: background-color var(--dur-move) var(--ease-out), overlay var(--dur-move) allow-discrete, display var(--dur-move) allow-discrete !important; }
`});
await measure("WITHOUT the animated backdrop blur");

await b.close();
