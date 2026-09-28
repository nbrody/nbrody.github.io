// Screenshot an SVG/HTML file with the preinstalled Chromium: node tests/snap.mjs in.svg out.png [width height]
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const [inp, out, w = 1100, h = 1600] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--disable-gpu'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto('file://' + (await import('node:path')).resolve(inp));
await p.screenshot({ path: out, timeout: 60000 });
await b.close();
