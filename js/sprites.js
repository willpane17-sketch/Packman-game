/* ==========================================================================
   sprites.js - all artwork is generated as pixel art at load time.
   Every sprite is painted on a tiny offscreen canvas (1 unit = 1 fat pixel)
   and then blown up with image smoothing disabled, which keeps the chunky
   arcade look at any resolution.
   ========================================================================== */
(function (global) {
  'use strict';

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return { canvas: c, ctx: ctx };
  }

  function px(ctx, x, y, color, w, h) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w || 1, h || 1);
  }

  /* ------------------------------------------------------------------ */
  /* BURGER HERO (the Pac-Man replacement)                              */
  /* ------------------------------------------------------------------ */
  const PAC_W = 16;
  const PAC_H = 21;
  const PAC_CX = 8;
  const PAC_CY = 12.5;
  const PAC_R = 7.4;

  const BUN = '#f0a03a';
  const BUN_DARK = '#d8862a';
  const OUTLINE = '#7d4310';
  const SESAME = '#ffeecb';
  const TOMATO = '#e34635';
  const TOMATO_D = '#a82a1e';
  const CHEESE = '#ffc933';
  const CHEESE_D = '#d29a12';
  const PATTY = '#7d4519';
  const PATTY_D = '#552b0c';

  // Horizontal layers of the burger, top to bottom (sprite rows).
  // The body occupies rows 5..20, so the bands below add up to a whole burger.
  function layerColor(row) {
    if (row <= 11) return [BUN, BUN_DARK];        // top bun
    if (row === 12) return [TOMATO, TOMATO_D];    // tomato
    if (row <= 14) return [CHEESE, CHEESE_D];     // cheese
    if (row <= 16) return [PATTY, PATTY_D];       // patty
    return [BUN, BUN_DARK];                       // bottom bun
  }

  const bodyLayer = makeCanvas(PAC_W, PAC_H);
  (function paintBody() {
    const ctx = bodyLayer.ctx;
    for (let y = 0; y < PAC_H; y++) {
      for (let x = 0; x < PAC_W; x++) {
        const dx = x + 0.5 - PAC_CX;
        const dy = y + 0.5 - PAC_CY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > PAC_R) continue;
        const pair = layerColor(y);
        if (d > PAC_R - 0.9) px(ctx, x, y, OUTLINE);
        else if (d > PAC_R - 1.8) px(ctx, x, y, pair[1]);
        else px(ctx, x, y, pair[0]);
      }
    }
    // sesame seeds on the top bun
    [[5, 7], [8, 6], [11, 8], [4, 9], [9, 9]].forEach(function (p) {
      px(ctx, p[0], p[1], SESAME);
    });
    // melted cheese dripping over the patty
    px(ctx, 4, 15, CHEESE);
    px(ctx, 8, 15, CHEESE);
    px(ctx, 11, 15, CHEESE);
    px(ctx, 8, 16, CHEESE_D);
  })();

  const garnishLayer = makeCanvas(PAC_W, PAC_H);
  (function paintGarnish() {
    const ctx = garnishLayer.ctx;
    // toothpick
    px(ctx, 8, 3, '#c8a165', 1, 3);
    // olive
    px(ctx, 6, 0, '#2f6b1b', 4, 1);
    px(ctx, 5, 1, '#3f8a25', 6, 2);
    px(ctx, 6, 3, '#2f6b1b', 4, 1);
    // pimento
    px(ctx, 7, 1, '#e34b4b', 2, 2);
  })();

  const eyeLayer = makeCanvas(PAC_W, PAC_H);
  (function paintEyes() {
    const ctx = eyeLayer.ctx;
    // cartoon eyes with a thin outline, drawn on top of everything so the
    // mouth cut can never eat them
    function eye(x) {
      const dark = '#3a1d05';
      px(ctx, x, 6, dark, 3, 1);        // top edge
      px(ctx, x, 10, dark, 3, 1);       // bottom edge
      px(ctx, x - 1, 7, dark, 1, 3);    // left edge
      px(ctx, x + 3, 7, dark, 1, 3);    // right edge
      px(ctx, x, 7, '#ffffff', 3, 3);   // white
      px(ctx, x + 1, 8, '#141414', 2, 2); // pupil
      px(ctx, x, 7, '#ffffff', 1, 1);   // glint
    }
    eye(4);
    eye(9);
  })();

  const pacScratch = makeCanvas(PAC_W, PAC_H);

  const DIR_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

  /**
   * Draw the burger hero.
   * @param {number} openness 0 = closed mouth, 1 = fully open
   */
  function drawPac(ctx, cx, cy, size, dir, openness) {
    const s = pacScratch.ctx;
    s.clearRect(0, 0, PAC_W, PAC_H);
    s.drawImage(bodyLayer.canvas, 0, 0);

    if (openness > 0.02) {
      // the mouth hinges below the eyes so it never swallows them
      const half = (dir === 'up' ? 0.42 : 0.60) * openness;
      const a = DIR_ANGLE[dir] !== undefined ? DIR_ANGLE[dir] : 0;
      const my = dir === 'up' ? PAC_CY + 2.5 : PAC_CY + 1;
      s.save();
      s.globalCompositeOperation = 'destination-out';
      s.beginPath();
      s.moveTo(PAC_CX, my);
      s.arc(PAC_CX, my, PAC_R + 5, a - half, a + half);
      s.closePath();
      s.fill();
      s.restore();
    }
    s.drawImage(garnishLayer.canvas, 0, 0);
    s.drawImage(eyeLayer.canvas, 0, 0);

    const scale = size / 15;
    const w = PAC_W * scale;
    const h = PAC_H * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pacScratch.canvas, Math.round(cx - PAC_CX * scale), Math.round(cy - PAC_CY * scale), w, h);
  }

  /** Death animation: the burger gets eaten away, wedge growing to a full circle. */
  function drawPacDeath(ctx, cx, cy, size, t) {
    const s = pacScratch.ctx;
    s.clearRect(0, 0, PAC_W, PAC_H);
    s.drawImage(bodyLayer.canvas, 0, 0);
    const half = Math.min(Math.PI, t * Math.PI);
    s.save();
    s.globalCompositeOperation = 'destination-out';
    s.beginPath();
    s.moveTo(PAC_CX, PAC_CY);
    s.arc(PAC_CX, PAC_CY, PAC_R + 4, -Math.PI / 2 - half, -Math.PI / 2 + half);
    s.closePath();
    s.fill();
    s.restore();
    if (t < 0.75) {
      s.drawImage(garnishLayer.canvas, 0, 0);
      s.drawImage(eyeLayer.canvas, 0, 0);
    }
    const scale = size / 15;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = Math.max(0, 1 - t * 0.6);
    ctx.drawImage(pacScratch.canvas, Math.round(cx - PAC_CX * scale), Math.round(cy - PAC_CY * scale),
      PAC_W * scale, PAC_H * scale);
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ */
  /* PIXEL JONESY GHOSTS                                                */
  /* ------------------------------------------------------------------ */
  const G_W = 16;
  const G_H = 16;

  const SKIN = '#f3c295';
  const SKIN_D = '#c9915f';
  const HAIR = '#d8c04a';
  const HAIR_D = '#a68f22';
  const VEST = '#23232f';
  const VEST_L = '#3a3a4c';
  const GUN = '#2a2a2a';
  const GUN_L = '#4d4d4d';

  // Ghost silhouette: rounded dome on top, straight sides, wavy skirt below.
  const SPANS = [
    [5, 10], [3, 12], [2, 13], [1, 14],
    [1, 14], [1, 14], [1, 14], [1, 14],
    [1, 14], [1, 14], [1, 14], [1, 14],
    [1, 14], [1, 14], [1, 14], [1, 14]
  ];

  /** Fill a row, clipped to the ghost silhouette so nothing spills outside. */
  function row(ctx, y, x0, x1, color) {
    const sp = SPANS[y];
    if (!sp) return;
    const a = Math.max(x0, sp[0]);
    const b = Math.min(x1, sp[1]);
    if (b < a) return;
    px(ctx, a, y, color, b - a + 1);
  }

  function feetMask(ctx, frame) {
    // carve the wavy bottom (two animation frames)
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const notches = frame === 0 ? [[1, 2], [6, 2], [11, 2]] : [[3, 2], [8, 2], [13, 1]];
    notches.forEach(function (n) {
      ctx.fillRect(n[0], 14, n[1], 2);
    });
    ctx.fillRect(0, 15, 1, 1);
    ctx.fillRect(15, 15, 1, 1);
    ctx.restore();
  }

  function paintJonesy(ctx, color, frame, mode) {
    // ---- base body ----
    for (let y = 0; y < G_H; y++) {
      row(ctx, y, 0, 15, mode === 'fright' ? '#2b3ce0' : (mode === 'flash' ? '#f4f4f4' : color));
    }

    if (mode === 'fright' || mode === 'flash') {
      feetMask(ctx, frame);
      const fg = mode === 'flash' ? '#d02020' : '#ffffff';
      px(ctx, 4, 5, fg, 2, 2);
      px(ctx, 10, 5, fg, 2, 2);
      for (let x = 3; x <= 12; x++) px(ctx, x, 10 + (x % 2 === 0 ? 0 : 1), fg);
      return;
    }

    // ---- Jonesy: blonde hair, face, tactical vest, rifle ----
    // hair, clipped to the dome so the head stays round
    row(ctx, 0, 0, 15, HAIR);
    row(ctx, 1, 0, 15, HAIR);
    row(ctx, 2, 0, 15, HAIR);
    row(ctx, 3, 0, 15, HAIR);
    row(ctx, 1, 4, 6, HAIR_D);       // a little parting
    row(ctx, 2, 3, 4, HAIR_D);
    // face
    row(ctx, 4, 3, 12, SKIN);
    row(ctx, 5, 2, 13, SKIN);
    row(ctx, 6, 2, 13, SKIN);
    row(ctx, 7, 3, 12, SKIN);
    // sideburns / fringe over the temples
    px(ctx, 2, 4, HAIR, 1, 1);
    px(ctx, 13, 4, HAIR, 1, 1);
    px(ctx, 4, 4, HAIR_D, 2, 1);
    px(ctx, 10, 4, HAIR_D, 2, 1);
    // jaw + neck
    row(ctx, 8, 4, 11, SKIN_D);
    row(ctx, 9, 3, 12, VEST);

    // tactical vest with a coloured trim so each ghost stays identifiable
    row(ctx, 10, 1, 14, VEST);
    row(ctx, 11, 1, 14, VEST);
    row(ctx, 12, 1, 14, VEST);
    row(ctx, 13, 1, 14, VEST);
    row(ctx, 10, 6, 9, VEST_L);      // zip / chest plate
    row(ctx, 11, 7, 8, VEST_L);
    row(ctx, 12, 7, 8, VEST_L);
    px(ctx, 1, 10, color, 2, 4);     // shoulder trim
    px(ctx, 13, 10, color, 2, 4);
    px(ctx, 1, 9, color, 1, 1);
    px(ctx, 14, 9, color, 1, 1);

    // rifle held across the chest
    row(ctx, 12, 2, 13, GUN);
    px(ctx, 3, 13, GUN, 3, 1);
    px(ctx, 11, 11, GUN_L, 3, 1);
    px(ctx, 13, 12, GUN_L, 1, 1);

    feetMask(ctx, frame);
  }

  function paintEyes(ctx, dir, mode) {
    if (mode === 'fright' || mode === 'flash') return;
    let ox = 0, oy = 0;
    if (dir === 'left') ox = -1;
    if (dir === 'right') ox = 1;
    if (dir === 'up') oy = -1;
    if (dir === 'down') oy = 1;
    // whites
    px(ctx, 4, 5, '#ffffff', 3, 3);
    px(ctx, 9, 5, '#ffffff', 3, 3);
    px(ctx, 4, 4, '#3b2a10', 3, 1);   // brow line
    px(ctx, 9, 4, '#3b2a10', 3, 1);
    // pupils
    px(ctx, 5 + ox, 6 + oy, '#1b3fd8', 1, 1);
    px(ctx, 10 + ox, 6 + oy, '#1b3fd8', 1, 1);
  }

  const ghostCache = {};

  function ghostSprite(color, frame, mode, dir) {
    const key = color + '|' + frame + '|' + mode + '|' + (mode === 'eaten' ? dir : '-');
    if (ghostCache[key]) return ghostCache[key];
    const c = makeCanvas(G_W, G_H);
    if (mode === 'eaten') {
      paintEyes(c.ctx, dir, 'normal');
    } else {
      paintJonesy(c.ctx, color, frame, mode);
      paintEyes(c.ctx, dir, mode);
    }
    ghostCache[key] = c.canvas;
    return c.canvas;
  }

  function drawGhost(ctx, cx, cy, size, color, frame, mode, dir) {
    const img = ghostSprite(color, frame, mode, dir);
    const scale = size / 14;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, Math.round(cx - 8 * scale), Math.round(cy - 8 * scale), G_W * scale, G_H * scale);
  }

  /* ------------------------------------------------------------------ */
  /* PICK-UPS                                                            */
  /* ------------------------------------------------------------------ */
  const coin = makeCanvas(8, 8);
  (function () {
    const ctx = coin.ctx;
    px(ctx, 2, 1, '#b8860b', 4, 1);
    px(ctx, 1, 2, '#ffd447', 6, 4);
    px(ctx, 2, 6, '#b8860b', 4, 1);
    px(ctx, 2, 2, '#fff2ba', 1, 2);
    px(ctx, 3, 3, '#a9761a', 2, 2);
  })();

  const potion = makeCanvas(12, 12);
  (function () {
    const ctx = potion.ctx;
    px(ctx, 4, 0, '#cfd6e6', 4, 1);   // cap
    px(ctx, 5, 1, '#8d97ad', 2, 2);   // neck
    px(ctx, 3, 3, '#7ad0ff', 6, 1);
    px(ctx, 2, 4, '#2ea8f0', 8, 6);
    px(ctx, 3, 10, '#1b74b8', 6, 1);
    px(ctx, 3, 5, '#bdefff', 2, 2);   // shine
  })();

  function drawCoin(ctx, cx, cy, size) {
    const s = size / 6;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(coin.canvas, Math.round(cx - 4 * s), Math.round(cy - 4 * s), 8 * s, 8 * s);
  }

  function drawPotion(ctx, cx, cy, size, pulse) {
    const s = (size / 9) * (0.9 + 0.15 * pulse);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.shadowColor = 'rgba(60,180,255,0.9)';
    ctx.shadowBlur = 8 * pulse + 4;
    ctx.drawImage(potion.canvas, Math.round(cx - 6 * s), Math.round(cy - 6 * s), 12 * s, 12 * s);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /* BONUS LOOT (the "fruit")                                            */
  /* ------------------------------------------------------------------ */
  function makeLlama() {
    const c = makeCanvas(16, 16);
    const ctx = c.ctx;
    const P = '#ff5fd0', B = '#3ec8ff', W = '#fdf6ff';
    px(ctx, 3, 4, W, 9, 6);      // body
    px(ctx, 3, 10, W, 2, 4);     // legs
    px(ctx, 9, 10, W, 2, 4);
    px(ctx, 10, 1, W, 4, 4);     // head
    px(ctx, 9, 3, W, 2, 2);      // neck
    px(ctx, 10, 0, P, 1, 1);     // ears
    px(ctx, 13, 0, P, 1, 1);
    px(ctx, 3, 4, P, 9, 2);      // blanket
    px(ctx, 3, 8, B, 9, 1);
    px(ctx, 12, 2, '#101010', 1, 1);
    return c.canvas;
  }

  function makeFries() {
    const c = makeCanvas(16, 16);
    const ctx = c.ctx;
    px(ctx, 5, 1, '#ffd447', 1, 6);
    px(ctx, 7, 0, '#ffe27a', 1, 7);
    px(ctx, 9, 2, '#ffd447', 1, 5);
    px(ctx, 4, 6, '#e23b3b', 8, 9);
    px(ctx, 6, 8, '#fdf6ff', 1, 5);
    px(ctx, 9, 8, '#fdf6ff', 1, 5);
    return c.canvas;
  }

  function makeChug() {
    const c = makeCanvas(16, 16);
    const ctx = c.ctx;
    px(ctx, 5, 0, '#8d97ad', 5, 2);
    px(ctx, 4, 2, '#e2b23c', 8, 12);
    px(ctx, 5, 4, '#f7d980', 2, 8);
    px(ctx, 12, 5, '#8d97ad', 2, 4);
    px(ctx, 4, 13, '#a5801e', 8, 2);
    return c.canvas;
  }

  function makeShield() {
    const c = makeCanvas(16, 16);
    const ctx = c.ctx;
    px(ctx, 4, 1, '#5ce1e6', 8, 8);
    px(ctx, 5, 9, '#5ce1e6', 6, 2);
    px(ctx, 6, 11, '#5ce1e6', 4, 2);
    px(ctx, 7, 13, '#5ce1e6', 2, 1);
    px(ctx, 6, 3, '#ffffff', 4, 4);
    return c.canvas;
  }

  const LOOT = [
    { name: 'Loot Llama', points: 100, img: makeLlama() },
    { name: 'Fries', points: 300, img: makeFries() },
    { name: 'Chug Jug', points: 500, img: makeChug() },
    { name: 'Shield', points: 1000, img: makeShield() }
  ];

  function drawLoot(ctx, index, cx, cy, size) {
    const item = LOOT[index % LOOT.length];
    const s = size / 14;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(item.img, Math.round(cx - 8 * s), Math.round(cy - 8 * s), 16 * s, 16 * s);
  }

  global.Sprites = {
    drawPac: drawPac,
    drawPacDeath: drawPacDeath,
    drawGhost: drawGhost,
    drawCoin: drawCoin,
    drawPotion: drawPotion,
    drawLoot: drawLoot,
    LOOT: LOOT
  };
})(window);
