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

  const LEAF = '#4f9a2f';
  const LEAF_D = '#2f6b1b';
  const STALK = '#7a5a25';

  function mix(hex, other, k) {
    const a = parseInt(hex.slice(1), 16), b = parseInt(other.slice(1), 16);
    const r = Math.round((((a >> 16) & 255) * (1 - k)) + (((b >> 16) & 255) * k));
    const g = Math.round((((a >> 8) & 255) * (1 - k)) + (((b >> 8) & 255) * k));
    const bl = Math.round(((a & 255) * (1 - k)) + ((b & 255) * k));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  // Tomato Head is red, full stop. What tells the four apart is the collar
  // below the head, which is why the head can stay accurate.
  const TOMATO_HEAD = { light: '#f4685a', base: '#e2392b', dark: '#a81f16', spec: '#ff9c90' };
  const FRIGHT = { light: '#4b5cf5', base: '#2b3ce0', dark: '#101f78', spec: '#8c98ff' };
  const FLASHT = { light: '#ffffff', base: '#f0f0f0', dark: '#b0b0b0', spec: '#ffffff' };

  function headTones(mode) {
    if (mode === 'fright') return FRIGHT;
    if (mode === 'flash') return FLASHT;
    return TOMATO_HEAD;
  }

  const HEAD_CX = 11;
  const HEAD_CY = 10.4;
  const HEAD_R = 8.9;

  /**
   * Tomato Head: the round red tomato with its leafy crown, big eyes and
   * mascot grin, over a collar in this ghost's colour.
   */
  function paintTomato(ctx, color, frame, mode) {
    const t = headTones(mode);

    // ---- collar, drawn first so the head overlaps it ----
    const collar = mode === 'fright' ? '#1b2ba8' : (mode === 'flash' ? '#c8c8c8' : color);
    const collarD = mix(mode === 'fright' ? '#1b2ba8' : (mode === 'flash' ? '#c8c8c8' : color), '#000000', 0.45);
    px(ctx, 3, 17, collarD, 16, 5);
    px(ctx, 4, 17, collar, 14, 3);
    px(ctx, 2, 19, collarD, 18, 2);
    px(ctx, 3, 19, collar, 16, 1);
    // a couple of folds so the collar is not a flat slab
    px(ctx, 6, 20, collarD, 2, 1);
    px(ctx, 14, 20, collarD, 2, 1);

    // ---- the tomato ----
    for (let y = 0; y < G_H; y++) {
      for (let x = 0; x < G_W; x++) {
        const dx = x + 0.5 - HEAD_CX;
        const dy = y + 0.5 - HEAD_CY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > HEAD_R) continue;
        px(ctx, x, y, d > HEAD_R - 1.2 ? t.dark : (d > HEAD_R - 2.6 ? t.base : t.light));
      }
    }
    // waxy specular highlight, top left
    px(ctx, 5, 4, t.spec, 3, 1);
    px(ctx, 4, 5, t.spec, 2, 2);
    px(ctx, 6, 5, t.light, 1, 1);

    // ---- leafy crown ----
    const leaf = mode === 'flash' ? '#c9c9c9' : LEAF;
    const leafD = mode === 'flash' ? '#9a9a9a' : LEAF_D;
    px(ctx, 10, 0, STALK, 2, 3);
    px(ctx, 9, 1, STALK, 1, 1);
    // five leaves radiating from the stalk
    px(ctx, 7, 2, leaf, 3, 1);
    px(ctx, 12, 2, leaf, 3, 1);
    px(ctx, 4, 3, leaf, 6, 2);
    px(ctx, 12, 3, leaf, 6, 2);
    px(ctx, 9, 3, leaf, 4, 1);
    px(ctx, 3, 4, leaf, 3, 1);
    px(ctx, 16, 4, leaf, 3, 1);
    px(ctx, 6, 5, leaf, 2, 1);
    px(ctx, 14, 5, leaf, 2, 1);
    px(ctx, 3, 5, leafD, 3, 1);
    px(ctx, 16, 5, leafD, 3, 1);
    px(ctx, 8, 4, leafD, 2, 1);
    px(ctx, 12, 4, leafD, 2, 1);
    px(ctx, 5, 4, leafD, 2, 1);
    px(ctx, 15, 4, leafD, 1, 1);
  }

  function paintFace(ctx, dir, mode) {
    if (mode === 'fright' || mode === 'flash') {
      const fg = mode === 'flash' ? '#d02020' : '#ffffff';
      px(ctx, 6, 8, fg, 2, 2);
      px(ctx, 14, 8, fg, 2, 2);
      for (let x = 5; x <= 16; x++) px(ctx, x, 13 + (x % 2 === 0 ? 0 : 1), fg);
      return;
    }
    let ox = 0, oy = 0;
    if (dir === 'left') ox = -1;
    if (dir === 'right') ox = 1;
    if (dir === 'up') oy = -1;
    if (dir === 'down') oy = 1;

    // big mascot eyes
    px(ctx, 5, 7, '#2a0c08', 5, 5);
    px(ctx, 12, 7, '#2a0c08', 5, 5);
    px(ctx, 6, 8, '#ffffff', 4, 4);
    px(ctx, 13, 8, '#ffffff', 4, 4);
    px(ctx, 7 + ox, 9 + oy, '#141414', 2, 2);
    px(ctx, 14 + ox, 9 + oy, '#141414', 2, 2);
    px(ctx, 6, 8, '#ffffff', 1, 1);
    px(ctx, 13, 8, '#ffffff', 1, 1);

    // the wide grin: dark mouth, tooth row, tongue
    px(ctx, 5, 13, '#4a1410', 12, 4);
    px(ctx, 4, 14, '#4a1410', 14, 2);
    px(ctx, 6, 13, '#fdf6ef', 10, 1);
    px(ctx, 7, 16, '#e2657a', 8, 1);
    px(ctx, 9, 17, '#e2657a', 4, 1);
  }


  // Raven: the hooded figure from the reference. A purple hood with a black
  // face opening, big white eyes with purple pupils, a purple scarf over the
  // mouth, blue feathers on one shoulder, a strap with a silver buckle across
  // a dark cloak, and a ragged hem. The band near the hem carries this enemy's
  // identity colour, so four of them in a maze still read apart.
  //
  // K outline   L/h/H/d hood, light to dark   F face opening
  // S/s scarf   C/c cloak   B/b feathers   T strap   M buckle   X/x band
  const RAVEN_BODY = [
    '........KKKKKK........',
    '......KKLLLhhhKK......',
    '.....KLLhhhhhhhdK.....',
    '....KLhhhhhhhhhhdK....',
    '...KLhhhhhhhhhhhhdK...',
    '...KhhhHHHHHHHHhhdK...',
    '..KhhHFFFFFFFFFFHhdK..',
    '..KhHFFFFFFFFFFFFHdK..',
    '..KhHFFFFFFFFFFFFHdK..',
    '..KhHFFFFFFFFFFFFHdK..',
    '..KhHFFFFFFFFFFFFHdK..',
    '..KdHFFFFFFFFFFFFHdK..',
    '.BKdHsSSSSSSSSSSsHdK..',
    'BbKsSSSSSSSSSSSSSSsK..',
    '.BbKsSSSSSSSSSSSSsK...',
    '..BKTTCCCCCCCCCCCCK...',
    '..KcCCTTMCCCCCCCCCcK..',
    '..KcCCCCCCTTCCCCCCcK..',
    '.KxXXXXXXXXXXXXXXXXxK.',
    '.KcCCCCCCCCCCCCCCCCcK.'
  ];
  // the hem flutters between two shapes on the walk cycle
  const RAVEN_HEM = [
    ['..KCCK..KCCCCK..KCCK..', '...KK....KKKK....KK...'],
    ['...KCCK.KCCCCK.KCCK...', '....KK...KKKK...KK....']
  ];

  function ravenPalette(color, mode) {
    if (mode === 'fright' || mode === 'flash') {
      const t = mode === 'fright' ? FRIGHT : FLASHT;
      const band = mode === 'fright' ? '#1b2ba8' : '#c8c8c8';
      return {
        K: mode === 'fright' ? '#070c33' : '#7a7a7a', L: t.spec, h: t.light, H: t.base,
        d: t.dark, F: mode === 'fright' ? '#0b1250' : '#9a9a9a', S: t.light, s: t.base,
        C: t.dark, c: t.dark, B: t.light, b: t.base, T: t.dark, M: t.spec,
        X: band, x: mix(band, '#000000', 0.45)
      };
    }
    return {
      K: '#120a1e', L: '#b48af0', h: '#8a5ccf', H: '#6b3fb0', d: '#47287f',
      F: '#07040c', S: '#a457e8', s: '#7433b8', C: '#3b2468', c: '#271747',
      B: '#5468f5', b: '#3140b8', T: '#6e3d1c', M: '#d4d8e0',
      X: color, x: mix(color, '#000000', 0.45)
    };
  }

  function paintRows(ctx, rows, y0, pal) {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        let end = x;
        while (end + 1 < row.length && row[end + 1] === ch) end++;
        px(ctx, x, y0 + r, pal[ch], end - x + 1, 1);
        x = end;
      }
    }
  }

  function paintRaven(ctx, color, frame, mode) {
    const pal = ravenPalette(color, mode);
    paintRows(ctx, RAVEN_BODY, 0, pal);
    paintRows(ctx, RAVEN_HEM[frame ? 1 : 0], RAVEN_BODY.length, pal);
  }

  function paintRavenFace(ctx, dir, mode) {
    if (mode === 'fright' || mode === 'flash') {
      // the scared face, inside the hood opening
      const fg = mode === 'flash' ? '#d02020' : '#ffffff';
      px(ctx, 7, 8, fg, 2, 2);
      px(ctx, 13, 8, fg, 2, 2);
      for (let x = 6; x <= 15; x++) px(ctx, x, 10 + (x % 2 === 0 ? 0 : 1), fg);
      return;
    }
    let ox = 0, oy = 0;
    if (dir === 'left') ox = -1;
    if (dir === 'right') ox = 1;
    if (dir === 'up') oy = -1;
    if (dir === 'down') oy = 1;

    // big white eyes, corners softened so they read round
    px(ctx, 6, 7, '#ffffff', 4, 5);
    px(ctx, 12, 7, '#ffffff', 4, 5);
    const SOFT = '#d9c8ff';
    px(ctx, 6, 7, SOFT, 1, 1); px(ctx, 9, 7, SOFT, 1, 1);
    px(ctx, 6, 11, SOFT, 1, 1); px(ctx, 9, 11, SOFT, 1, 1);
    px(ctx, 12, 7, SOFT, 1, 1); px(ctx, 15, 7, SOFT, 1, 1);
    px(ctx, 12, 11, SOFT, 1, 1); px(ctx, 15, 11, SOFT, 1, 1);
    // narrow purple slits that follow the direction of travel
    px(ctx, 8 + ox, 8 + oy, '#a020d0', 1, 3);
    px(ctx, 13 + ox, 8 + oy, '#a020d0', 1, 3);
    px(ctx, 8 + ox, 10 + oy, '#5e1288', 1, 1);
    px(ctx, 13 + ox, 10 + oy, '#5e1288', 1, 1);
  }

  /* ------------------------------------------------------------------ */
  /* JONESY - the blonde soldier                                         */
  /* ------------------------------------------------------------------ */
  const JONESY = { light: '#ffd3a8', base: '#f0a97c', dark: '#bd7749', spec: '#ffeada' };
  const HAIR = '#f0c23c';
  const HAIR_L = '#ffe37a';
  const HAIR_D = '#b8860d';
  const OLIVE = '#6b7343';
  const OLIVE_D = '#464c2a';
  const SHIELD = '#e8a05a';
  const SHIELD_D = '#a96c31';

  function jonesyTones(mode) {
    if (mode === 'fright') return FRIGHT;
    if (mode === 'flash') return FLASHT;
    return JONESY;
  }

  /**
   * Jonesy: the round face under a mop of blonde hair, an olive tunic and
   * the little skull shield on his shoulder.
   */
  function paintJonesy(ctx, color, frame, mode) {
    const t = jonesyTones(mode);
    const flat = mode === 'fright' || mode === 'flash';

    // ---- tunic collar, in this ghost's colour ----
    const collar = mode === 'fright' ? '#1b2ba8' : (mode === 'flash' ? '#c8c8c8' : color);
    const collarD = mix(collar === color ? color : collar, '#000000', 0.45);
    px(ctx, 3, 17, collarD, 16, 5);
    px(ctx, 4, 17, collar, 14, 3);
    px(ctx, 2, 19, collarD, 18, 2);
    px(ctx, 3, 19, collar, 16, 1);
    if (!flat) {
      // olive shoulders over the collar
      px(ctx, 4, 16, OLIVE, 14, 2);
      px(ctx, 3, 18, OLIVE_D, 3, 2);
      px(ctx, 16, 18, OLIVE_D, 3, 2);
      // the strap across the chest
      px(ctx, 7, 18, OLIVE_D, 8, 1);
      px(ctx, 10, 19, '#9aa2ab', 2, 2);
    }

    // ---- the face ----
    for (let y = 0; y < G_H; y++) {
      for (let x = 0; x < G_W; x++) {
        const dx = x + 0.5 - HEAD_CX;
        const dy = y + 0.5 - HEAD_CY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > HEAD_R) continue;
        px(ctx, x, y, d > HEAD_R - 1.2 ? t.dark : (d > HEAD_R - 2.6 ? t.base : t.light));
      }
    }
    if (!flat) {
      px(ctx, 5, 6, t.spec, 2, 1);
      px(ctx, 15, 14, t.dark, 2, 1);           // jaw shadow
    }

    // ---- blonde hair: a spiky cap over the top of the head ----
    const hair = flat ? (mode === 'flash' ? '#d8d8d8' : '#3344cc') : HAIR;
    const hairL = flat ? (mode === 'flash' ? '#f0f0f0' : '#5566ee') : HAIR_L;
    const hairD = flat ? (mode === 'flash' ? '#a8a8a8' : '#1b2ba8') : HAIR_D;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < G_W; x++) {
        const dx = x + 0.5 - HEAD_CX;
        const dy = y + 0.5 - HEAD_CY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > HEAD_R - 0.2) continue;
        // the face starts at row 4; below that only the side locks remain,
        // so the eyes sit on skin rather than under a helmet of hair
        if (y >= 4 && x >= 5 && x <= 16) continue;
        px(ctx, x, y, d > HEAD_R - 1.6 ? hairD : hair);
      }
    }
    // a ragged fringe across the brow
    px(ctx, 5, 4, hair, 2, 1);
    px(ctx, 8, 4, hair, 2, 1);
    px(ctx, 12, 4, hair, 2, 1);
    px(ctx, 15, 4, hair, 2, 1);
    // the spikes along the top
    px(ctx, 7, 0, hair, 3, 2);
    px(ctx, 11, 0, hair, 2, 2);
    px(ctx, 14, 1, hair, 2, 2);
    px(ctx, 5, 2, hair, 2, 2);
    px(ctx, 8, 1, hairL, 1, 1);
    px(ctx, 12, 1, hairL, 1, 1);
    px(ctx, 6, 3, hairL, 3, 1);
    px(ctx, 3, 5, hairD, 2, 3);
    px(ctx, 17, 5, hairD, 2, 3);

    if (flat) return;

    // ---- skull shield on the shoulder ----
    // kept small and low: at play size the head is the thing that has to
    // read, and a big slab beside it just muddies the silhouette
    px(ctx, 0, 15, SHIELD_D, 5, 6);
    px(ctx, 1, 16, SHIELD, 3, 4);
    px(ctx, 1, 17, '#3a2216', 3, 2);           // skull
    px(ctx, 2, 17, SHIELD, 1, 1);
  }

  /* ------------------------------------------------------------------ */
  /* CUDDLE TEAM LEADER - the pink bear                                  */
  /* ------------------------------------------------------------------ */
  const CUDDLE = { light: '#ff74b4', base: '#ef4b94', dark: '#b32a68', spec: '#ffb3d6' };
  const MUZZLE = '#ffd3e8';
  const MUZZLE_D = '#e39dc0';

  function cuddleTones(mode) {
    if (mode === 'fright') return FRIGHT;
    if (mode === 'flash') return FLASHT;
    return CUDDLE;
  }

  /**
   * Cuddle Team Leader: round bear head with two ears, a pale muzzle and
   * the broken heart on the bib.
   */
  function paintCuddle(ctx, color, frame, mode) {
    const t = cuddleTones(mode);
    const flat = mode === 'fright' || mode === 'flash';

    // ---- collar / bib, in this ghost's colour ----
    const collar = mode === 'fright' ? '#1b2ba8' : (mode === 'flash' ? '#c8c8c8' : color);
    const collarD = mix(collar === color ? color : collar, '#000000', 0.45);
    px(ctx, 3, 17, collarD, 16, 5);
    px(ctx, 4, 17, collar, 14, 3);
    px(ctx, 2, 19, collarD, 18, 2);
    px(ctx, 3, 19, collar, 16, 1);
    if (!flat) {
      // paws either side
      px(ctx, 2, 16, t.base, 3, 4);
      px(ctx, 17, 16, t.base, 3, 4);
      px(ctx, 2, 16, t.light, 2, 2);
      px(ctx, 18, 16, t.light, 2, 2);
      // the white bib and its broken heart
      px(ctx, 8, 18, '#fdf0f6', 6, 4);
      px(ctx, 9, 19, '#1a1016', 1, 2);
      px(ctx, 12, 19, '#1a1016', 1, 2);
      px(ctx, 10, 19, '#1a1016', 1, 1);
      px(ctx, 11, 20, '#1a1016', 1, 1);
      px(ctx, 10, 21, '#1a1016', 2, 1);
    }

    // ---- ears, behind the head ----
    const earD = flat ? t.dark : mix('#ef4b94', '#000000', 0.35);
    px(ctx, 1, 1, earD, 6, 6);
    px(ctx, 15, 1, earD, 6, 6);
    px(ctx, 2, 2, t.base, 4, 4);
    px(ctx, 16, 2, t.base, 4, 4);
    if (!flat) {
      px(ctx, 3, 3, MUZZLE, 2, 2);
      px(ctx, 17, 3, MUZZLE, 2, 2);
    }

    // ---- the head ----
    for (let y = 0; y < G_H; y++) {
      for (let x = 0; x < G_W; x++) {
        const dx = x + 0.5 - HEAD_CX;
        const dy = y + 0.5 - HEAD_CY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > HEAD_R) continue;
        px(ctx, x, y, d > HEAD_R - 1.2 ? t.dark : (d > HEAD_R - 2.6 ? t.base : t.light));
      }
    }
    if (flat) return;
    px(ctx, 5, 4, t.spec, 3, 1);
    px(ctx, 4, 5, t.spec, 2, 2);
    px(ctx, 14, 6, t.spec, 2, 1);
  }

  /** The pale muzzle and heart nose, drawn over the eyes' row. */
  function paintCuddleFace(ctx, dir, mode) {
    if (mode === 'fright' || mode === 'flash') { paintFace(ctx, dir, mode); return; }
    let ox = 0, oy = 0;
    if (dir === 'left') ox = -1;
    if (dir === 'right') ox = 1;
    if (dir === 'up') oy = -1;
    if (dir === 'down') oy = 1;

    px(ctx, 5, 7, '#2a0c18', 5, 5);
    px(ctx, 12, 7, '#2a0c18', 5, 5);
    px(ctx, 6, 8, '#ffffff', 4, 4);
    px(ctx, 13, 8, '#ffffff', 4, 4);
    px(ctx, 7 + ox, 9 + oy, '#141414', 2, 2);
    px(ctx, 14 + ox, 9 + oy, '#141414', 2, 2);
    px(ctx, 6, 8, '#ffffff', 1, 1);
    px(ctx, 13, 8, '#ffffff', 1, 1);

    // muzzle
    px(ctx, 7, 12, MUZZLE_D, 8, 5);
    px(ctx, 7, 12, MUZZLE, 7, 4);
    // heart nose
    px(ctx, 9, 13, '#1a1016', 1, 2);
    px(ctx, 12, 13, '#1a1016', 1, 2);
    px(ctx, 10, 13, '#1a1016', 2, 1);
    px(ctx, 10, 14, '#1a1016', 2, 1);
    px(ctx, 10, 15, '#1a1016', 2, 1);
  }

  const ghostCache = {};

  function ghostSprite(color, frame, mode, dir, skin) {
    const key = skin + '|' + color + '|' + frame + '|' + mode + '|' + dir;
    if (ghostCache[key]) return ghostCache[key];
    const c = makeCanvas(G_W, G_H);
    if (mode === 'eaten') {
      // keep only the eyes
      const e = makeCanvas(G_W, G_H);
      px(e.ctx, 5, 7, '#ffffff', 5, 5);
      px(e.ctx, 12, 7, '#ffffff', 5, 5);
      let ox = 0, oy = 0;
      if (dir === 'left') ox = -1;
      if (dir === 'right') ox = 1;
      if (dir === 'up') oy = -1;
      if (dir === 'down') oy = 1;
      px(e.ctx, 6 + ox, 8 + oy, '#1b3fd8', 2, 2);
      px(e.ctx, 13 + ox, 8 + oy, '#1b3fd8', 2, 2);
      ghostCache[key] = e.canvas;
      return e.canvas;
    }
    if (skin === 'raven') {
      paintRaven(c.ctx, color, frame, mode);
      paintRavenFace(c.ctx, dir, mode);
    } else if (skin === 'jonesy') {
      paintJonesy(c.ctx, color, frame, mode);
      paintFace(c.ctx, dir, mode);
    } else if (skin === 'cuddle') {
      paintCuddle(c.ctx, color, frame, mode);
      paintCuddleFace(c.ctx, dir, mode);
    } else {
      paintTomato(c.ctx, color, frame, mode);
      paintFace(c.ctx, dir, mode);
    }
    outline(c.canvas);
    ghostCache[key] = c.canvas;
    return c.canvas;
  }

  /** One dark pixel around every opaque pixel, so a sprite reads against a busy map. */
  function outline(canvas) {
    const x = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const img = x.getImageData(0, 0, w, h), d = img.data, a = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3];
    for (let py = 0; py < h; py++) {
      for (let px2 = 0; px2 < w; px2++) {
        const i = py * w + px2;
        if (a[i]) continue;
        if ((px2 > 0 && a[i - 1]) || (px2 < w - 1 && a[i + 1]) ||
            (py > 0 && a[i - w]) || (py < h - 1 && a[i + w])) {
          d[i * 4] = 10; d[i * 4 + 1] = 6; d[i * 4 + 2] = 12; d[i * 4 + 3] = 235;
        }
      }
    }
    x.putImageData(img, 0, 0);
  }

  function drawGhost(ctx, cx, cy, size, color, frame, mode, dir, skin) {
    const img = ghostSprite(color, frame, mode, dir, skin || 'tomato');
    const scale = size / 19;          // the head spans about 18 of 22 columns
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, Math.round(cx - 11 * scale), Math.round(cy - 11 * scale),
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
    '     nNNn       ',
    '     NNNN       ',
    '    cNNNNc      ',
    '    jSSSSj      ',
    '   jYSSSSYj     ',
    '  jYYYYYYYYj HH ',
    ' jYYYYYYYYYYjHHH',
    ' YSYYYYYYYYYYH h',
    ' YSWWWWWWWWYYH h',
    ' YSWLLLLLLWYYH h',
    ' YSWWWWWWWWYYH h',
    ' YSYYYYYYYYYYH h',
    ' YSYYYYYYYYYYHHH',
    ' jYYYYYYYYYYj HH',
    '  jYYYYYYYYj    ',
    '   jjjjjjjj     '
  ];



  const PICKUP_COLORS = {
    C: '#dfe6ef', c: '#9aa6b6', N: '#c9d2dd',            // steel
    B: '#4fc3ff', b: '#1b74b8', d: '#17608f', s: '#ffe58a', // shield blue / jug sheen
    Y: '#f5c132', y: '#b3811a', j: '#8a5f10',             // jug amber
    W: '#f2f5f8', L: '#2f7fd4',                           // label
    S: '#ffe9a0',                                         // liquid highlight
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
    const s = (size / 15) * (0.92 + 0.12 * pulse);
    const w = 16 * s, h = 16 * s;
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
  /**
   * The Loot Llama: a piñata in cream, blue and magenta with a pack strapped
   * to its back. Every bonus pick-up is one of these; what changes with the
   * level is what it is worth.
   */
  const LLAMA = [
    '        wwww    ',
    '       wWWWWm   ',
    '       wWbbWm   ',
    '       wWWWWm   ',
    '        wWWm    ',
    '     wwwwWWm    ',
    '   wWWWWWWWm    ',
    '  wWWWWWWWWWm   ',
    '  mBBBBBBBBBm   ',
    '  mBpBpBpBpBm   ',
    '  mWWWWWWWWWm   ',
    '  mWWWWWWWWWm   ',
    '  mWpWWWWWpWm   ',
    '  mmWmmmmWmm    ',
    '   mWm  mWm     ',
    '   mmm  mmm     '
  ];

  const LLAMA_COLORS = {
    W: '#f4f1e8',      // cream body
    w: '#ffffff',      // highlight
    m: '#5a4a52',      // outline
    B: '#3fb8e8',      // blue band
    p: '#ff4fc3',      // magenta detail
    b: '#2a2a33'       // eye
  };

  function makeLlama() {
    return bakePixels(LLAMA, LLAMA_COLORS);
  }

  const llamaImg = makeLlama();
  const LOOT = [
    { name: 'Loot Llama', points: 100, img: llamaImg },
    { name: 'Loot Llama', points: 300, img: llamaImg },
    { name: 'Loot Llama', points: 500, img: llamaImg },
    { name: 'Loot Llama', points: 1000, img: llamaImg }
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


  /* ------------------------------------------------------------------ */
  /* POWER-UPS                                                           */
  /* ------------------------------------------------------------------ */
  const PU_COLORS = {
    R: '#e8342a', r: '#a5180f', G: '#3f9a2b', g: '#256b18',   // chili
    Y: '#ffd447', y: '#c79a12', W: '#fff6d0', O: '#f0a03a',   // gold
    B: '#4fc3ff', b: '#1b74b8', w: '#eafaff',                 // shield / freeze
    P: '#c6a6ff', p: '#7a4fd0',                               // shockwave
    N: '#e8e8ee', n: '#8d8d99', M: '#e8342a',                 // magnet
    k: '#20202a'
  };

  const PU_MAPS = {
    chili: [
      '      gG  ',
      '     GG   ',
      '    RRR   ',
      '   RRRRr  ',
      '   RRRRr  ',
      '   rRRRr  ',
      '    rRRr  ',
      '    rRRr  ',
      '     rr   ',
      '          '
    ],
    golden: [
      '   WWWW   ',
      '  WYYYYW  ',
      ' WYYYYYYW ',
      ' YYYYYYYY ',
      ' WWWWWWWW ',
      ' YOOOOOOY ',
      ' YYYYYYYY ',
      '  yYYYYy  ',
      '   yyyy   ',
      '          '
    ],
    shield: [
      '   BBBB   ',
      '  BwwwwB  ',
      ' BwBBBBwB ',
      ' BwBwwBwB ',
      ' BwBwwBwB ',
      ' BwBBBBwB ',
      '  BwwwwB  ',
      '   BBBB   ',
      '    bb    ',
      '          '
    ],
    freeze: [
      '    w     ',
      ' w  w  w  ',
      '  w w w   ',
      '   www    ',
      ' wwwWwww  ',
      '   www    ',
      '  w w w   ',
      ' w  w  w  ',
      '    w     ',
      '          '
    ],
    shock: [
      '   PPPP   ',
      '  P    P  ',
      ' P  PP  P ',
      ' P PppP P ',
      ' P PppP P ',
      ' P  PP  P ',
      '  P    P  ',
      '   PPPP   ',
      '          ',
      '          '
    ],
    magnet: [
      '  NNNNNN  ',
      ' NnnnnnnN ',
      ' Nn    nN ',
      ' Nn    nN ',
      ' Nn    nN ',
      ' Nn    nN ',
      ' MM    MM ',
      ' MM    MM ',
      ' mm    mm ',
      '          '
    ]
  };

  const puImages = {};
  Object.keys(PU_MAPS).forEach(function (key) {
    puImages[key] = bakePixels(PU_MAPS[key], PU_COLORS, '#ff00ff');
  });

  /** A power-up sitting on the board, bobbing and glowing. */
  function drawPowerUp(ctx, key, cx, cy, size, pulse) {
    const img = puImages[key];
    if (!img) return;
    const s = (size / 10) * (0.94 + 0.1 * pulse);
    const w = 10 * s, h = 10 * s;
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.8)';
    ctx.shadowBlur = 6 + 5 * pulse;
    ctx.drawImage(img, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
    ctx.restore();
  }

  /** The same icon, flat, for the active-power-up strip in the HUD. */
  function drawPowerUpIcon(ctx, key, x, y, size) {
    const img = puImages[key];
    if (!img) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, Math.round(x), Math.round(y), size, size);
  }

  global.Sprites = {
    drawPowerUp: drawPowerUp,
    drawPowerUpIcon: drawPowerUpIcon,
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
