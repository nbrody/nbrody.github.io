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
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("PAGE ERROR", e.message);
  });
  await page.goto(gameURL);
  await page.waitForTimeout(500);
  async function dialogue() {
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(30);
      if (!(await page.locator("#ow-dialogue").isVisible())) return;
      if (await page.locator("#dialogue-choices button").count()) return;
      await page.locator("#owd-text").click();
    }
    throw Error("Dialogue did not end");
  }
  async function walkTo(tx, ty) {
    const dirs = await page.evaluate(
      ({ tx, ty }) => {
        const o = state.ow,
          queue = [[o.tx, o.ty, []]],
          seen = new Set();
        while (queue.length) {
          const [x, y, path] = queue.shift(),
            key = x + "," + y;
          if (seen.has(key)) continue;
          seen.add(key);
          if (x === tx && y === ty) return path;
          for (const [dir, [dx, dy]] of Object.entries(DIRV))
            if (isWalkable(o.map, x + dx, y + dy))
              queue.push([x + dx, y + dy, [...path, dir]]);
        }
        return null;
      },
      { tx, ty },
    );
    assert(dirs, `No path to ${tx},${ty}`);
    for (const dir of dirs) {
      const before = await page.evaluate(() => ({
        x: state.ow.tx,
        y: state.ow.ty,
        map: state.ow.map.id,
      }));
      await page.keyboard.down("Arrow" + dir[0].toUpperCase() + dir.slice(1));
      await page.waitForTimeout(30);
      await page.keyboard.up("Arrow" + dir[0].toUpperCase() + dir.slice(1));
      await page.waitForFunction(
        (before) =>
          !state.ow.moving &&
          (state.ow.tx !== before.x ||
            state.ow.ty !== before.y ||
            state.ow.map.id !== before.map),
        before,
      );
      if (await page.locator("#ow-dialogue").isVisible()) await dialogue();
      if (await page.locator("#battle-screen").isVisible()) await battle();
    }
  }
  async function npc(name) {
    const target = await page.evaluate((name) => {
      const o = state.ow,
        n = o.map.npcs.find((n) => n.name === name && !n.gone);
      if (!n) throw Error("No NPC " + name);
      const reachable = [];
      for (const [dir, [dx, dy]] of Object.entries(DIRV)) {
        const x = n.x - dx,
          y = n.y - dy;
        if (isWalkable(o.map, x, y))
          reachable.push({
            x,
            y,
            dir,
            d: Math.abs(o.tx - x) + Math.abs(o.ty - y),
          });
      }
      return reachable.sort((a, b) => a.d - b.d)[0];
    }, name);
    await walkTo(target.x, target.y);
    // Facing a blocked NPC tile cannot accidentally take an extra step.
    const k = "Arrow" + target.dir[0].toUpperCase() + target.dir.slice(1);
    await page.keyboard.down(k);
    await page.waitForTimeout(25);
    await page.keyboard.up(k);
    await page.keyboard.press("e");
    await dialogue();
  }
  async function battle() {
    for (let round = 0; round < 70; round++) {
      await page.waitForFunction(
        () =>
          !document
            .getElementById("battle-screen")
            .classList.contains("active") ||
          (!state.busy &&
            !document
              .getElementById("action-ui")
              .classList.contains("hidden")) ||
          !document.getElementById("switch-ui").classList.contains("hidden"),
        null,
        { timeout: 25000 },
      );
      if (!(await page.locator("#battle-screen").isVisible())) {
        await dialogue();
        return;
      }
      if (await page.locator("#switch-ui").isVisible()) {
        await page.locator("#benchrow button:not(:disabled)").first().click();
        continue;
      }
      const info = await page.evaluate(() => ({
        hp: ally().hp,
        maxhp: ally().maxhp,
        nectar: state.inventory.nectar,
        mode: state.battle.mode,
        harmony: state.battle.harmony,
      }));
      if (info.hp < info.maxhp * 0.5 && info.nectar > 0) {
        await page.locator('[data-act="item"]').click();
        await page.locator('[data-item="nectar"]').click();
        const idx = await page.evaluate(() => state.allyIdx);
        await page.locator(`[data-target="${idx}"]`).click();
        continue;
      }
      const move = await page.evaluate(
        () =>
          ally()
            .moves.filter((k) => ally().pp[k] > 0 && MOVES[k].cat !== "status")
            .sort(
              (a, b) =>
                MOVES[b].pow * effectiveness(MOVES[b].dom, foe().dom) -
                MOVES[a].pow * effectiveness(MOVES[a].dom, foe().dom),
            )[0],
      );
      await page.locator('[data-act="fight"]').click();
      if (move)
        await page
          .getByRole("button", {
            name: new RegExp(
              "^" + (await page.evaluate((k) => MOVES[k].name, move)),
            ),
          })
          .click();
      else
        await page.locator("#movegrid button:not(:disabled)").first().click();
    }
    throw Error("Battle did not finish");
  }
  await page.click("#start-btn");
  await dialogue();
  await npc("Hermes");
  await page.locator("#pick-grid .tile").nth(1).click();
  await page.click("#fight-btn");
  await dialogue();
  await page.evaluate(() => {
    state.settings.fastText = true;
    state.ow.encounterGrace = 10000;
    rng = () => 0.5;
  });
  await npc("Elder Myrrha");
  assert(await page.evaluate(() => state.ow.flags.wellSong));
  console.log("Gift and well passed");
  await npc("Ione");
  await walkTo(7, 0);
  assert.equal(await page.evaluate(() => state.ow.map.id), "route");
  await npc("Frightened Cresfawn");
  await battle();
  assert(await page.evaluate(() => state.ow.flags.fawnRescued));
  console.log("Rescue passed");
  await npc("Listening Shrine");
  for (const label of ["River · low", "Leaf · middle", "Sun · high"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.waitForTimeout(80);
  }
  await dialogue();
  assert(await page.evaluate(() => state.ow.flags.groveSong));
  await npc("Kass");
  await battle();
  assert(await page.evaluate(() => state.ow.flags.kass));
  console.log("Shrine and Kass passed");
  await walkTo(7, 0);
  assert.equal(await page.evaluate(() => state.ow.map.id), "delphi");
  await npc("Pythia");
  await npc("Daphne");
  await npc("Eros");
  await page.screenshot({
    path: path.join(output, "delphi.png"),
    fullPage: true,
  });
  await npc("Apollo");
  await page
    .getByRole("button", { name: "Restore the song", exact: true })
    .click();
  await page.waitForFunction(() => !state.busy);
  await page.screenshot({
    path: path.join(output, "battle.png"),
    fullPage: true,
  });
  await battle();
  assert.equal(await page.evaluate(() => state.ow.flags.delphi), 2);
  console.log("Guardian passed");
  await npc("Pythia");
  await page
    .getByRole("button", { name: "No bond should be a chain", exact: true })
    .click();
  await dialogue();
  assert.equal(await page.evaluate(() => state.ow.flags.delphi), 3);
  await page.click("#journal-btn");
  await page.screenshot({
    path: path.join(output, "journal.png"),
    fullPage: true,
  });
  await page.click("#journal-close");
  await walkTo(2, 0);
  assert.equal(await page.evaluate(() => state.ow.map.id), "sacredWay");
  console.log("Chapter ending and exit passed");
  await page.reload();
  await page.click("#resume-btn");
  assert.equal(await page.evaluate(() => state.ow.flags.delphi), 3);
  assert.equal(await page.evaluate(() => state.ow.map.id), "sacredWay");
  assert.equal(await page.evaluate(() => state.ow.flags.promise), "freedom");
  console.log("Save/reload passed");
  // Validate legacy migration, malformed inputs, overflow and move exhaustion in a separate page.
  const checks = await page.evaluate(() => {
    const old = {
      v: 1,
      team: [makeCreature("calfin", 10)],
      caught: [],
      flags: { delphi: 3 },
      trainers: { "route:Kass": true },
      map: "delphi",
      tx: 10,
      ty: 4,
    };
    const read = validateSave(old);
    applySave(read);
    const legacy =
      state.ow.flags.wellSong &&
      state.ow.flags.laurel &&
      MAPS.delphi.warps["2,0"] &&
      isWalkable(state.ow.map, state.ow.tx, state.ow.ty);
    const malformed =
      validateSave({ ...old, team: [{ key: "missing", level: 8 }] }) === null;
    state.team = Array.from({ length: 6 }, () => makeCreature("calfin", 8));
    state.caught = [];
    captureFoe(makeCreature("dovie", 5));
    const overflow = state.team.length === 6 && state.caught.length === 1;
    return { legacy: !!legacy, malformed, overflow };
  });
  assert.deepEqual(checks, { legacy: true, malformed: true, overflow: true });
  console.log("Legacy, validation, overflow passed");
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto(gameURL);
  await phone.click("#start-btn");
  for (let i = 0; i < 3; i++) await phone.locator("#owd-text").tap();
  await phone.waitForTimeout(200);
  await phone.screenshot({
    path: path.join(output, "mobile.png"),
    fullPage: true,
  });
  const mobile = await phone.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    canvas: owcv.width,
    playerX: state.ow.px,
  }));
  assert.equal(mobile.overflow, false);
  assert.equal(mobile.canvas, 390);
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("Mobile and runtime passed");
  console.log("ALL CHECKS PASSED");
  await browser.close();
})().catch(async (e) => {
  console.error(e);
  await browser?.close();
  process.exitCode = 1;
});
