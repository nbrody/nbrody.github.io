const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const manifest = require("../assets/gen/gods/prompts.json");
const gameURL = process.env.DANCE_URL || "http://127.0.0.1:18765/";
const output =
  process.env.DANCE_QA_DIR || path.join(os.tmpdir(), "dance-of-the-gods-qa");
fs.mkdirSync(output, { recursive: true });
let browser;
(async () => {
  assert.equal(manifest.gods.length, 12);
  const hashes = manifest.gods.map((g) =>
    crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(__dirname, "..", g.file)))
      .digest("hex"),
  );
  assert.equal(new Set(hashes).size, 12, "Every Olympian has distinct artwork");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1400 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().startsWith(gameURL) && response.status() >= 400)
      errors.push(response.status() + " " + response.url());
  });
  await page.goto(gameURL + "#gods");
  assert.equal(await page.locator("#pantheon-screen.active").count(), 1);
  assert.equal(await page.locator(".god-card").count(), 12);
  assert.equal(await page.locator(".god-companion").count(), 36);
  const before = await page.evaluate(() => JSON.stringify(localStorage));
  const art = await page.evaluate(async () => {
    const images = [...document.querySelectorAll("#pantheon-grid img")];
    images.forEach((img) => (img.loading = "eager"));
    await Promise.all(images.map((img) => img.decode()));
    return OLYMPIANS.map((g) => {
      const img = document.querySelector(`[data-god="${g.id}"] .god-art img`);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      const pixels = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0,
        opaque = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] === 0) transparent++;
        if (pixels[i] >= 240) opaque++;
      }
      return {
        name: g.name,
        domain: g.domain,
        expected: DOMAINS[SPECIES[g.beast].dom].god,
        transparent,
        opaque,
        width: canvas.width,
        height: canvas.height,
      };
    });
  });
  for (const p of art) {
    assert.equal(
      p.name,
      p.expected,
      "Patron must match the beast's existing domain",
    );
    assert.ok(
      p.transparent > 10000 && p.opaque > 10000 && p.width >= 1000,
      p.name + ": expected a high-resolution transparent portrait",
    );
  }
  await page.screenshot({ path: path.join(output, "pantheon-desktop.png") });
  await page.locator('[data-god-jump="demeter"]').click();
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent),
    "Demeter",
  );
  await page
    .locator('[data-god="demeter"]')
    .screenshot({ path: path.join(output, "pantheon-demeter.png") });
  await page.locator('[data-god="demeter"] [data-stage="2"]').click();
  assert.equal(await page.locator("#bestiary-screen.active").count(), 1);
  assert.equal(
    await page.locator('[data-species="seedviper"] h3').textContent(),
    "Thesmora",
  );
  await page
    .locator('[data-species="seedviper"] [data-patron="demeter"]')
    .click();
  assert.equal(await page.locator("#pantheon-screen.active").count(), 1);
  assert.equal(
    await page.locator("#pantheon-close").textContent(),
    "Back to the beasts",
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#bestiary-screen.active").count(), 1);
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.patron),
    "demeter",
  );
  assert.equal(
    await page.locator("#bestiary-stage-2").getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#bestiary-close").click();
  await page.locator("#pantheon-open").click();
  await page.locator("#pantheon-close").click();
  assert.equal(await page.locator("#title-screen.active").count(), 1);
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "pantheon-open",
  );
  assert.equal(await page.evaluate(() => location.hash), "");
  // Journal entry must return to the journal, without starting or altering a journey.
  await page.evaluate(() => show("journal-screen"));
  await page.locator("#journal-pantheon").click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#journal-screen.active").count(), 1);
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "journal-pantheon",
  );
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), before);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(gameURL + "#gods");
  await page.locator("#pantheon-screen.active").waitFor();
  await page.evaluate(async () => {
    const images = [...document.querySelectorAll("#pantheon-grid img")];
    images.forEach((img) => (img.loading = "eager"));
    await Promise.all(images.map((img) => img.decode()));
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: path.join(output, "pantheon-mobile.png") });
  await page.locator('[data-god-jump="dionysus"]').click();
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent),
    "Dionysus",
  );
  await page.locator('[data-god="dionysus"] [data-stage="0"]').click();
  assert.equal(
    await page.locator('[data-species="cubvine"] h3').textContent(),
    "Revelcub",
  );
  assert.deepEqual(errors, []);
  console.log(
    "✓ 12 distinct transparent Olympians, 36 matching companions, desktop and mobile",
  );
  console.log(
    "✓ Patron/family navigation, keyboard focus, journal return, and unchanged saves",
  );
  console.log("Screenshots:", output);
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
  });
