const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const gameURL = process.env.DANCE_URL || "http://127.0.0.1:18765/";
const output =
  process.env.DANCE_QA_DIR || path.join(os.tmpdir(), "dance-of-the-gods-qa");
fs.mkdirSync(output, { recursive: true });
let browser;
(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(gameURL);
  await page.waitForFunction(() =>
    ["calfin", "fawnling", ...WORLD_KEEPER_KEYS].every(
      (key) => worldArt[key]?.status === "ready",
    ),
  );
  const worldSources = await page.evaluate(() => {
    const cv = document.createElement("canvas"),
      ctx = cv.getContext("2d");
    const source = ctx.drawImage;
    const drawn = [];
    ctx.drawImage = function (img, ...args) {
      drawn.push(
        Object.entries(worldArt).find(([, art]) => art.canvas === img)?.[0],
      );
      return source.call(this, img, ...args);
    };
    drawWorldBeast(ctx, "calfin");
    drawWorldBeast(ctx, "fawnling");
    ["down", "up", "left", "right"].forEach((dir) =>
      drawKeeperFigure(ctx, dir),
    );
    return drawn;
  });
  assert.deepEqual(worldSources, [
    "calfin",
    "fawnling",
    "orpheus-down",
    "orpheus-up",
    "orpheus-left",
    "orpheus-left",
  ]);
  const worldFallback = await page.evaluate(() => {
    const current = worldArt.calfin;
    const ctx = document.createElement("canvas").getContext("2d");
    let portrait = false;
    ctx.drawImage = (image) => {
      portrait = image === genArt.calfin.canvas;
    };
    try {
      worldArt.calfin = { status: "missing" };
      drawWorldBeast(ctx, "calfin");
    } finally {
      worldArt.calfin = current;
    }
    return portrait;
  });
  assert.equal(
    worldFallback,
    true,
    "A missing world sprite uses its full-color portrait",
  );
  // Neither world scene may accidentally pull the high-detail portrait renderer.
  await page.evaluate(() => {
    const portrait = artDraw;
    artDraw = () => {
      throw Error("Portrait used in a world scene");
    };
    try {
      drawTitleLandscape();
      saveEnabled = false;
      resetWorld();
      state.team = [makeCreature("peeplet", 8)];
      state.ow.flags = {};
      enterOverworld("route", 5, 15, "down");
      renderOverworld(1000);
    } finally {
      artDraw = portrait;
    }
  });
  await page.screenshot({
    path: path.join(output, "world-illustrated.png"),
    fullPage: true,
  });
  const keeper = await page.evaluate(() => {
    return ["down", "up", "left", "right"].map((direction) => {
      const cv = document.createElement("canvas");
      cv.width = 110;
      cv.height = 144;
      const ctx = cv.getContext("2d");
      drawKeeperFigure(ctx, direction, 0);
      const pixels = ctx.getImageData(0, 0, 110, 144).data;
      return {
        direction,
        visible: pixels.filter((v, i) => i % 4 === 3 && v > 128).length,
        signature: cv.toDataURL(),
      };
    });
  });
  assert.ok(
    keeper.every((pose) => pose.visible > 2500),
    "Every Orpheus direction must actually draw",
  );
  assert.equal(new Set(keeper.map((pose) => pose.signature)).size, 4);
  await page.evaluate(() => {
    owActive = false;
    show("title-screen");
    drawTitleLandscape();
  });
  await page.screenshot({
    path: path.join(output, "homepage-illustrated.png"),
    fullPage: true,
  });
  await page.evaluate(() =>
    Object.keys(SPECIES).forEach((key) => loadGenArt(key, "back")),
  );
  await page.waitForFunction(
    () =>
      Object.values(genBackArt).length === 12 &&
      Object.values(genBackArt).every((a) => a.status === "ready"),
  );
  const backs = await page.evaluate(async () => {
    const entries = [
      ...Object.keys(SPECIES).map((key) => ({
        key,
        url: beastArtURL(key, "back"),
        art: genBackArt[key],
      })),
      ...Object.keys(worldArt).map((key) => ({
        key,
        url: worldArtURL(key),
        art: worldArt[key],
      })),
    ];
    return await Promise.all(
      entries.map(async ({ key, url, art }) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const cv = document.createElement("canvas");
        cv.width = img.naturalWidth;
        cv.height = img.naturalHeight;
        const ctx = cv.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
        let clear = 0,
          solid = 0;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] === 0) clear++;
          if (data[i] >= 240) solid++;
        }
        return {
          key,
          clear,
          solid,
          preserved: cv.toDataURL() === art.canvas.toDataURL(),
        };
      }),
    );
  });
  assert.ok(
    backs.every((b) => b.clear > 10000 && b.solid > 10000 && b.preserved),
    "All rear and world assets must have genuine alpha preserved by the loader",
  );
  await page.locator("#bestiary-open").click();
  await page.locator("#bestiary-back").click();
  assert.equal(
    await page.locator("#bestiary-back").getAttribute("aria-pressed"),
    "true",
  );
  await page.evaluate(async () => {
    document
      .querySelectorAll(".beast-art img")
      .forEach((img) => (img.loading = "eager"));
    await Promise.all(
      [...document.querySelectorAll(".beast-art img")].map((img) =>
        img.decode(),
      ),
    );
  });
  assert.equal(
    await page.locator('.beast-art img[alt$="seen from behind"]').count(),
    12,
  );
  await page.screenshot({
    path: path.join(output, "rear-field-guide.png"),
    fullPage: true,
  });
  await page.locator("#bestiary-front").click();
  assert.equal(
    await page.locator("#bestiary-front").getAttribute("aria-pressed"),
    "true",
  );
  // Verify both battle sides select the correct image, and a missing back degrades safely.
  const rendering = await page.evaluate(() => {
    state.team = [makeCreature("peeplet", 8), makeCreature("calfin", 8)];
    state.foeTeam = [makeCreature("slithra", 8)];
    state.allyIdx = 0;
    state.foeIdx = 0;
    state.anim = {};
    const drawn = [];
    const original = bctx.drawImage;
    bctx.drawImage = function (img, ...args) {
      drawn.push(
        img === genBackArt.peeplet.canvas
          ? "ally-back"
          : img === genArt.slithra.canvas
            ? "foe-front"
            : "unexpected",
      );
      return original.call(this, img, ...args);
    };
    try {
      drawSide("ally", 216, 150, 1.15, true);
      drawSide("foe", 251, 46, 0.95, false);
    } finally {
      bctx.drawImage = original;
    }
    const back = genBackArt.calfin;
    genBackArt.calfin = { status: "missing" };
    const cv = document.createElement("canvas"),
      ctx = cv.getContext("2d");
    const draw = ctx.drawImage;
    let fallback = false;
    ctx.drawImage = function (img, ...args) {
      fallback = img === genArt.calfin.canvas;
      return draw.call(this, img, ...args);
    };
    try {
      artDraw(ctx, "calfin", "bull", DOMAINS.Sea.color, "back");
    } finally {
      genBackArt.calfin = back;
    }
    return { drawn, fallback };
  });
  assert.deepEqual(rendering.drawn, ["ally-back", "foe-front"]);
  assert.equal(rendering.fallback, true);
  await page.evaluate(() => {
    state.settings.fastText = true;
    beginBattle({
      mode: "wild",
      canCatch: true,
      canFlee: true,
      foeTeam: [makeCreature("slithra", 8)],
      intro: [],
      onEnd: () => {},
    });
  });
  await page.waitForFunction(() => !state.busy);
  await page.screenshot({
    path: path.join(output, "battle-rear-view.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, "battle-rear-mobile.png") });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.reload();
  await page.screenshot({
    path: path.join(output, "homepage-illustrated-mobile.png"),
  });
  assert.deepEqual(errors, []);
  console.log(
    "Illustrated world sprites, four Orpheus directions, transparent assets, field-guide controls, detailed battle view selection, fallback, and mobile checks passed.",
  );
  console.log(`Screenshots: ${output}`);
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
  });
