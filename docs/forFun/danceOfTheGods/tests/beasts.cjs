const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const manifest = require("../assets/gen/beasts/prompts.json");
const gameURL = process.env.DANCE_URL || "http://127.0.0.1:18765/";
const output =
  process.env.DANCE_QA_DIR || path.join(os.tmpdir(), "dance-of-the-gods-qa");
fs.mkdirSync(output, { recursive: true });
let browser;
(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(gameURL + "#bestiary");
  await page.waitForFunction(
    () =>
      Object.values(genArt).length === 12 &&
      Object.values(genArt).every((a) => a.status === "ready"),
  );
  assert.equal(await page.locator(".beast-card").count(), 12);
  // The game renderer must preserve source alpha, especially dark eyes and wisps.
  const portraits = await page.evaluate(async () => {
    const results = [];
    for (const [key, species] of Object.entries(SPECIES)) {
      const img = new Image();
      img.src = beastArtURL(key);
      await img.decode();
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      cv.getContext("2d").drawImage(img, 0, 0);
      const src = cv
        .getContext("2d")
        .getImageData(0, 0, cv.width, cv.height).data;
      const dst = genArt[key].canvas
        .getContext("2d")
        .getImageData(0, 0, cv.width, cv.height).data;
      let changed = 0,
        transparent = 0,
        translucent = 0,
        dark = 0;
      for (let i = 0; i < src.length; i += 4) {
        if (src[i + 3] === 0) transparent++;
        else if (src[i + 3] < 255) translucent++;
        if (
          src[i] < 70 &&
          src[i + 1] < 70 &&
          src[i + 2] < 70 &&
          src[i + 3] > 240
        )
          dark++;
        if ([0, 1, 2, 3].some((c) => src[i + c] !== dst[i + c])) changed++;
      }
      results.push({
        key,
        name: species.name,
        dom: species.dom,
        changed,
        transparent,
        translucent,
        dark,
        width: cv.width,
      });
    }
    document
      .querySelectorAll(".beast-art img")
      .forEach((img) => (img.loading = "eager"));
    await Promise.all(
      [...document.querySelectorAll(".beast-art img")].map((img) =>
        img.decode(),
      ),
    );
    return results;
  });
  for (const b of manifest.beasts) {
    const p = portraits.find((p) => p.key === b.key);
    assert.equal(p.name, b.name);
    assert.equal(p.dom, b.dom);
    assert.equal(p.changed, 0, `${b.name}: renderer altered pixels`);
    assert.ok(
      p.width >= 1000 &&
        p.transparent > 10000 &&
        p.translucent > 0 &&
        p.dark > 0,
      `${b.name}: expected full-resolution transparent illustration`,
    );
  }
  await page.screenshot({
    path: path.join(output, "beasts-desktop.png"),
    fullPage: true,
  });
  await page
    .locator(".beast-card")
    .filter({ hasText: "Lyretto" })
    .locator("summary")
    .click();
  assert.match(
    await page
      .locator(".beast-card")
      .filter({ hasText: "Lyretto" })
      .innerText(),
    /Hermes/,
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page.locator(".screen.active").getAttribute("id"),
    "title-screen",
  );
  assert.equal(await page.evaluate(() => location.hash), "");
  assert.equal(await page.evaluate(() => state.seen.length), 0);
  // Repainting late-arriving artwork must not undo the user's starter choice.
  await page.evaluate(() => {
    buildStarterPick();
    show("pick-screen");
  });
  await page.locator('[data-beast="peeplet"]').click();
  await page.evaluate(() => artRefresh());
  assert.equal(await page.locator("#fight-btn").innerText(), "Take Brontlet");
  assert.equal(
    await page.locator('[data-beast="peeplet"]').getAttribute("aria-pressed"),
    "true",
  );
  await page.screenshot({
    path: path.join(output, "beasts-starters.png"),
    fullPage: true,
  });
  // Browsing from the journal leaves progression, collection, and party intact.
  await page.evaluate(() => {
    saveEnabled = false;
    resetWorld();
    state.team = [makeCreature("pupnos", 8), makeCreature("piglos", 32)];
    state.ow.flags = { wellSong: true };
    state.seen = ["pupnos"];
    enterOverworld("village", 8, 12, "up");
    openJournal();
  });
  const before = await page.evaluate(() =>
    JSON.stringify({ ...makeSave(), at: 0 }),
  );
  await page.locator("#journal-bestiary").click();
  await page.locator("#bestiary-close").click();
  assert.equal(
    await page.locator(".screen.active").getAttribute("id"),
    "journal-screen",
  );
  assert.equal(
    await page.evaluate(() => JSON.stringify({ ...makeSave(), at: 0 })),
    before,
  );
  const names = await page.evaluate(() => {
    const old = makeSave();
    old.team[0].name = "Pupnos";
    applySave(validateSave(old));
    return state.team.map((c) => c.name);
  });
  assert.deepEqual(names, ["Wickpup", "Phalanboar"]);
  await page.evaluate(() => {
    owActive = false;
    renderParty();
    show("party-screen");
  });
  await page.screenshot({
    path: path.join(output, "beasts-party.png"),
    fullPage: true,
  });
  await page.evaluate(() => {
    state.settings.fastText = true;
    beginBattle({
      mode: "wild",
      canCatch: true,
      canFlee: true,
      foeTeam: [makeCreature("seedviper", 8)],
      intro: [],
      onEnd: () => {},
    });
  });
  await page.waitForFunction(() => !state.busy);
  await page.screenshot({
    path: path.join(output, "beasts-battle.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(gameURL + "#bestiary");
  await page.reload();
  assert.equal(
    await page.locator(".screen.active").getAttribute("id"),
    "bestiary-screen",
  );
  await page
    .locator(".beast-art img")
    .first()
    .evaluate((img) => img.decode());
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({ path: path.join(output, "beasts-mobile.png") });
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    buildStarterPick();
    show("pick-screen");
  });
  await page.waitForFunction(() =>
    STARTERS.every((key) => genArt[key]?.status === "ready"),
  );
  await page.screenshot({
    path: path.join(output, "beasts-starters-mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "All twelve portraits preserve alpha, dark details, names, and domains. Field guide, starter selection, journal return, save migration, battle, party, and mobile checks passed.",
  );
  console.log(`Screenshots: ${output}`);
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
  });
