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
  const G_W = 22;
  const G_H = 22;
  const G_CX = 11;
  const G_CY = 11.6;
  const G_R = 9.6;

  const TOM_RED = '#e0392c';
  const TOM_RED_D = '#a8241b';
  const TOM_RED_L = '#f4604f';
  const TOM_SEED = '#ffb3a4';
  const LEAF = '#4f9a2f';
  const LEAF_D = '#2f6b1b';
  const STALK = '#7a5a25';
  const MOUTH = '#4a1410';
  const TOOTH = '#fdf6ef';
  const TONGUE = '#e2657a';

  function mix(hex, other, k) {
    const a = parseInt(hex.slice(1), 16), b = parseInt(other.slice(1), 16);
    const r = Math.round((((a >> 16) & 255) * (1 - k)) + (((b >> 16) & 255) * k));
    const g = Math.round((((a >> 8) & 255) * (1 - k)) + (((b >> 8) & 255) * k));
    const bl = Math.round(((a & 255) * (1 - k)) + ((b & 255) * k));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  /**
   * The three tones of a tomato in a given colour. Blinky's red is the
   * Tomato Head as it comes; the other three are colour variants, which is
   * what keeps the four tellable apart at a glance.
   */
  function tomatoTones(mode, color) {
    if (mode === 'fright') return { light: '#3b4cf0', base: '#2b3ce0', dark: '#12227a' };
    if (mode === 'flash') return { light: '#ffffff', base: '#f4f4f4', dark: '#b8b8b8' };
    return {
      light: mix(color, '#ffffff', 0.3),
      base: color,
      dark: mix(color, '#000000', 0.42)
    };
  }

  /**
   * Tomato Head: a round tomato, the same silhouette family as the burger,
   * with the mascot's leafy crown, big eyes and wide grin.
   */
  function paintTomato(ctx, color, frame, mode) {
    const t = tomatoTones(mode, color);
    for (let y = 0; y < G_H; y++) {
      for (let x = 0; x < G_W; x++) {
        const dx = x + 0.5 - G_CX;
        const dy = y + 0.5 - G_CY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > G_R) continue;
        px(ctx, x, y, d > G_R - 1.2 ? t.dark : (d > G_R - 2.8 ? t.base : t.light));
      }
    }

    // a waxy highlight and a couple of seed flecks
    px(ctx, 5, 5, t.light, 3, 1);
    px(ctx, 4, 6, t.light, 2, 2);
    if (mode !== 'fright' && mode !== 'flash') {
      px(ctx, 16, 13, mix(color, '#ffffff', 0.55), 1, 1);
      px(ctx, 5, 15, mix(color, '#ffffff', 0.55), 1, 1);
    }

    // leafy crown and stalk
    const leaf = mode === 'flash' ? '#c9c9c9' : LEAF;
    const leafD = mode === 'flash' ? '#9a9a9a' : LEAF_D;
    px(ctx, 10, 0, STALK, 2, 3);
    px(ctx, 9, 0, STALK, 1, 1);
    px(ctx, 6, 2, leaf, 4, 1);
    px(ctx, 12, 2, leaf, 4, 1);
    px(ctx, 3, 3, leaf, 7, 2);
    px(ctx, 12, 3, leaf, 7, 2);
    px(ctx, 5, 5, leaf, 4, 1);
    px(ctx, 13, 5, leaf, 4, 1);
    px(ctx, 3, 4, leafD, 3, 1);
    px(ctx, 16, 4, leafD, 3, 1);
    px(ctx, 8, 3, leafD, 2, 1);
    px(ctx, 12, 3, leafD, 2, 1);

    // collar below the head, in the same colour
    px(ctx, 6, 19, t.dark, 10, 2);
    px(ctx, 5, 20, t.dark, 12, 1);
    px(ctx, 7, 19, t.base, 8, 1);
  }

  function paintFace(ctx, dir, mode) {
    if (mode === 'fright' || mode === 'flash') {
      const fg = mode === 'flash' ? '#d02020' : '#ffffff';
      px(ctx, 6, 9, fg, 2, 2);
      px(ctx, 14, 9, fg, 2, 2);
      for (let x = 5; x <= 16; x++) px(ctx, x, 14 + (x % 2 === 0 ? 0 : 1), fg);
      return;
    }
    let ox = 0, oy = 0;
    if (dir === 'left') ox = -1;
    if (dir === 'right') ox = 1;
    if (dir === 'up') oy = -1;
    if (dir === 'down') oy = 1;

    // eyes
    px(ctx, 5, 8, '#2a0c08', 5, 5);
    px(ctx, 12, 8, '#2a0c08', 5, 5);
    px(ctx, 6, 9, '#ffffff', 4, 4);
    px(ctx, 13, 9, '#ffffff', 4, 4);
    px(ctx, 7 + ox, 10 + oy, '#141414', 2, 2);
    px(ctx, 14 + ox, 10 + oy, '#141414', 2, 2);
    px(ctx, 6, 9, '#ffffff', 1, 1);

    // the big mascot grin
    px(ctx, 5, 14, MOUTH, 12, 4);
    px(ctx, 4, 15, MOUTH, 14, 2);
    px(ctx, 6, 14, TOOTH, 10, 1);
    px(ctx, 7, 17, TONGUE, 8, 1);
    px(ctx, 8, 18, TONGUE, 6, 1);
  }

  const ghostCache = {};

  function ghostSprite(color, frame, mode, dir) {
    const key = color + '|' + frame + '|' + mode + '|' + dir;
    if (ghostCache[key]) return ghostCache[key];
    const c = makeCanvas(G_W, G_H);
    if (mode === 'eaten') {
      px(c.ctx, 5, 8, '#ffffff', 5, 5);
      px(c.ctx, 12, 8, '#ffffff', 5, 5);
      paintFace(c.ctx, dir, 'eyesonly');
      // keep only the eyes: repaint them over a cleared canvas
      const e = makeCanvas(G_W, G_H);
      px(e.ctx, 5, 8, '#ffffff', 5, 5);
      px(e.ctx, 12, 8, '#ffffff', 5, 5);
      let ox = 0, oy = 0;
      if (dir === 'left') ox = -1;
      if (dir === 'right') ox = 1;
      if (dir === 'up') oy = -1;
      if (dir === 'down') oy = 1;
      px(e.ctx, 6 + ox, 9 + oy, '#1b3fd8', 2, 2);
      px(e.ctx, 13 + ox, 9 + oy, '#1b3fd8', 2, 2);
      ghostCache[key] = e.canvas;
      return e.canvas;
    }
    paintTomato(c.ctx, color, frame, mode);
    paintFace(c.ctx, dir, mode);
    ghostCache[key] = c.canvas;
    return c.canvas;
  }

  function drawGhost(ctx, cx, cy, size, color, frame, mode, dir) {
    const img = ghostSprite(color, frame, mode, dir);
    const scale = size / 19;          // the head spans about 19 of 22 columns
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, Math.round(cx - G_CX * scale), Math.round(cy - G_CY * scale),
      G_W * scale, G_H * scale);
  }

  /* ------------------------------------------------------------------ */
  /* PICK-UPS                                                            */
  /* ------------------------------------------------------------------ */
  /**
   * Mini shield (Small Shield Potion): a squat bottle of bright blue
   * shield fluid with a steel cap.
   */
  const MINI_SHIELD = [
    '   CC   ',
    '  cCCc  ',
    '  dBBd  ',
    ' dBBBBd ',
    ' BsBBBB ',
    ' BsBBBB ',
    ' dBBBBd ',
    '  dddd  '
  ];

  /**
   * Chug Jug: the big amber jug with a carry handle, steel nozzle and
   * white label.
   */
  const CHUG_JUG = [
    '    NN      ',
    '   cNNc     ',
    '   YYYY     ',
    '  jYYYYj H  ',
    ' jYYYYYYjHH ',
    ' YYYYYYYYhH ',
    ' YWWWWWWYhH ',
    ' YWLLLLWYhH ',
    ' YWWWWWWYhH ',
    ' YYYYYYYYhH ',
    ' YYYYYYYYHH ',
    ' jYYYYYYj H ',
    ' jYYYYYYj   ',
    '  jjjjjj    '
  ];



  const PICKUP_COLORS = {
    C: '#dfe6ef', c: '#9aa6b6', N: '#c9d2dd',            // steel
    B: '#4fc3ff', b: '#1b74b8', d: '#17608f', s: '#eafaff', // shield blue
    Y: '#f0bb36', y: '#b3811a', j: '#8a5f10',             // jug amber
    W: '#f2f5f8', L: '#2f7fd4',                           // label
    H: '#c7a02a', h: '#9a7a18',                           // handle
    w: '#ffffff', A: '#7ef0ff'
  };

  function bakePixels(map, palette, fallback) {
    const h = map.length;
    const w = map[0].length;
    const c = makeCanvas(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = map[y][x];
        if (ch === ' ') continue;
        px(c.ctx, x, y, palette[ch] || fallback || '#ff00ff');
      }
    }
    return c.canvas;
  }

  const miniShieldImg = bakePixels(MINI_SHIELD, PICKUP_COLORS);
  const chugJugImg = bakePixels(CHUG_JUG, PICKUP_COLORS);

  /**
   * The reboot card's circular arrow. Drawn rather than typed out, because a
   * ring and its arrowhead do not survive being written as a character map.
   */
  const rebootImg = (function () {
    const S = 16;
    const c = makeCanvas(S, S);
    const mid = S / 2;
    function ring(radius, color, from, to) {
      for (let a = from; a <= to; a += 2) {
        const r = (a * Math.PI) / 180;
        px(c.ctx, Math.round(mid + Math.cos(r) * radius - 0.5),
          Math.round(mid + Math.sin(r) * radius - 0.5), color);
      }
    }
    // dark rim, then the bright arc, leaving a gap at the top right
    ring(5.7, '#0d3a57', 315, 640);
    ring(4.3, '#0d3a57', 315, 640);
    ring(5.0, '#7ef0ff', 318, 636);
    ring(4.1, '#bff6ff', 340, 610);
    // the arrowhead sits on the end of the arc, sweeping clockwise
    px(c.ctx, 9, 0, '#0d3a57', 6, 1);
    px(c.ctx, 9, 1, '#7ef0ff', 5, 1);
    px(c.ctx, 10, 2, '#7ef0ff', 4, 1);
    px(c.ctx, 11, 3, '#7ef0ff', 3, 1);
    px(c.ctx, 12, 4, '#7ef0ff', 2, 1);
    px(c.ctx, 13, 5, '#0d3a57', 1, 1);
    px(c.ctx, 8, 1, '#0d3a57', 1, 1);
    px(c.ctx, 9, 2, '#0d3a57', 1, 1);
    return c.canvas;
  })();

  /** Mini shields stand in for the dots. */
  function drawCoin(ctx, cx, cy, size) {
    const s = (size / 6);
    const w = 8 * s, h = 8 * s;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(miniShieldImg, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
  }

  /** Chug jugs stand in for the power pellets. */
  function drawPotion(ctx, cx, cy, size, pulse) {
    const s = (size / 13) * (0.92 + 0.12 * pulse);
    const w = 12 * s, h = 14 * s;
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.shadowColor = 'rgba(255,205,80,0.9)';
    ctx.shadowBlur = 9 * pulse + 4;
    ctx.drawImage(chugJugImg, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
    ctx.restore();
  }

  /** The reboot card's circular arrow, used for the lives counter. */
  function drawReboot(ctx, cx, cy, size) {
    const s = size / 14;
    const w = 16 * s, h = 16 * s;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(rebootImg, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
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

  /* ------------------------------------------------------------------ */
  /* VICTORY ROYALE BANNER                                               */
  /* A slanted blue shard with torn ends, the gold #1 hanging off the    */
  /* left, and the two words stacked and leaning to the right.           */
  /* ------------------------------------------------------------------ */

  /** Parallelogram path: the top edge sits `skew` further right than the bottom. */
  function shard(ctx, x, y, w, h, skew) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + skew, y - h / 2);
    ctx.lineTo(x + w / 2 + skew, y - h / 2);
    ctx.lineTo(x + w / 2 - skew, y + h / 2);
    ctx.lineTo(x - w / 2 - skew, y + h / 2);
    ctx.closePath();
  }

  function bannerFill(ctx, h) {
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#2b7fd4');
    g.addColorStop(0.18, '#4fb4f2');
    g.addColorStop(0.45, '#2f96e2');
    g.addColorStop(0.75, '#1668bd');
    g.addColorStop(1, '#0d4b95');
    return g;
  }

  /**
   * @param {number} width overall width of the banner in canvas pixels
   * @param {string} font  font family string, e.g. '"Press Start 2P", monospace'
   */
  function drawVictoryBanner(ctx, cx, cy, width, font, shine) {
    const h = width * 0.27;
    const skew = h * 0.38;
    const tilt = -0.075;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.imageSmoothingEnabled = true;

    // ---- torn chips flying off each end ----
    const chips = [
      { x: -width * 0.575, y: h * 0.16, w: width * 0.045, h: h * 0.34, c: '#1c6fc4' },
      { x: -width * 0.635, y: h * 0.30, w: width * 0.03, h: h * 0.22, c: '#14589f' },
      { x: width * 0.570, y: -h * 0.20, w: width * 0.04, h: h * 0.30, c: '#2f96e2' },
      { x: width * 0.630, y: -h * 0.32, w: width * 0.028, h: h * 0.20, c: '#1c6fc4' }
    ];
    chips.forEach(function (c) {
      ctx.fillStyle = c.c;
      shard(ctx, c.x, c.y, c.w, c.h, c.h * 0.38);
      ctx.fill();
    });

    // ---- drop shadow ----
    ctx.fillStyle = 'rgba(4, 22, 50, 0.55)';
    shard(ctx, h * 0.10, h * 0.12, width, h, skew);
    ctx.fill();

    // ---- body ----
    ctx.fillStyle = bannerFill(ctx, h);
    shard(ctx, 0, 0, width, h, skew);
    ctx.fill();

    // clip everything decorative to the bander body
    ctx.save();
    shard(ctx, 0, 0, width, h, skew);
    ctx.clip();

    // light band across the top, dark band along the bottom
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    shard(ctx, 0, -h * 0.40, width, h * 0.16, skew);
    ctx.fill();
    ctx.fillStyle = 'rgba(2, 30, 70, 0.38)';
    shard(ctx, 0, h * 0.44, width, h * 0.14, skew);
    ctx.fill();

    // diagonal shine streaks, drifting
    const drift = ((shine || 0) % 1) * width;
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    shard(ctx, -width * 0.15 + drift * 0.15, 0, width * 0.06, h, skew * 2.2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    shard(ctx, width * 0.12 + drift * 0.15, 0, width * 0.10, h, skew * 2.2);
    ctx.fill();
    ctx.restore();

    // ---- outline ----
    ctx.strokeStyle = '#0a3c7d';
    ctx.lineWidth = Math.max(2, h * 0.045);
    ctx.lineJoin = 'miter';
    shard(ctx, 0, 0, width, h, skew);
    ctx.stroke();

    // ---- lettering ----
    // Sizes are measured rather than assumed: the page font may still be
    // loading (or blocked), and the fallback has very different metrics.
    const numBox = width * 0.30;        // space reserved for the #1
    const textLeft = -width * 0.5 + numBox + skew * 0.5;
    const textRight = width * 0.5 - skew * 0.9;
    const textRoom = textRight - textLeft;

    let size = h * 0.30;
    ctx.font = 'bold ' + Math.round(size) + 'px ' + font;
    const widest = Math.max(ctx.measureText('VICTORY').width, ctx.measureText('ROYALE').width);
    if (widest > textRoom * 0.94) size *= (textRoom * 0.94) / widest;
    size = Math.max(6, Math.round(size));
    ctx.font = 'bold ' + size + 'px ' + font;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    function word(text, x, y) {
      ctx.save();
      ctx.translate(x, y);
      ctx.transform(1, 0, -0.16, 1, 0, 0);     // italic lean
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.55;
      ctx.strokeStyle = '#0d2f66';
      ctx.strokeText(text, 0, 0);
      ctx.lineWidth = size * 0.22;
      ctx.strokeStyle = '#7fc4ff';
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    // VICTORY sits left, ROYALE is indented under it, like the real banner
    const vWidth = ctx.measureText('VICTORY').width;
    const rWidth = ctx.measureText('ROYALE').width;
    word('VICTORY', textLeft, -h * 0.17);
    word('ROYALE', textLeft + Math.max(size * 0.6, (vWidth - rWidth) * 0.9), h * 0.20);

    // ---- gold #1, overlapping the left end ----
    let numSize = h * 0.62;
    ctx.font = 'bold ' + Math.round(numSize) + 'px ' + font;
    const numWidth = ctx.measureText('#1').width;
    if (numWidth > numBox * 0.92) numSize *= (numBox * 0.92) / numWidth;
    numSize = Math.max(8, Math.round(numSize));
    ctx.font = 'bold ' + numSize + 'px ' + font;

    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(-width * 0.5 + numBox * 0.52, h * 0.08);
    ctx.transform(1, 0, -0.16, 1, 0, 0);
    ctx.lineJoin = 'round';
    ctx.lineWidth = numSize * 0.5;
    ctx.strokeStyle = '#4a2c02';
    ctx.strokeText('#1', 0, 0);
    ctx.lineWidth = numSize * 0.2;
    ctx.strokeStyle = '#a3700c';
    ctx.strokeText('#1', 0, 0);
    const gold = ctx.createLinearGradient(0, -numSize * 0.6, 0, numSize * 0.6);
    gold.addColorStop(0, '#fff3b0');
    gold.addColorStop(0.45, '#ffd447');
    gold.addColorStop(1, '#e09a10');
    ctx.fillStyle = gold;
    ctx.fillText('#1', 0, 0);
    ctx.restore();

    ctx.restore();
  }

  global.Sprites = {
    drawVictoryBanner: drawVictoryBanner,
    drawReboot: drawReboot,
    drawPac: drawPac,
    drawPacDeath: drawPacDeath,
    drawGhost: drawGhost,
    drawCoin: drawCoin,
    drawPotion: drawPotion,
    drawLoot: drawLoot,
    LOOT: LOOT
  };
})(window);
