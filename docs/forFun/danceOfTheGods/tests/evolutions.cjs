const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const manifest = require("../assets/gen/beasts/evolutions/prompts.json");
const gameURL = process.env.DANCE_URL || "http://127.0.0.1:18765/";
const output =
  process.env.DANCE_QA_DIR || path.join(os.tmpdir(), "dance-of-the-gods-qa");
fs.mkdirSync(output, { recursive: true });
let browser;
(async () => {
  assert.equal(manifest.beasts.length, 24);
  assert.equal(
    new Set(
      manifest.beasts.map((b) =>
        crypto
          .createHash("sha256")
          .update(fs.readFileSync(path.join(__dirname, "..", b.file)))
          .digest("hex"),
      ),
    ).size,
    24,
    "Each evolution has its own image",
  );
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [],
    missing = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) missing.push(r.url());
  });
  await page.goto(gameURL + "?v=5#bestiary");
  await page.evaluate(() =>
    Object.keys(SPECIES).forEach((key) => {
      loadGenArt(key, "back");
      [1, 2].forEach((stage) => loadEvolutionArt(key, stage));
    }),
  );
  await page.waitForFunction(
    () =>
      Object.keys(evolutionArt).length === 24 &&
      [
        ...Object.values(evolutionArt),
        ...Object.values(genBackArt),
        ...Object.values(genArt),
      ].every((a) => a.status === "ready"),
  );
  const pixels = await page.evaluate(() =>
    Object.entries(evolutionArt).map(([key, art]) => {
      const { width, height } = art.canvas;
      const data = art.canvas
        .getContext("2d")
        .getImageData(0, 0, width, height).data;
      let clear = 0,
        solid = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] === 0) clear++;
        if (data[i] >= 240) solid++;
      }
      return { key, clear, solid };
    }),
  );
  assert.ok(
    pixels.every((p) => p.clear > 10000 && p.solid > 10000),
    "Every evolution is a real transparent cutout",
  );
  const allNames = new Set();
  for (const stage of [0, 1, 2]) {
    await page.locator(`#bestiary-stage-${stage}`).click();
    await page.evaluate(async () => {
      const images = [...document.querySelectorAll(".beast-art img")];
      images.forEach((img) => (img.loading = "eager"));
      await Promise.all(images.map((img) => img.decode()));
    });
    assert.equal(await page.locator(".beast-card").count(), 12);
    assert.equal(await page.locator("#bestiary-back").isDisabled(), stage > 0);
    const cards = await page
      .locator(".beast-card")
      .evaluateAll((cards) =>
        cards.map((c) => ({
          key: c.dataset.species,
          name: c.querySelector("h3").textContent,
          src: c.querySelector("img").getAttribute("src"),
        })),
      );
    for (const card of cards) {
      allNames.add(card.name);
      if (stage) {
        const b = manifest.beasts.find(
          (b) => b.key === card.key && b.stage === stage,
        );
        assert.equal(card.name, b.name);
        assert.ok(card.src.startsWith(b.file));
      }
    }
    await page.screenshot({
      path: path.join(output, `evolutions-stage-${stage}.png`),
      fullPage: true,
    });
  }
  assert.equal(allNames.size, 36);
  const selection = await page.evaluate(() => {
    const cv = document.createElement("canvas"),
      ctx = cv.getContext("2d");
    let chosen;
    ctx.drawImage = (img) => {
      chosen =
        Object.entries(evolutionArt).find(([, a]) => a.canvas === img)?.[0] ||
        (Object.values(genBackArt).some((a) => a.canvas === img)
          ? "base-back"
          : "base-front");
    };
    const checks = [];
    for (const key of Object.keys(SPECIES))
      for (const level of [15, 16, 31, 32])
        for (const view of ["front", "back"]) {
          const c = makeCreature(key, level);
          drawCreature(ctx, c, 0, 0, 1, false, 1, view);
          checks.push({ key, level, view, chosen });
        }
    const c = makeCreature("seedviper", 15);
    gainXp(c, xpToNext(15));
    drawCreature(ctx, c, 0, 0, 1, false, 1, "back");
    const first = { name: c.name, chosen };
    c.level = 31;
    c.xp = 0;
    gainXp(c, xpToNext(31));
    drawCreature(ctx, c, 0, 0, 1, false, 1, "back");
    return { checks, first, final: { name: c.name, chosen } };
  });
  for (const x of selection.checks)
    assert.equal(
      x.chosen,
      x.level < 16 ? `base-${x.view}` : `${x.key}-${x.level < 32 ? 1 : 2}`,
    );
  assert.deepEqual(selection.first, {
    name: "Granibble",
    chosen: "seedviper-1",
  });
  assert.deepEqual(selection.final, {
    name: "Thesmora",
    chosen: "seedviper-2",
  });
  await page.evaluate(() => {
    saveEnabled = false;
    resetWorld();
    state.team = [makeCreature("seedviper", 32), makeCreature("peeplet", 16)];
    state.caught = [];
    enterOverworld("village", 8, 10, "down");
    saveEnabled = true;
    saveGame();
    // Old serialized sprite/name fields must not override the new family identity.
    const sv = JSON.parse(localStorage.getItem(SAVE_KEY));
    sv.team[0].sprite = "grainsnake";
    sv.team[0].name = "Ophis Karpos";
    localStorage.setItem(SAVE_KEY, JSON.stringify(sv));
  });
  await page.reload();
  const restored = await page.evaluate(() => {
    loadGame();
    return state.team.map((c) => ({
      name: c.name,
      sprite: c.sprite,
      level: c.level,
    }));
  });
  assert.deepEqual(restored[0], {
    name: "Thesmora",
    sprite: "harvestmouse",
    level: 32,
  });
  const party = await page.evaluate(() => {
    const drawn = [],
      original = artDraw;
    artDraw = function (ctx, key, sprite, acc, view, stage) {
      drawn.push({ key, stage });
      return original(ctx, key, sprite, acc, view, stage);
    };
    try {
      show("party-screen");
      renderParty();
    } finally {
      artDraw = original;
    }
    return drawn;
  });
  assert.ok(party.some((x) => x.key === "seedviper" && x.stage === 2));
  assert.ok(party.some((x) => x.key === "peeplet" && x.stage === 1));
  await page.evaluate(() => {
    state.foeTeam = [makeCreature("slithra", 32)];
    loadEvolutionArt("slithra", 2);
  });
  await page.waitForFunction(() =>
    ["seedviper-2", "slithra-2", "peeplet-1"].every(
      (k) => evolutionArt[k]?.status === "ready",
    ),
  );
  const battle = await page.evaluate(() => {
    state.allyIdx = 0;
    state.foeIdx = 0;
    state.anim = {};
    const drawn = [],
      original = bctx.drawImage;
    bctx.drawImage = function (img, ...args) {
      drawn.push(
        Object.entries(evolutionArt).find(([, a]) => a.canvas === img)?.[0],
      );
      return original.call(this, img, ...args);
    };
    try {
      drawSide("ally", 216, 150, 1.15, true);
      drawSide("foe", 251, 46, 0.95, false);
    } finally {
      bctx.drawImage = original;
    }
    owActive = false;
    show("battle-screen");
    refreshHp();
    renderStage();
    return drawn;
  });
  assert.deepEqual(battle, ["seedviper-2", "slithra-2"]);
  await page
    .locator("#battle-stage")
    .screenshot({ path: path.join(output, "evolution-battle.png") });
  await page.evaluate(() => {
    owActive = false;
    show("title-screen");
    openBestiary();
    setBestiaryStage(2);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    const images = [...document.querySelectorAll(".beast-art img")];
    images.forEach((img) => (img.loading = "eager"));
    await Promise.all(images.map((img) => img.decode()));
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
    "No horizontal mobile overflow",
  );
  await page.screenshot({
    path: path.join(output, "evolutions-mobile.png"),
    fullPage: true,
  });
  const harvest = page.locator('.beast-card[data-species="seedviper"]');
  await harvest.locator("summary").click();
  await harvest.locator('button[data-form="0"]').click();
  assert.equal(await harvest.locator("h3").textContent(), "Sheafang");
  assert.equal(await page.locator("#bestiary-back").isEnabled(), true);
  await harvest.locator('button[data-form="1"]').click();
  assert.equal(await harvest.locator("h3").textContent(), "Granibble");
  assert.equal(await page.locator("#bestiary-back").isDisabled(), true);
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .locator("#title-screen")
      .evaluate((e) => e.classList.contains("active")),
    true,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(missing, []);
  console.log(
    "✓ 24 unique transparent portraits; 36 guide forms; stage controls and mobile layout",
  );
  console.log(
    "✓ Level 15/16/31/32 art, XP awakenings, migrated saves, party and both battle sides",
  );
  console.log(`Screenshots: ${output}`);
  await browser.close();
})().catch(async (e) => {
  console.error(e);
  await browser?.close();
  process.exitCode = 1;
});
