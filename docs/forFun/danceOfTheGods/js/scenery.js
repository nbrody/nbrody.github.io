"use strict";
/* Canvas-native scenery. Terrain and tall objects use separate passes so
   characters can walk behind tree canopies and architecture. */
const WORLD_COLORS = {
  grass: "#77986a",
  path: "#dbbc83",
  stone: "#e6dcc0",
  water: "#368f9b",
  dark: "#244a40",
};
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
function ellipse(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
function poly(ctx, points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}
function renderOverworld(ts) {
  if (reducedMotion) ts = 1000;
  const o = state.ow,
    map = o.map,
    ctx = owctx;
  if (!map) return;
  const nextW =
    owcv.clientWidth < 520 ? Math.max(280, Math.round(owcv.clientWidth)) : 960;
  const nextH = owcv.clientWidth < 520 ? 440 : 576;
  if (OWW !== nextW || OWH !== nextH || owcv.width !== nextW * 2) {
    OWW = nextW;
    OWH = nextH;
    owcv.width = OWW * 2;
    owcv.height = OWH * 2;
  }
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const camX =
    map.w * TILE < OWW
      ? (map.w * TILE - OWW) / 2
      : clamp(o.px + TILE / 2 - OWW / 2, 0, map.w * TILE - OWW);
  const camY =
    map.h * TILE < OWH
      ? (map.h * TILE - OWH) / 2
      : clamp(o.py + TILE / 2 - OWH / 2, 0, map.h * TILE - OWH);
  ctx.fillStyle = "#294d43";
  ctx.fillRect(0, 0, OWW, OWH);
  const visible = (x, y) =>
    x > -TILE * 3 && x < OWW + TILE && y > -TILE * 4 && y < OWH + TILE * 3;
  const objects = [];
  for (let ty = 0; ty < map.h; ty++)
    for (let tx = 0; tx < map.w; tx++) {
      const x = tx * TILE - camX,
        y = ty * TILE - camY,
        ch = map.grid[ty][tx];
      if (!visible(x, y)) continue;
      drawGround(ctx, ch, x, y, tx, ty, ts, map);
      if (["T", "v", "L"].includes(ch))
        objects.push({
          z: y + TILE,
          draw: () => drawOlive(ctx, x, y, tx, ty, ch, ts),
        });
      if (["R", "O", "C", "Y", "S"].includes(ch))
        objects.push({
          z: y + TILE - 4,
          draw: () => drawProp(ctx, ch, x, y, ts),
        });
    }
  for (const building of buildingsFor(map)) {
    const x = building.x * TILE - camX,
      y = building.y * TILE - camY;
    objects.push({
      z: y + building.h * TILE - 2,
      draw: () =>
        drawBuilding(
          ctx,
          x,
          y,
          building.w * TILE,
          building.h * TILE,
          map.id !== "village" && building.w >= 6,
        ),
    });
  }
  const q = questInfo();
  for (const p of map.pickups || []) {
    if (o.flags["pickup-" + p.id]) continue;
    const x = p.x * TILE - camX,
      y = p.y * TILE - camY;
    ellipse(ctx, x + 24, y + 35, 12, 4, "#244a403f");
    drawAmphora(ctx, x + 24, y + 26, 12, "#d99555");
    ctx.fillStyle = "#fff2ba";
    ctx.font = "18px Georgia";
    ctx.fillText("✧", x + 32, y + 13 + Math.sin(ts / 350) * 3);
  }
  for (const [pos] of Object.entries(map.warps)) {
    const [tx, ty] = pos.split(",").map(Number);
    const x = tx * TILE - camX,
      y = ty * TILE - camY;
    ellipse(ctx, x + 24, y + 24, 15, 7, "#fff6b345");
    ctx.fillStyle = "#fff2b7";
    ctx.font = "bold 22px Georgia";
    ctx.textAlign = "center";
    ctx.fillText(
      ty === 0 ? "↑" : ty === map.h - 1 ? "↓" : tx === 0 ? "←" : "→",
      x + 24,
      y + 31,
    );
    ctx.textAlign = "left";
  }
  for (const n of map.npcs) {
    if (n.gone) continue;
    const x = n.x * TILE - camX,
      y = n.y * TILE - camY;
    objects.push({
      z: y + TILE - 3,
      draw: () => {
        if (n.shrine) {
          drawShrine(ctx, x, y, ts);
        } else if (n.beast) {
          ctx.save();
          ctx.translate(x - 8, y - 10);
          ctx.scale(0.55, 0.55);
          drawWorldBeast(ctx, n.beast);
          ctx.restore();
        } else drawPerson(ctx, n, x, y, 0);
        const target = q.map === map.id && q.x === n.x && q.y === n.y;
        if (target)
          drawMarker(
            ctx,
            x + 24,
            y - 9 + Math.sin(ts / 300) * 3,
            "!",
            "#f7d880",
          );
        else if (
          n.kind === "heal" ||
          ["Elder Myrrha", "Pythia"].includes(n.name)
        )
          drawMarker(ctx, x + 24, y - 9, "+", "#bdebd3");
        else if (n.team && !n.defeated)
          drawMarker(ctx, x + 24, y - 9, "⋈", "#edb69d");
      },
    });
  }
  const x = o.px - camX,
    y = o.py - camY;
  objects.push({
    z: y + TILE - 3,
    draw: () =>
      drawPerson(
        ctx,
        { sprite: "orpheus", dir: o.dir },
        x,
        y,
        o.moving ? ts : 0,
      ),
  });
  objects.sort((a, b) => a.z - b.z).forEach((obj) => obj.draw());
  // Warm light, small airborne seeds, and vignette tie all terrain together.
  const light = ctx.createLinearGradient(0, 0, OWW, OWH);
  light.addColorStop(0, "#fff3ac18");
  light.addColorStop(1, "#203e5320");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, OWW, OWH);
  for (let i = 0; i < 16; i++) {
    const px = (hash2(i, 7) * OWW + ts * (0.006 + (i % 3) * 0.004)) % OWW,
      py = (hash2(i, 12) * OWH + Math.sin(ts / 1800 + i) * 15) % OWH;
    ellipse(ctx, px, py, 1.6, 1, "#fff0b986");
  }
  const vignette = ctx.createRadialGradient(
    OWW / 2,
    OWH / 2,
    OWW * 0.2,
    OWW / 2,
    OWH / 2,
    OWW * 0.64,
  );
  vignette.addColorStop(0, "transparent");
  vignette.addColorStop(1, "#102d3655");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, OWW, OWH);
  drawMinimap(map, q);
  const [dx, dy] = DIRV[o.dir];
  const n = map.npcs.find(
    (n) => !n.gone && n.x === o.tx + dx && n.y === o.ty + dy,
  );
  const prop = tileAt(map, o.tx + dx, o.ty + dy);
  const interactable =
    n ||
    map.signs[`${o.tx + dx},${o.ty + dy}`] ||
    ["O", "L", "S", "D", "Y"].includes(prop);
  const hint = $("interaction-hint");
  hint.classList.toggle("hidden", !interactable || owBusy || o.moving);
  if (interactable)
    hint.textContent = `E / Space · ${n ? (n.shrine ? "Play the shrine" : n.beast ? "Approach Cresfawn" : `Speak to ${n.name}`) : "Examine"}`;
}
function drawGround(ctx, ch, x, y, tx, ty, ts, map) {
  const r = hash2(tx, ty),
    ground = ["#7f9c69", "#789565", "#819e6e", "#829d69"][Math.floor(r * 4)];
  ctx.fillStyle = ground;
  ctx.fillRect(x, y, TILE + 0.5, TILE + 0.5);
  if ([",", "m", "#", "D", "C", "Y"].includes(ch)) {
    ctx.fillStyle = ch === "," ? "#d6b984" : "#d5cfb0";
    ctx.fillRect(x, y, TILE + 0.5, TILE + 0.5);
    ctx.strokeStyle = ch === "," ? "#b694633b" : "#82918045";
    ctx.lineWidth = 1;
    if (ch === ",") {
      for (let i = 0; i < 3; i++) {
        const rx = hash2(tx + i, ty + 6) * 39,
          ry = hash2(tx + 8, ty + i) * 40;
        ellipse(ctx, x + rx + 4, y + ry + 4, 3, 1.4, "#f6deb074");
      }
      for (const [dx, dy] of Object.values(DIRV)) {
        const c = tileAt(map, tx + dx, ty + dy);
        if (c !== "," && c !== "m") {
          ctx.fillStyle = "#a1aa744a";
          ctx.fillRect(
            x + (dx === 1 ? 44 : 0),
            y + (dy === 1 ? 44 : 0),
            dx ? 4 : 48,
            dy ? 4 : 48,
          );
        }
      }
    } else {
      ctx.strokeRect(x + 0.5, y + 0.5, 47, 23);
      ctx.strokeRect(x + (ty % 2 ? 0 : 24) + 0.5, y + 24.5, 24, 23);
    }
  } else if (ch === "~") {
    ctx.fillStyle = "#368b96";
    ctx.fillRect(x, y, 48.5, 48.5);
    ctx.fillStyle = "#62b7b424";
    ctx.fillRect(x, y + 8, 48, 15);
    for (const [dx, dy] of Object.values(DIRV))
      if (tileAt(map, tx + dx, ty + dy) !== "~") {
        ctx.fillStyle = "#dacb975e";
        ctx.fillRect(
          x + (dx === 1 ? 42 : 0),
          y + (dy === 1 ? 42 : 0),
          dx ? 6 : 48,
          dy ? 6 : 48,
        );
      }
    ctx.strokeStyle = "#b4ebe67a";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const py = y + 10 + i * 14 + Math.sin(ts / 800 + tx + i) * 2;
      ctx.beginPath();
      ctx.moveTo(x + 6, py);
      ctx.quadraticCurveTo(x + 20, py - 4, x + 38, py);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const px = x + hash2(tx * 8 + i, ty) * 46,
        py = y + hash2(tx, ty * 8 + i) * 45;
      ctx.fillStyle = i % 2 ? "#b7c88268" : "#476f5140";
      ctx.fillRect(px, py, 2 + (i % 2), 1.5);
    }
    if (ch === '"') {
      ctx.fillStyle = "#446d4135";
      ctx.fillRect(x + 2, y + 3, 44, 43);
      for (let i = 0; i < 13; i++) {
        const bx = x + 4 + hash2(tx * 12 + i, ty) * 39,
          by = y + 13 + hash2(tx, ty * 14 + i) * 33,
          sway = Math.sin(ts / 450 + tx + i) * 2;
        ctx.strokeStyle = i % 3 ? "#4f794b" : "#b5c67c";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx - 3, by - 7, bx - 4 + sway, by - 13);
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + 3, by - 6, bx + 5 + sway, by - 9);
        ctx.stroke();
      }
    }
    if (ch === "f")
      for (let i = 0; i < 6; i++) {
        const px = x + 6 + hash2(tx + i, ty) * 35,
          py = y + 8 + hash2(tx, ty + i) * 32;
        ctx.fillStyle = "#4d7852";
        ctx.fillRect(px, py, 1, 8);
        ellipse(
          ctx,
          px,
          py,
          3.5,
          2.8,
          ["#edd799", "#eee5c9", "#cf8e80"][i % 3],
        );
        ellipse(ctx, px, py, 1, 1, "#ae8354");
      }
  }
}
function drawOlive(ctx, x, y, tx, ty, type, ts) {
  const r = hash2(tx, ty),
    cx = x + 24,
    cy = y + 12,
    sway = Math.sin(ts / 1700 + tx) * 0.9;
  ellipse(ctx, cx + 8, y + 44, 26, 9, "#254b3b42");
  ctx.strokeStyle = "#756548";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, y + 43);
  ctx.quadraticCurveTo(cx - 4, y + 22, cx + 2, y + 9);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, y + 26);
  ctx.lineTo(cx - 15, y + 12);
  ctx.moveTo(cx, y + 23);
  ctx.lineTo(cx + 16, y + 7);
  ctx.stroke();
  const palette =
    type === "L"
      ? ["#547745", "#799551", "#b4b864"]
      : type === "v"
        ? ["#526d55", "#7d9470", "#b0b48a"]
        : ["#325e4d", "#507d59", "#82965e"];
  for (const [ox, oy, rx, ry] of [
    [-16, 8, 15, 15],
    [16, 5, 15, 16],
    [0, -4, 23, 23],
    [-13, -6, 13, 14],
    [11, -15, 13, 14],
  ]) {
    ellipse(ctx, cx + ox + sway, cy + oy, rx, ry, palette[0]);
    ellipse(ctx, cx + ox - 3 + sway, cy + oy - 4, rx - 2, ry - 3, palette[1]);
    ellipse(
      ctx,
      cx + ox - 6 + sway,
      cy + oy - 7,
      rx * 0.5,
      ry * 0.44,
      palette[2],
    );
  }
  for (let i = 0; i < 9; i++) {
    const px = cx + (hash2(tx * 10 + i, ty) - 0.5) * 42,
      py = cy + (hash2(tx, ty * 10 + i) - 0.5) * 35;
    ellipse(ctx, px, py, 2.5, 1.1, i % 2 ? "#bac18b9c" : "#2d534f");
  }
}
function buildingsFor(map) {
  if (map.buildings) return map.buildings;
  const visited = new Set(),
    buildings = [];
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      if (!["#", "D"].includes(map.grid[y][x]) || visited.has(x + "," + y))
        continue;
      const todo = [[x, y]],
        cells = [];
      while (todo.length) {
        const [cx, cy] = todo.pop(),
          key = cx + "," + cy;
        if (visited.has(key) || !["#", "D"].includes(tileAt(map, cx, cy)))
          continue;
        visited.add(key);
        cells.push([cx, cy]);
        for (const [dx, dy] of Object.values(DIRV))
          todo.push([cx + dx, cy + dy]);
      }
      const xs = cells.map((c) => c[0]),
        ys = cells.map((c) => c[1]);
      buildings.push({
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs) + 1,
        h: Math.max(...ys) - Math.min(...ys) + 1,
      });
    }
  return (map.buildings = buildings);
}
function drawBuilding(ctx, x, y, w, h, temple) {
  const roof = y - 10,
    wall = y + h * 0.42,
    bottom = y + h;
  ctx.fillStyle = "#294b3d38";
  ctx.fillRect(x + 12, wall + 12, w, bottom - wall + 2);
  ctx.fillStyle = "#e8d8b2";
  ctx.fillRect(x + 5, wall, w - 10, bottom - wall);
  ctx.fillStyle = "#bdab88";
  ctx.fillRect(x + w - 18, wall, 13, bottom - wall);
  ctx.fillStyle = "#b9af92";
  ctx.fillRect(x, bottom - 7, w, 7);
  if (temple) {
    for (let i = 0; i < Math.round(w / 47); i++) {
      const px = x + 18 + (i * (w - 36)) / (Math.round(w / 47) - 1);
      ctx.fillStyle = "#f2e7c9";
      ctx.fillRect(px - 6, wall, 12, bottom - wall - 9);
      ctx.fillStyle = "#b9b49a";
      ctx.fillRect(px + 3, wall, 3, bottom - wall - 9);
      ctx.fillStyle = "#eee1bd";
      ctx.fillRect(px - 11, wall, 22, 7);
      ctx.fillRect(px - 9, bottom - 14, 18, 7);
    }
    poly(
      ctx,
      [
        [x - 8, wall],
        [x + w / 2, roof - 30],
        [x + w + 8, wall],
      ],
      "#dfcfaa",
    );
    poly(
      ctx,
      [
        [x + 15, wall - 7],
        [x + w / 2, roof - 16],
        [x + w - 15, wall - 7],
      ],
      "#c2ad85",
    );
    ellipse(ctx, x + w / 2, wall - 23, 12, 12, "#e6c36e");
    ctx.fillStyle = "#f5e8c7";
    ctx.fillRect(x - 10, wall - 3, w + 20, 7);
  } else {
    const doorX = x + w * 0.375;
    ctx.fillStyle = "#5d5c48";
    ctx.fillRect(doorX, bottom - 46, 28, 39);
    ctx.fillStyle = "#334c47";
    ctx.fillRect(x + 25, bottom - 48, 23, 23);
    ctx.fillRect(x + w - 48, bottom - 48, 23, 23);
    ctx.strokeStyle = "#e8d8b2";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 36, bottom - 48);
    ctx.lineTo(x + 36, bottom - 25);
    ctx.moveTo(x + w - 36, bottom - 48);
    ctx.lineTo(x + w - 36, bottom - 25);
    ctx.stroke();
    poly(
      ctx,
      [
        [x - 8, wall + 7],
        [x + 15, roof],
        [x + w - 15, roof],
        [x + w + 8, wall + 7],
      ],
      "#ad6249",
    );
    for (let row = 0; row < 5; row++) {
      const py = roof + ((wall + 7 - roof) * row) / 5;
      ctx.strokeStyle = row % 2 ? "#d08a60" : "#8b4d40";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 12 - row * 4, py);
      ctx.lineTo(x + w - 12 + row * 4, py);
      ctx.stroke();
    }
    for (let i = 0; i < w / 14; i++) {
      ctx.strokeStyle = "#e5a47970";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 15 + (i * (w - 30)) / (w / 14), roof);
      ctx.lineTo(x - 8 + i * 14, wall + 7);
      ctx.stroke();
    }
    ctx.fillStyle = "#e8d8b2";
    ctx.fillRect(x + w - 42, roof - 17, 17, 25);
    ctx.fillStyle = "#b8a786";
    ctx.fillRect(x + w - 44, roof - 20, 21, 5);
    drawAmphora(ctx, x + w - 28, bottom - 7, 10, "#c48758");
  }
}
function drawAmphora(ctx, x, y, s, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x - s * 0.7, y - s * 0.35, s * 0.35, s * 0.45, 0, 0, 7);
  ctx.ellipse(x + s * 0.7, y - s * 0.35, s * 0.35, s * 0.45, 0, 0, 7);
  ctx.stroke();
  ellipse(ctx, x, y, s * 0.7, s, color);
  ctx.fillStyle = color;
  ctx.fillRect(x - s * 0.35, y - s * 1.2, s * 0.7, s * 0.5);
  ctx.fillStyle = "#e9c190";
  ctx.fillRect(x - s * 0.43, y - s * 1.25, s * 0.86, 2);
  ctx.fillStyle = "#794b38";
  ctx.fillRect(x - s * 0.58, y - 2, s * 1.16, 3);
}
function drawProp(ctx, ch, x, y, ts) {
  const cx = x + 24;
  ellipse(ctx, cx + 5, y + 40, 17, 5, "#2e544038");
  if (ch === "O") {
    ellipse(ctx, cx, y + 32, 18, 12, "#9b9e83");
    ctx.fillStyle = "#b7b79b";
    ctx.fillRect(x + 6, y + 20, 36, 13);
    ellipse(ctx, cx, y + 20, 18, 11, "#e3dbc1");
    ellipse(ctx, cx, y + 20, 12, 6, "#345f68");
    ellipse(ctx, cx - 3, y + 18, 7, 2, "#78b1ae");
  } else if (ch === "R") {
    poly(
      ctx,
      [
        [x + 6, y + 36],
        [x + 11, y + 17],
        [x + 28, y + 12],
        [x + 41, y + 29],
        [x + 35, y + 40],
      ],
      "#8a9581",
    );
    poly(
      ctx,
      [
        [x + 11, y + 17],
        [x + 28, y + 12],
        [x + 32, y + 25],
        [x + 18, y + 29],
      ],
      "#b8b8a0",
    );
  } else if (ch === "C") {
    ctx.fillStyle = "#b3b39b";
    ctx.fillRect(x + 10, y + 36, 28, 8);
    ctx.fillStyle = "#e9e1c5";
    ctx.fillRect(x + 16, y - 8, 16, 44);
    ctx.fillStyle = "#c5c7af";
    ctx.fillRect(x + 26, y - 8, 4, 44);
    ctx.fillStyle = "#f1e8ca";
    ctx.fillRect(x + 10, y - 14, 28, 8);
    ctx.fillRect(x + 12, y + 34, 24, 4);
    ctx.strokeStyle = "#b8bba5";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 19 + i * 4, y - 4);
      ctx.lineTo(x + 19 + i * 4, y + 31);
      ctx.stroke();
    }
  } else if (ch === "S") {
    ctx.fillStyle = "#82704f";
    ctx.fillRect(x + 21, y + 15, 5, 28);
    ctx.fillStyle = "#d9bf89";
    ctx.fillRect(x + 8, y + 7, 31, 20);
    ctx.strokeStyle = "#92754f";
    ctx.strokeRect(x + 8, y + 7, 31, 20);
    ctx.fillStyle = "#846b48";
    ctx.fillRect(x + 13, y + 13, 20, 2);
    ctx.fillRect(x + 13, y + 19, 14, 2);
  } else {
    drawLegacyTile(ctx, ch, x, y, 0, 0, ts);
  }
}
function drawShrine(ctx, x, y, ts) {
  ellipse(ctx, x + 24, y + 31, 21, 12, "#b3b69d");
  ellipse(ctx, x + 24, y + 29, 18, 10, "#e7ddba");
  ctx.strokeStyle = "#e8c96e";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 17, y + 23);
  ctx.quadraticCurveTo(x + 11, y + 5, x + 15, y);
  ctx.moveTo(x + 31, y + 23);
  ctx.quadraticCurveTo(x + 37, y + 5, x + 33, y);
  ctx.moveTo(x + 15, y + 3);
  ctx.lineTo(x + 33, y + 3);
  ctx.stroke();
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(x + 19 + i * 3, y + 4);
    ctx.lineTo(x + 20 + i * 2, y + 24);
    ctx.stroke();
  }
  ellipse(ctx, x + 24, y + 22, 7, 4, "#e8c96e");
  ellipse(ctx, x + 24, y + 12, 23 + Math.sin(ts / 600) * 3, 24, "#ffe8a317");
}
function drawPerson(ctx, n, x, y, ts) {
  if (n.sprite === "orpheus") {
    ctx.save();
    ctx.translate(x + 24 - 55 * 0.34, y + 44 - 136 * 0.34);
    ctx.scale(0.34, 0.34);
    drawKeeperFigure(ctx, n.dir || "down", ts);
    ctx.restore();
    return;
  }
  const hero = n.sprite === "orpheus",
    look = hero
      ? { robe: "#e4dfc2", trim: "#d9ad5d" }
      : NPC_LOOK[n.sprite] || NPC_LOOK.villager;
  const cx = x + 24,
    foot = y + 43,
    bob = ts ? Math.sin(ts / 85) * 1.5 : 0,
    top = foot - 31 + bob;
  ellipse(ctx, cx, foot + 1, 11, 4, "#183e394a");
  ctx.strokeStyle = "#745740";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 4, foot - 9);
  ctx.lineTo(cx - 5, foot - (ts ? Math.max(0, Math.sin(ts / 90) * 4) : 0));
  ctx.moveTo(cx + 4, foot - 9);
  ctx.lineTo(cx + 5, foot - (ts ? Math.max(0, -Math.sin(ts / 90) * 4) : 0));
  ctx.stroke();
  poly(
    ctx,
    [
      [cx - 7, top + 10],
      [cx + 7, top + 10],
      [cx + 10, foot - 7],
      [cx - 10, foot - 7],
    ],
    look.robe,
  );
  poly(
    ctx,
    [
      [cx + 2, top + 11],
      [cx + 7, top + 10],
      [cx + 10, foot - 7],
      [cx + 2, foot - 7],
    ],
    hero ? "#5e9090" : "#243e413d",
  );
  ctx.fillStyle = look.trim;
  ctx.fillRect(cx - 8, foot - 10, 17, 3);
  ctx.fillRect(cx - 7, top + 11, 14, 2);
  ctx.strokeStyle = "#c9976a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 8, top + 13);
  ctx.lineTo(cx - 10, top + 22);
  ctx.moveTo(cx + 8, top + 13);
  ctx.lineTo(cx + 10, top + 22);
  ctx.stroke();
  ellipse(ctx, cx, top + 4, 7.5, 8, "#cfa578");
  ellipse(ctx, cx, top - 0.5, 8, 5.3, hero ? "#564b38" : "#625844");
  if (n.dir === "up") ellipse(ctx, cx, top + 4, 7.5, 8, "#62523b");
  else {
    ctx.fillStyle = "#354139";
    if (n.dir !== "right") ctx.fillRect(cx - 4, top + 4, 1.5, 2);
    if (n.dir !== "left") ctx.fillRect(cx + 3, top + 4, 1.5, 2);
  }
  if (look.hood)
    poly(
      ctx,
      [
        [cx - 10, top + 10],
        [cx, top - 8],
        [cx + 10, top + 10],
        [cx + 5, top + 7],
        [cx, top - 1],
        [cx - 5, top + 7],
      ],
      look.robe,
    );
  if (look.beard)
    poly(
      ctx,
      [
        [cx - 5, top + 8],
        [cx, top + 17],
        [cx + 5, top + 8],
      ],
      "#eee1c4",
    );
  if (hero || look.halo) {
    ctx.strokeStyle = "#e5c26a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, top + 1, 8, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  if (hero) {
    ctx.save();
    ctx.translate(cx + 10, top + 20);
    ctx.scale(0.28, 0.28);
    drawShrine(ctx, -24, -18, 1000);
    ctx.restore();
  }
  if (look.wings) {
    ellipse(ctx, cx - 10, top + 15, 5, 9, "#f4e8c2");
    ellipse(ctx, cx + 10, top + 15, 5, 9, "#f4e8c2");
  }
}
function drawMarker(ctx, x, y, text, color) {
  ellipse(ctx, x, y, 10, 11, "#214a46e8");
  ctx.font = "bold 15px Georgia";
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 5);
  ctx.textAlign = "left";
}
function drawMinimap(map, q) {
  const ctx = $("minimap").getContext("2d"),
    w = 132,
    h = 108,
    pad = 8,
    scale = Math.min((w - pad * 2) / map.w, (h - pad * 2) / map.h),
    ox = (w - map.w * scale) / 2,
    oy = (h - map.h * scale) / 2;
  ctx.fillStyle = "#173d39ed";
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const ch = map.grid[y][x];
      ctx.fillStyle =
        ch === "~"
          ? "#4da1ad"
          : ["#", "D", "C"].includes(ch)
            ? "#b5ae90"
            : ch === "," || ch === "m"
              ? "#d4bc82"
              : ch === "T"
                ? "#3d6754"
                : "#6d8b63";
      ctx.fillRect(ox + x * scale, oy + y * scale, scale + 0.3, scale + 0.3);
    }
  Object.keys(map.warps).forEach((pos) => {
    const [x, y] = pos.split(",").map(Number);
    ctx.fillStyle = "#f4efda";
    ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
  });
  if (q.map === map.id)
    ellipse(
      ctx,
      ox + (q.x + 0.5) * scale,
      oy + (q.y + 0.5) * scale,
      3.5,
      3.5,
      "#f1d98b",
    );
  ellipse(
    ctx,
    ox + (state.ow.tx + 0.5) * scale,
    oy + (state.ow.ty + 0.5) * scale,
    3,
    3,
    "#fff5c6",
  );
  ctx.strokeStyle = "#e4c477";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}
