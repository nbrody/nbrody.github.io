"use strict";
/* Illustrated Orpheus shares the beasts' full-color storybook style.
   A 110 × 144 figure, with a shared ground line at y=136 in every direction. */
function drawKeeperFigure(ctx, direction = "down", time = 0) {
  if (ART_MODE === "gen") {
    const key = "orpheus-" + (direction === "right" ? "left" : direction);
    loadWorldArt(key);
    const art = worldArt[key];
    if (art?.status === "ready") {
      const [sx, sy, sw, sh] = art.bbox;
      const scale = Math.min(98 / sw, 130 / sh);
      const dw = sw * scale,
        dh = sh * scale;
      const bob = time ? Math.abs(Math.sin(time / 90)) * 2.5 : 0;
      ctx.save();
      spShadow(ctx, 55, 138, 25);
      if (direction === "right") {
        ctx.translate(110, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(
        art.canvas,
        sx,
        sy,
        sw,
        sh,
        55 - dw / 2,
        136 - dh - bob,
        dw,
        dh,
      );
      ctx.restore();
      return;
    }
  }
  drawKeeperVector(ctx, direction, time);
}

function drawKeeperVector(ctx, direction = "down", time = 0) {
  const back = direction === "up";
  const side = direction === "left" || direction === "right";
  const stride = time ? Math.sin(time / 90) * 5 : 0;
  const bob = time ? Math.abs(Math.sin(time / 90)) * 1.5 : 0;
  const teal = "#477e78",
    gold = "#d5af63";
  ctx.save();
  spShadow(ctx, 55, 138, 25);
  if (direction === "right") {
    ctx.translate(110, 0);
    ctx.scale(-1, 1);
  }
  // Sandals and moving calves remain grounded while the robe rises slightly.
  spStroke(
    ctx,
    [
      [45, 108],
      [44 - stride * 0.3, 122],
      [40 - stride, 133],
    ],
    8,
    INK,
  );
  spStroke(
    ctx,
    [
      [62, 108],
      [64 + stride * 0.3, 122],
      [68 + stride, 133],
    ],
    8,
    INK,
  );
  spFill(
    ctx,
    [
      [34 - stride, 131],
      [46 - stride, 131],
      [48 - stride, 136],
      [33 - stride, 136],
    ],
    INK,
  );
  spFill(
    ctx,
    [
      [62 + stride, 131],
      [74 + stride, 131],
      [77 + stride, 136],
      [61 + stride, 136],
    ],
    INK,
  );
  spStroke(
    ctx,
    [
      [37 - stride, 129],
      [44 - stride, 132],
    ],
    2,
    SLIP,
  );
  spStroke(
    ctx,
    [
      [64 + stride, 130],
      [71 + stride, 132],
    ],
    2,
    SLIP,
  );
  ctx.translate(0, -bob);
  // A wind-caught cloak, bounded by the same soft ink contours as the beasts.
  spInk(ctx, [
    [47, 46],
    [72, 45],
    [83, 73],
    [91, 105],
    [75, 116],
    [56, 106],
    [42, 71],
  ]);
  spFill(
    ctx,
    [
      [50, 51],
      [70, 49],
      [79, 76],
      [86, 104],
      [75, 110],
      [59, 101],
      [47, 69],
    ],
    teal,
  );
  spStroke(
    ctx,
    [
      [66, 57],
      [67, 82],
      [78, 103],
    ],
    2,
    SLIP,
  );
  spStroke(
    ctx,
    [
      [72, 59],
      [77, 83],
      [83, 103],
    ],
    1.5,
    gold,
  );
  // Chiton: a single silhouette, carved with a few folds and a Greek border.
  spInk(ctx, [
    [40, 48],
    [62, 48],
    [70, 64],
    [72, 92],
    [78, 113],
    [58, 119],
    [31, 111],
    [37, 82],
    [34, 64],
  ]);
  if (!back) {
    spFill(
      ctx,
      [
        [41, 54],
        [52, 56],
        [47, 72],
        [43, 99],
        [35, 108],
        [40, 82],
        [38, 64],
      ],
      SLIP,
    );
    spStroke(
      ctx,
      [
        [60, 65],
        [57, 89],
        [60, 108],
      ],
      2,
      SLIP,
    );
    spStroke(
      ctx,
      [
        [48, 84],
        [45, 110],
      ],
      1.5,
      SLIP,
    );
    spStroke(
      ctx,
      [
        [65, 84],
        [69, 108],
      ],
      1.5,
      SLIP,
    );
  } else {
    spFill(
      ctx,
      [
        [42, 52],
        [62, 50],
        [68, 70],
        [73, 107],
        [58, 112],
        [36, 105],
        [41, 77],
      ],
      teal,
    );
    spStroke(
      ctx,
      [
        [51, 59],
        [48, 85],
        [43, 104],
      ],
      2,
      SLIP,
    );
    spStroke(
      ctx,
      [
        [61, 63],
        [61, 88],
        [67, 106],
      ],
      1.5,
      SLIP,
    );
  }
  spStroke(
    ctx,
    [
      [36, 110],
      [57, 115],
      [73, 110],
    ],
    3,
    gold,
  );
  for (let i = 0; i < 4; i++) {
    const x = 39 + i * 7;
    spStroke(
      ctx,
      [
        [x, 108],
        [x, 104],
        [x + 4, 104],
        [x + 4, 108],
      ],
      1.2,
      SLIP,
      0,
    );
  }
  spStroke(
    ctx,
    [
      [38, 77],
      [52, 79],
      [66, 76],
    ],
    3,
    gold,
  );
  // Left hand relaxed; the other steadies the lyre at the hip.
  spStroke(
    ctx,
    [
      [36, 58],
      [28, 75],
      [31 + stride * 0.4, 88],
    ],
    8,
    INK,
  );
  spStroke(
    ctx,
    [
      [34, 63],
      [29, 75],
      [32 + stride * 0.4, 86],
    ],
    3,
    SLIP,
  );
  spFill(
    ctx,
    [
      [29, 84],
      [35, 84],
      [37, 92],
      [32, 96],
      [28, 91],
    ],
    SLIP,
  );
  spStroke(
    ctx,
    [
      [66, 59],
      [77, 72],
      [80, 85],
    ],
    8,
    INK,
  );
  spStroke(
    ctx,
    [
      [69, 63],
      [76, 73],
      [78, 81],
    ],
    3,
    SLIP,
  );
  drawKeeperLyre(ctx, 78, 87, gold);
  // Neck and a generous curly silhouette make him legible at walking scale.
  spFill(
    ctx,
    [
      [45, 41],
      [59, 42],
      [61, 53],
      [51, 59],
      [41, 52],
    ],
    INK,
  );
  if (!back)
    spFill(
      ctx,
      [
        [47, 43],
        [56, 43],
        [56, 51],
        [49, 54],
        [45, 50],
      ],
      SLIP,
    );
  spInk(ctx, [
    [31, 29],
    [32, 15],
    [45, 9],
    [61, 9],
    [74, 19],
    [76, 37],
    [66, 49],
    [48, 50],
    [32, 42],
  ]);
  if (!back) {
    const face = side
      ? [
          [39, 22],
          [56, 20],
          [65, 27],
          [61, 43],
          [49, 48],
          [38, 40],
          [31, 34],
          [37, 31],
        ]
      : [
          [37, 23],
          [52, 19],
          [67, 24],
          [67, 37],
          [58, 46],
          [47, 47],
          [37, 39],
        ];
    spFill(ctx, face, SLIP);
    if (side) {
      spStroke(
        ctx,
        [
          [37, 29],
          [43, 28],
        ],
        2,
        INK,
      );
      ellipse(ctx, 40, 31, 1.7, 2.2, INK);
      spStroke(
        ctx,
        [
          [35, 37],
          [43, 39],
        ],
        1.4,
        INK,
      );
    } else {
      spStroke(
        ctx,
        [
          [40, 29],
          [46, 28],
        ],
        1.8,
        INK,
      );
      spStroke(
        ctx,
        [
          [56, 28],
          [62, 29],
        ],
        1.8,
        INK,
      );
      ellipse(ctx, 44, 32, 1.8, 2.4, INK);
      ellipse(ctx, 59, 32, 1.8, 2.4, INK);
      spStroke(
        ctx,
        [
          [49, 39],
          [54, 40],
          [58, 38],
        ],
        1.3,
        INK,
      );
    }
  }
  const curls = back
    ? [
        [36, 22],
        [46, 17],
        [59, 16],
        [70, 22],
        [71, 34],
        [63, 43],
        [49, 43],
        [36, 34],
        [52, 31],
      ]
    : [
        [34, 23],
        [42, 17],
        [55, 15],
        [66, 19],
        [72, 28],
        [71, 39],
      ];
  for (const [x, y] of curls) {
    ellipse(ctx, x, y, 6.5, 6.2, INK);
    spStroke(
      ctx,
      [
        [x - 2, y + 1],
        [x - 3, y - 2],
        [x + 1, y - 3],
      ],
      1.2,
      "#a38f6b",
    );
  }
  // Wreath with discrete leaf shapes, never a floating halo.
  spStroke(
    ctx,
    [
      [33, 23],
      [39, 14],
      [52, 11],
      [66, 15],
      [73, 24],
    ],
    2,
    gold,
  );
  for (const [x, y, angle] of [
    [36, 19, -0.9],
    [43, 13, -0.5],
    [62, 13, 0.5],
    [70, 19, 0.9],
  ]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    spFill(
      ctx,
      [
        [0, 0],
        [-3, -4],
        [0, -9],
        [3, -4],
      ],
      gold,
    );
    ctx.restore();
  }
  ellipse(ctx, 64, 55, 3, 3, gold);
  ctx.restore();
}

function drawKeeperLyre(ctx, x, y, gold) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.15);
  spFill(
    ctx,
    [
      [-13, -3],
      [-9, 11],
      [0, 15],
      [11, 10],
      [14, -3],
      [7, -7],
      [-6, -7],
    ],
    INK,
  );
  spFill(
    ctx,
    [
      [-10, 0],
      [-6, 9],
      [1, 11],
      [8, 8],
      [11, 0],
    ],
    gold,
  );
  spStroke(
    ctx,
    [
      [-10, 3],
      [-15, -20],
      [-12, -27],
      [-7, -23],
    ],
    4,
    INK,
  );
  spStroke(
    ctx,
    [
      [10, 3],
      [15, -20],
      [12, -27],
      [7, -23],
    ],
    4,
    INK,
  );
  spStroke(
    ctx,
    [
      [-10, 2],
      [-13, -20],
      [-11, -24],
    ],
    1.8,
    gold,
  );
  spStroke(
    ctx,
    [
      [10, 2],
      [13, -20],
      [11, -24],
    ],
    1.8,
    gold,
  );
  spStroke(
    ctx,
    [
      [-13, -19],
      [13, -19],
    ],
    3,
    gold,
  );
  for (let i = -6; i <= 6; i += 4)
    spStroke(
      ctx,
      [
        [i, -18],
        [i * 0.65, 6],
      ],
      1,
      SLIP,
    );
  ctx.restore();
}
