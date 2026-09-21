/* ==========================================================================
   backdrop.js - the aerial map behind the board.
   Painted procedurally at a realistic, non-pixelated scale (the board and its
   sprites stay pixel art; the world they sit in does not), then redrawn when
   the window resizes or the player picks a different map. Deterministic, so
   the same POI looks the same on every visit.
   ========================================================================== */
(function (global) {
  'use strict';

  /** Small deterministic PRNG so the landscape never shuffles between runs. */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a += 0x6d2b79f5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const GRASS = ['#4f8236', '#598c3c', '#457430', '#628f45', '#3d6a2a', '#6d9950'];
  const ROOFS = ['#b9bec4', '#a8aeb5', '#8e5a44', '#9c6b4a', '#cdc3ae', '#7f8790', '#6f7d88'];
  const ASPHALT = '#8d9298';
  const ASPHALT_D = '#6f757c';

  /* ------------------------------------------------------------------ */
  /* SHARED PIECES                                                       */
  /* ------------------------------------------------------------------ */

  function blob(ctx, x, y, r, color, rand) {
    ctx.fillStyle = color;
    ctx.beginPath();
    const points = 10;
    for (let i = 0; i <= points; i++) {
      const a = (i / points) * Math.PI * 2;
      const rr = r * (0.7 + rand() * 0.45);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr * 0.8;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  /** Ground texture: mown bands and worn patches, so grass is not flat. */
  function groundTexture(ctx, w, h, rand) {
    for (let i = 0; i < 110; i++) {
      blob(ctx, rand() * w, rand() * h, 40 + rand() * 170,
        GRASS[Math.floor(rand() * GRASS.length)], rand);
    }
    ctx.save();
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 16; i++) {
      blob(ctx, rand() * w, rand() * h, 30 + rand() * 90, '#8a7c4e', rand);
    }
    ctx.restore();
    // a light dappling pass
    ctx.save();
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = rand() > 0.5 ? '#ffffff' : '#000000';
      const s = 2 + rand() * 7;
      ctx.fillRect(rand() * w, rand() * h, s, s);
    }
    ctx.restore();
  }

  /** A single tree: shadow, trunk canopy, sunlit crown. */
  function tree(ctx, x, y, r, rand) {
    ctx.fillStyle = 'rgba(12,24,8,0.28)';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.45, y + r * 0.5, r * 1.05, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    const deep = rand() > 0.5 ? '#1f3d17' : '#25491b';
    ctx.fillStyle = deep;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rand() > 0.5 ? '#3a6b28' : '#437a2d';
    ctx.beginPath();
    ctx.arc(x - r * 0.2, y - r * 0.22, r * 0.68, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(150,200,110,0.5)';
    ctx.beginPath();
    ctx.arc(x - r * 0.34, y - r * 0.36, r * 0.26, 0, Math.PI * 2);
    ctx.fill();
  }

  function treeCluster(ctx, x, y, n, spread, rand) {
    for (let i = 0; i < n; i++) {
      tree(ctx, x + (rand() - 0.5) * spread, y + (rand() - 0.5) * spread * 0.8,
        7 + rand() * 11, rand);
    }
  }

  function stroke(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i][0] + pts[i + 1][0]) / 2;
      const yc = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], xc, yc);
    }
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    ctx.stroke();
  }

  /** A road: dirt shoulder, kerb, asphalt, centre line. */
  function road(ctx, pts, width, dashed) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(30,40,24,0.35)';
    ctx.lineWidth = width + 10;
    stroke(ctx, pts);
    ctx.strokeStyle = '#b9b09a';
    ctx.lineWidth = width + 5;
    stroke(ctx, pts);
    ctx.strokeStyle = ASPHALT_D;
    ctx.lineWidth = width + 1;
    stroke(ctx, pts);
    ctx.strokeStyle = ASPHALT;
    ctx.lineWidth = width;
    stroke(ctx, pts);
    if (dashed !== false) {
      ctx.setLineDash([12, 16]);
      ctx.strokeStyle = 'rgba(255,248,214,0.5)';
      ctx.lineWidth = Math.max(1.5, width * 0.06);
      stroke(ctx, pts);
      ctx.setLineDash([]);
    }
  }

  /**
   * A building seen from above: cast shadow, roof, parapet highlight and
   * rooftop clutter.
   */
  function building(ctx, x, y, w, h, rand, roof) {
    ctx.fillStyle = 'rgba(8,16,10,0.4)';
    ctx.fillRect(x + w * 0.06 + 3, y + h * 0.08 + 4, w, h);
    const color = roof || ROOFS[Math.floor(rand() * ROOFS.length)];
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    // parapet
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y + h - Math.max(2, h * 0.12), w, Math.max(2, h * 0.12));
    // rooftop clutter
    const units = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < units; i++) {
      const uw = Math.max(3, w * (0.12 + rand() * 0.2));
      const uh = Math.max(3, h * (0.12 + rand() * 0.2));
      const ux = x + 3 + rand() * Math.max(1, w - uw - 6);
      const uy = y + 3 + rand() * Math.max(1, h - uh - 6);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(ux + 2, uy + 2, uw, uh);
      ctx.fillStyle = rand() > 0.6 ? '#79818a' : '#565e66';
      ctx.fillRect(ux, uy, uw, uh);
    }
    if (rand() > 0.6 && w > 26 && h > 26) {          // skylight
      ctx.fillStyle = 'rgba(150,210,255,0.55)';
      ctx.fillRect(x + w * 0.55, y + h * 0.2, w * 0.22, h * 0.16);
    }
  }

  /** A car park with painted bays. */
  function carPark(ctx, x, y, w, h, rand) {
    ctx.fillStyle = ASPHALT_D;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    for (let bx = x + 6; bx < x + w - 6; bx += 11) {
      ctx.fillRect(bx, y + 4, 1.5, h * 0.36);
      ctx.fillRect(bx, y + h * 0.6, 1.5, h * 0.36);
    }
    // a few parked cars
    for (let i = 0; i < 4; i++) {
      if (rand() > 0.55) continue;
      const cw = 7, ch = 12;
      const cx = x + 6 + rand() * (w - 14);
      const cy = rand() > 0.5 ? y + 5 : y + h - ch - 5;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(cx + 1, cy + 2, cw, ch);
      ctx.fillStyle = ['#c0392b', '#2d6fb8', '#e0e0e0', '#2f2f35'][Math.floor(rand() * 4)];
      ctx.fillRect(cx, cy, cw, ch);
      ctx.fillStyle = 'rgba(180,220,255,0.6)';
      ctx.fillRect(cx + 1, cy + 3, cw - 2, 3);
    }
  }

  function vignette(ctx, w, h, strength) {
    const cx = w / 2, cy = h / 2;
    const v = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.28, cx, cy, Math.max(w, h) * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,' + (strength || 0.5) + ')');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  /* ------------------------------------------------------------------ */
  /* TILTED TOWERS                                                       */
  /* ------------------------------------------------------------------ */
  function paintCity(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    const rand = rng(20250914);

    const base = ctx.createLinearGradient(0, 0, w * 0.3, h);
    base.addColorStop(0, '#598c3c');
    base.addColorStop(0.55, '#4a7c33');
    base.addColorStop(1, '#3c6729');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    groundTexture(ctx, w, h, rand);

    // ---- the river down the east side, with banks and a bridge ----
    const riverX = w * 0.88;
    const riverPts = [];
    for (let y = -20; y <= h + 20; y += h / 9) {
      riverPts.push([riverX + Math.sin(y / 150) * w * 0.035, y]);
    }
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#7d7a4e';                 // silt bank
    ctx.lineWidth = w * 0.155;
    stroke(ctx, riverPts);
    ctx.strokeStyle = '#c9c193';                 // sand
    ctx.lineWidth = w * 0.135;
    stroke(ctx, riverPts);
    ctx.strokeStyle = '#2f6f92';                 // deep water
    ctx.lineWidth = w * 0.115;
    stroke(ctx, riverPts);
    ctx.strokeStyle = '#3f90b5';
    ctx.lineWidth = w * 0.085;
    stroke(ctx, riverPts);
    ctx.strokeStyle = 'rgba(190,230,245,0.25)';
    ctx.lineWidth = w * 0.03;
    stroke(ctx, riverPts);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 70; i++) {
      const y = rand() * h;
      const x = riverX + Math.sin(y / 150) * w * 0.035 + (rand() - 0.5) * w * 0.07;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 8 + rand() * 20, y + (rand() - 0.5) * 3);
      ctx.stroke();
    }

    // ---- road network ----
    const rw = Math.max(13, w * 0.022);
    road(ctx, [[-30, h * 0.2], [w * 0.2, h * 0.24], [w * 0.42, h * 0.17], [w * 0.62, h * 0.12], [w * 0.72, -20]], rw);
    road(ctx, [[-30, h * 0.75], [w * 0.18, h * 0.71], [w * 0.36, h * 0.79], [w * 0.62, h * 0.86], [w + 30, h * 0.8]], rw);
    road(ctx, [[w * 0.12, -20], [w * 0.16, h * 0.3], [w * 0.1, h * 0.6], [w * 0.14, h + 20]], rw * 0.85);
    road(ctx, [[w * 0.84, h * 0.34], [riverX + w * 0.06, h * 0.33]], rw * 0.9, false);  // bridge approach
    // the bridge deck itself
    ctx.fillStyle = '#a9a094';
    ctx.fillRect(riverX - w * 0.09, h * 0.315, w * 0.2, rw * 1.1);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(riverX - w * 0.09, h * 0.315 + rw * 1.1, w * 0.2, 3);

    // ---- town blocks around the edges, where the board does not cover ----
    const blocks = [
      [0.03, 0.05, 0.20, 0.16], [0.03, 0.30, 0.15, 0.22], [0.03, 0.62, 0.18, 0.2],
      [0.30, 0.03, 0.22, 0.12], [0.62, 0.03, 0.2, 0.12],
      [0.26, 0.86, 0.22, 0.12], [0.55, 0.86, 0.24, 0.12],
      [0.78, 0.55, 0.12, 0.2], [0.76, 0.12, 0.1, 0.16]
    ];
    blocks.forEach(function (b) {
      const bx = w * b[0], by = h * b[1], bw = w * b[2], bh = h * b[3];
      if (rand() > 0.75) {
        carPark(ctx, bx, by, bw, bh, rand);
        return;
      }
      // fill the block with a few buildings and alleys between them
      let x = bx;
      while (x < bx + bw - 18) {
        const cw = 26 + rand() * Math.min(70, bx + bw - x - 8);
        let y = by;
        while (y < by + bh - 18) {
          const ch = 24 + rand() * Math.min(70, by + bh - y - 8);
          building(ctx, x, y, cw, ch, rand);
          y += ch + 8 + rand() * 12;
        }
        x += cw + 9 + rand() * 14;
      }
    });

    // ---- treelines along the edges ----
    for (let i = 0; i < 26; i++) {
      const edge = i % 4;
      let x, y;
      if (edge === 0) { x = rand() * w; y = rand() * h * 0.1; }
      else if (edge === 1) { x = rand() * w * 0.1; y = rand() * h; }
      else if (edge === 2) { x = rand() * w; y = h - rand() * h * 0.1; }
      else { x = w * 0.72 + rand() * w * 0.08; y = rand() * h; }
      treeCluster(ctx, x, y, 3 + Math.floor(rand() * 4), 55, rand);
    }

    vignette(ctx, w, h, 0.52);
  }

  /* ------------------------------------------------------------------ */
  /* DUSTY DIVOT                                                         */
  /* ------------------------------------------------------------------ */
  function paintCrater(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    const rand = rng(77013);
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.max(w, h) * 0.6;

    const base = ctx.createLinearGradient(0, 0, w * 0.4, h);
    base.addColorStop(0, '#528839');
    base.addColorStop(0.5, '#457630');
    base.addColorStop(1, '#3a6528');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    groundTexture(ctx, w, h, rand);

    road(ctx, [[-30, h * 0.1], [w * 0.3, h * 0.05], [w * 0.64, h * 0.1], [w + 30, h * 0.04]],
      Math.max(11, w * 0.018));

    /** The rim is ragged, not a circle: the same wobble at every radius. */
    function rimAt(a) {
      return R * (1 + 0.10 * Math.sin(a * 7 + 0.6) + 0.07 * Math.sin(a * 3 - 1.1)
        + 0.045 * Math.sin(a * 13 + 2.2));
    }

    function craterPath(scale) {
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const a = (i / 200) * Math.PI * 2;
        const r = rimAt(a) * scale;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.92;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }

    // ---- ejecta thrown out past the rim ----
    ctx.save();
    for (let i = 0; i < 170; i++) {
      const a = rand() * Math.PI * 2;
      const reach = rimAt(a) * (1 + rand() * 0.24);
      const x = cx + Math.cos(a) * reach;
      const y = cy + Math.sin(a) * reach * 0.92;
      ctx.globalAlpha = 0.22 + rand() * 0.45;
      blob(ctx, x, y, 9 + rand() * 32, rand() > 0.5 ? '#5a3c26' : '#6d4a2e', rand);
    }
    ctx.restore();

    // ---- the bowl ----
    ctx.save();
    craterPath(1);
    ctx.clip();

    const bowl = ctx.createRadialGradient(cx, cy, R * 0.06, cx, cy, R);
    bowl.addColorStop(0, '#946b47');
    bowl.addColorStop(0.4, '#6f4c2f');
    bowl.addColorStop(0.8, '#4d3420');
    bowl.addColorStop(1, '#3a2717');
    ctx.fillStyle = bowl;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 190; i++) {
      const a = (i / 190) * Math.PI * 2 + rand() * 0.02;
      const inner = R * (0.05 + rand() * 0.12);
      const outer = rimAt(a) * (0.68 + rand() * 0.36);
      ctx.strokeStyle = rand() > 0.5
        ? 'rgba(34,21,12,' + (0.16 + rand() * 0.3) + ')'
        : 'rgba(202,163,116,' + (0.07 + rand() * 0.16) + ')';
      ctx.lineWidth = 2 + rand() * 10;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner * 0.92);
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer * 0.92);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,214,160,0.14)';
    ctx.lineWidth = 3;
    [0.88, 0.72, 0.56, 0.4].forEach(function (k) { craterPath(k); ctx.stroke(); });

    // boulders and rubble with shadows
    for (let i = 0; i < 90; i++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * R * 0.95;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.92;
      const s = 3 + rand() * 9;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x + 2, y + 2, s, s * 0.8);
      ctx.fillStyle = rand() > 0.5 ? '#6b5540' : '#7d6449';
      ctx.fillRect(x, y, s, s * 0.8);
      ctx.fillStyle = 'rgba(255,230,190,0.3)';
      ctx.fillRect(x, y, s, 1.5);
    }
    ctx.restore();

    // rim shadow so the bowl reads as a hole
    ctx.save();
    craterPath(1);
    ctx.clip();
    const lip = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 1.02);
    lip.addColorStop(0, 'rgba(0,0,0,0)');
    lip.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = lip;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // ---- the research site ----
    const site = Math.min(w, h) * 0.13;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(cx - site * 1.1, cy - site * 0.8, site * 2.2, site * 1.6);
    ctx.fillStyle = '#b3aa97';                    // graded pad
    ctx.fillRect(cx - site * 1.05, cy - site * 0.75, site * 2.1, site * 1.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - site * 1.05, cy - site * 0.75, site * 2.1, site * 1.5);
    for (let i = 0; i < 9; i++) {
      const bw = site * (0.24 + rand() * 0.3);
      const bh = site * (0.2 + rand() * 0.26);
      const bx = cx - site * 0.95 + rand() * (site * 1.9 - bw);
      const by = cy - site * 0.65 + rand() * (site * 1.3 - bh);
      building(ctx, bx, by, bw, bh, rand, rand() > 0.5 ? '#dfe3e7' : '#9fb6c4');
    }

    // trees ringing the blast
    for (let i = 0; i < 30; i++) {
      const a = rand() * Math.PI * 2;
      const d = rimAt(a) * (1.1 + rand() * 0.5);
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d * 0.92;
      if (x < -60 || y < -60 || x > w + 60 || y > h + 60) continue;
      treeCluster(ctx, x, y, 3 + Math.floor(rand() * 4), 60, rand);
    }

    vignette(ctx, w, h, 0.5);
  }

  function paint(canvas, theme) {
    if (theme === 'crater') paintCrater(canvas);
    else paintCity(canvas);
  }

  let currentTheme = 'city';

  function mount() {
    const canvas = document.getElementById('backdrop');
    if (!canvas) return;
    let raf = null;

    function resize(force) {
      const scale = Math.min(global.devicePixelRatio || 1, 1.5);
      const w = Math.ceil(global.innerWidth * scale);
      const h = Math.ceil(global.innerHeight * scale);
      if (!force && canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      paint(canvas, currentTheme);
    }

    /** Called when the player picks a different map. */
    Backdrop.setTheme = function (theme) {
      if (theme === currentTheme) return;
      currentTheme = theme;
      resize(true);
    };

    global.addEventListener('resize', function () {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () { resize(false); });
    });
    resize();
  }

  const Backdrop = { paint: paint, setTheme: function () {} };
  global.Backdrop = Backdrop;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})(window);