function drawBattleLandscape(ctx, w, h, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#74a8ae");
  sky.addColorStop(0.56, "#d9dab7");
  sky.addColorStop(0.57, "#8f9d66");
  sky.addColorStop(1, "#c7b580");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ellipse(ctx, w * 0.8, h * 0.21, 28, 28, "#f3df9a");
  poly(
    ctx,
    [
      [0, 175],
      [0, 95],
      [65, 62],
      [102, 105],
      [180, 39],
      [272, 122],
      [335, 77],
      [429, 130],
      [520, 95],
      [520, 185],
    ],
    "#658b83",
  );
  poly(
    ctx,
    [
      [0, 180],
      [0, 138],
      [120, 123],
      [215, 152],
      [380, 116],
      [520, 158],
      [520, 195],
    ],
    "#739476",
  );
  ctx.save();
  ctx.translate(390, 99);
  ctx.scale(0.3, 0.3);
  drawBuilding(ctx, 0, 0, 220, 145, true);
  ctx.restore();
  ellipse(ctx, 149, 265, 111, 22, "#73886455");
  ellipse(ctx, 357, 146, 84, 13, "#5b7e6566");
  for (let i = 0; i < 10; i++) {
    ctx.save();
    ctx.translate(i < 5 ? -15 : 485, (i % 5) * 40 + 145);
    ctx.scale(0.45, 0.45);
    drawOlive(ctx, 0, 0, i, 0, "T", t * 20);
    ctx.restore();
  }
}
function drawTitleLandscape() {
  const ctx = $("title-canvas").getContext("2d");
  const resolution = ctx.canvas.width / 960;
  ctx.setTransform(resolution, 0, 0, resolution, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.save();
  ctx.scale(960 / 520, 400 / 300);
  drawBattleLandscape(ctx, 520, 300, 1);
  ctx.restore();
  ctx.save();
  ctx.translate(365, 218);
  ctx.scale(3, 3);
  drawPerson(ctx, { sprite: "orpheus", dir: "down" }, 0, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(281, 249);
  ctx.scale(1.08, 1.08);
  drawWorldBeast(ctx, "fawnling");
  ctx.restore();
  ctx.save();
  ctx.translate(480, 259);
  ctx.scale(0.98, 0.98);
  drawWorldBeast(ctx, "calfin");
  ctx.restore();
  const shade = ctx.createLinearGradient(0, 250, 0, 400);
  shade.addColorStop(0, "transparent");
  shade.addColorStop(1, "#153c3b33");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 960, 400);
}
