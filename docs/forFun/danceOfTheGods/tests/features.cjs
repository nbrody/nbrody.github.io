const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path"),
  os = require("node:os"),
  fs = require("node:fs");
const output =
  process.env.DANCE_QA_DIR || path.join(os.tmpdir(), "dance-of-the-gods-qa");
fs.mkdirSync(output, { recursive: true });
const gameURL = process.env.DANCE_URL || "http://127.0.0.1:18765/";
let browser;
(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(gameURL);
  async function setup(opts = {}) {
    await page.evaluate((opts) => {
      saveEnabled = false;
      resetWorld();
      state.team = [makeCreature("calfin", 8), makeCreature("fawnling", 8)];
      state.caught = [];
      state.inventory = { amphora: 8, nectar: 5, remedy: 3, ambrosia: 1 };
      state.settings.fastText = true;
      state.ow.flags = {};
      state.seen = [];
      enterOverworld("route", 7, 15, "up");
      rng = () => 0.5;
      if (opts.fainted) state.team[0].hp = 0;
      if (opts.poison) state.team[0].status = "poison";
      if (opts.weak) state.team[0].hp = Math.floor(state.team[0].maxhp * 0.8);
      if (opts.reserve) state.team[1].hp = 0;
      window.testResult = null;
      beginBattle({
        mode: opts.mode || "wild",
        canCatch: opts.mode !== "guardian",
        canFlee: opts.mode !== "guardian",
        foeTeam: [makeCreature("tortikin", 3)],
        intro: [],
        onEnd: (r) => {
          window.testResult = r;
          returnToOverworld();
        },
      });
    }, opts);
    await page.waitForFunction(
      () =>
        !state.busy &&
        !document.getElementById("action-ui").classList.contains("hidden"),
    );
  }
  async function actionReady() {
    await page.waitForFunction(
      () =>
        !state.busy &&
        !document.getElementById("action-ui").classList.contains("hidden"),
    );
  }
  await setup();
  const before = await page.evaluate(() => state.team[1].hp);
  await page.locator('[data-act="switch"]').click();
  await page.locator("#benchrow button").first().click();
  await actionReady();
  assert.equal(await page.evaluate(() => state.allyIdx), 1);
  assert((await page.evaluate(() => state.team[1].hp)) < before);
  assert.equal(await page.evaluate(() => state.battle.round), 2);
  console.log("Voluntary switching costs exactly one enemy turn");
  await setup({ weak: true, reserve: true, poison: true });
  await page.locator('[data-act="item"]').click();
  await page.locator('[data-item="remedy"]').click();
  await page.locator('[data-target="0"]').click();
  await actionReady();
  assert.equal(await page.evaluate(() => ally().status), null);
  assert.equal(await page.evaluate(() => state.inventory.remedy), 2);
  await page.locator('[data-act="item"]').click();
  await page.locator('[data-item="ambrosia"]').click();
  await page.locator('[data-target="1"]').click();
  await actionReady();
  assert.equal(
    await page.evaluate(() => state.team[1].hp),
    await page.evaluate(() => state.team[1].maxhp),
  );
  assert.equal(await page.evaluate(() => state.inventory.ambrosia), 0);
  console.log("Battle remedies and revival work on selected companions");
  await setup();
  const baseRate = await page.evaluate(() => catchRate(foe()));
  await page.locator('[data-act="song"]').click();
  await actionReady();
  assert.equal(await page.evaluate(() => state.battle.harmony), 1);
  assert((await page.evaluate(() => catchRate(foe()))) > baseRate);
  await page.evaluate(() => {
    state.battle.harmony = 3;
    promptAction();
  });
  assert(await page.locator('[data-act="song"]').isDisabled());
  await page.locator('[data-act="fight"]').click();
  await page.locator("#movegrid button").first().click();
  await page.waitForFunction(() => state.battle.harmony === 0);
  console.log("Lyre shielding, harmony cap and chorus consumption work");
  await page.waitForFunction(() => !state.busy);
  await setup();
  await page.evaluate(() => {
    state.team = Array.from({ length: 6 }, () => makeCreature("calfin", 8));
    rng = () => 0;
  });
  await page.locator('[data-act="catch"]').click();
  await page.waitForFunction(() => window.testResult === "caught");
  assert.equal(await page.evaluate(() => state.team.length), 6);
  assert.equal(await page.evaluate(() => state.caught.length), 1);
  assert.equal(await page.evaluate(() => state.inventory.amphora), 7);
  console.log(
    "Capture consumes one amphora and safely sends overflow to the Oracle",
  );
  await setup();
  await page.evaluate(() => {
    ally().moves.forEach((k) => (ally().pp[k] = 0));
  });
  await page.locator('[data-act="fight"]').click();
  assert.match(await page.locator("#movegrid").textContent(), /Last Resolve/);
  console.log("Exhausted companion always has a usable fallback");
  await page.locator("#move-back").click();
  await page.evaluate(() => {
    state.battle.fleeAttempts = 2;
    rng = () => 0.99;
  });
  await page.locator('[data-act="flee"]').click();
  await page.waitForFunction(() => window.testResult === "fled");
  console.log("Third escape attempt is guaranteed");
  await setup();
  await page.evaluate(() => {
    state.busy = true;
    ally().hp = 0;
    promptSwitch(true);
  });
  await page.keyboard.press("Escape");
  assert(await page.locator("#switch-ui").isVisible());
  await page.keyboard.press("1");
  await actionReady();
  assert.equal(await page.evaluate(() => state.allyIdx), 1);
  console.log("Forced switching remains mandatory and keyboard accessible");
  await setup();
  await page.evaluate(() => {
    state.team.forEach((c) => (c.hp = 0));
    foe().hp = 0;
    afterTurn();
  });
  await page.waitForFunction(() => window.testResult === "lost");
  console.log("Simultaneous knockout resolves safely as defeat");
  await page.evaluate(() => {
    state.team = [makeCreature("calfin", 8), makeCreature("dovie", 7)];
    state.caught = [makeCreature("owlet", 8)];
    enterOverworld("village", 8, 12, "up");
  });
  await page.click("#party-btn");
  await page
    .locator(".pcard")
    .nth(1)
    .getByRole("button", { name: "Lead", exact: true })
    .click();
  assert.equal(await page.evaluate(() => state.team[0].key), "dovie");
  await page
    .locator(".pcard")
    .nth(2)
    .getByRole("button", { name: "Join companions", exact: true })
    .click();
  assert.equal(await page.evaluate(() => state.team.length), 3);
  console.log("Party leadership and Oracle transfers persist");
  await page.click("#party-close");
  await page.click("#satchel-btn");
  await page.locator("#fast-text").uncheck();
  assert.equal(await page.evaluate(() => state.settings.fastText), false);
  await page.click("#satchel-close");
  await page.click("#sound-btn");
  assert.equal(await page.evaluate(() => state.settings.sound), true);
  const saveChecks = await page.evaluate(() => {
    saveEnabled = true;
    saveGame();
    const sv = JSON.parse(localStorage.getItem(SAVE_KEY));
    return {
      version: sv.v,
      valid: !!validateSave(sv),
      invalid: validateSave({ ...sv, map: "__proto__" }) === null,
      settings: sv.settings.sound === true,
      normalize: validateSave({ ...sv, drachma: -50 }).drachma === 0,
    };
  });
  assert.deepEqual(saveChecks, {
    version: 2,
    valid: true,
    invalid: true,
    settings: true,
    normalize: true,
  });
  console.log("Settings and validated saves round trip");
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto(gameURL);
  await phone.click("#start-btn");
  for (let i = 0; i < 3; i++) {
    await phone.locator("#owd-text").tap();
    await phone.waitForTimeout(50);
  }
  await phone.locator('[data-dir="up"]').tap();
  await phone.waitForFunction(() => state.ow.ty === 11 && !state.ow.moving);
  assert.equal(await phone.evaluate(() => state.ow.ty), 11);
  await phone.locator('[data-dir="act"]').tap();
  await phone.waitForTimeout(50);
  assert(await phone.locator("#ow-dialogue").isVisible());
  assert.match(await phone.locator("#owd-text").textContent(), /traveler/);
  console.log("Touch movement and interaction work");
  assert.deepEqual(errors, []);
  await browser.close();
  console.log("ALL FEATURE CHECKS PASSED");
})().catch(async (e) => {
  console.error(e);
  await browser?.close();
  process.exitCode = 1;
});
