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

async function measure(label) {
  await p.evaluate(() => {
    window.__f = []; window.__go = true;
    const tick = (t) => { window.__f.push(t); if (window.__go) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await p.locator(".car-card.menuable").first().click();
  await p.waitForTimeout(600);
  await p.evaluate(() => { window.__go = false; });
  const f = await p.evaluate(() => window.__f);
  const gaps = []; for (let i=1;i<f.length;i++) gaps.push(f[i]-f[i-1]);
  gaps.sort((a,c)=>a-c);
  console.log(`${label}\n   ${(f.length/((f[f.length-1]-f[0])/1000)).toFixed(1)} fps   worst ${gaps[gaps.length-1]?.toFixed(1)}ms   janky ${gaps.filter(g=>g>20).length}/${gaps.length}`);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(700);
}

// How big are the images actually being decoded behind the blur?
const imgs = await p.$$eval(".card-car img", (els) => els.map((e) => ({
  src: e.currentSrc.split("/").pop(),
  natural: `${e.naturalWidth}x${e.naturalHeight}`,
  drawn: `${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`,
})));
console.log("IMAGES BEHIND THE BLUR:");
for (const i of imgs) console.log(`   ${i.src.padEnd(34)} natural ${i.natural.padEnd(12)} drawn ${i.drawn}`);

console.log("");
await measure("as shipped (blur 2px animated)");

// Keep the blur, but make it static instead of animated.
await p.addStyleTag({ content: `
  .modal::backdrop { backdrop-filter: blur(2px) !important; }
  .modal[open]::backdrop { backdrop-filter: blur(2px) !important; }
`});
await measure("blur kept, but NOT animated");
await b.close();
