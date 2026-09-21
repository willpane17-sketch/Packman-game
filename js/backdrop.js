/* ==========================================================================
   backdrop.js - the Tilted Towers aerial map behind the board.
   Painted procedurally (no image files) onto a full-page canvas: grass and
   dirt terrain, the river running down the east side, the roads leading into
   town, tree cover, and the outbuildings on the outskirts.
   Redrawn on resize; deterministic, so the map looks the same every visit.
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

  const GRASS = ['#4a7c32', '#54893a', '#41702c', '#5c9240', '#3a642a'];
  const DIRT = '#7d6a42';
  const ROAD = '#9aa0a4';
  const ROAD_EDGE = '#7d8388';

  function blob(ctx, x, y, r, color, rand) {
    ctx.fillStyle = color;
    ctx.beginPath();
    const points = 9;
    for (let i = 0; i <= points; i++) {
      const a = (i / points) * Math.PI * 2;
      const rr = r * (0.68 + rand() * 0.5);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr * 0.78;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  function tree(ctx, x, y, r, rand) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';           // drop shadow
    ctx.beginPath();
    ctx.ellipse(x + r * 0.35, y + r * 0.4, r, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rand() > 0.5 ? '#24461a' : '#1d3a15';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rand() > 0.5 ? '#3a6b28' : '#325e22';
    ctx.beginPath();
    ctx.arc(x - r * 0.22, y - r * 0.24, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
  }

  /** A curved road drawn as a thick stroke with a lighter centre line. */
  function road(ctx, pts, width) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ROAD_EDGE;
    ctx.lineWidth = width + 4;
    stroke(ctx, pts);
    ctx.strokeStyle = ROAD;
    ctx.lineWidth = width;
    stroke(ctx, pts);
    ctx.setLineDash([10, 14]);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    stroke(ctx, pts);
    ctx.setLineDash([]);
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

  function outbuilding(ctx, x, y, w, h, rand) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 4, y + 5, w, h);
    const roofs = ['#b7bcc1', '#9a7b5c', '#8e9499', '#c3b191'];
    ctx.fillStyle = roofs[Math.floor(rand() * roofs.length)];
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x, y + h - 3, w, 3);
    if (w > 26 && h > 20) {                        // rooftop unit
      ctx.fillStyle = 'rgba(60,66,72,0.8)';
      ctx.fillRect(x + w * 0.25, y + h * 0.3, 7, 6);
    }
  }

  function paintCity(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    const rand = rng(20250914);

    // ---- base terrain ----
    const base = ctx.createLinearGradient(0, 0, w * 0.3, h);
    base.addColorStop(0, '#54893a');
    base.addColorStop(0.5, '#487a31');
    base.addColorStop(1, '#3b6529');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    // rolling patches of different greens
    for (let i = 0; i < 90; i++) {
      blob(ctx, rand() * w, rand() * h, 40 + rand() * 150,
        GRASS[Math.floor(rand() * GRASS.length)], rand);
    }
    // dry dirt clearings
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 14; i++) {
      blob(ctx, rand() * w, rand() * h, 30 + rand() * 90, DIRT, rand);
    }
    ctx.globalAlpha = 1;

    // ---- the river down the east side ----
    const riverX = w * 0.87;
    const riverPts = [];
    for (let y = -20; y <= h + 20; y += h / 8) {
      riverPts.push([riverX + Math.sin(y / 160) * w * 0.035, y]);
    }
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#6f7f52';                    // muddy bank
    ctx.lineWidth = w * 0.17;
    stroke(ctx, riverPts);
    ctx.strokeStyle = '#2f7fa8';
    ctx.lineWidth = w * 0.13;
    stroke(ctx, riverPts);
    ctx.strokeStyle = '#3a93bd';
    ctx.lineWidth = w * 0.10;
    stroke(ctx, riverPts);
    // ripples
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 60; i++) {
      const y = rand() * h;
      const x = riverX + Math.sin(y / 160) * w * 0.035 + (rand() - 0.5) * w * 0.08;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 10 + rand() * 18, y);
      ctx.stroke();
    }

    // ---- roads leading into town ----
    const roadWidth = Math.max(12, w * 0.022);
    road(ctx, [[-30, h * 0.24], [w * 0.18, h * 0.28], [w * 0.34, h * 0.2], [w * 0.5, h * 0.16], [w * 0.62, h * 0.1], [w * 0.7, -20]], roadWidth);
    road(ctx, [[-30, h * 0.72], [w * 0.16, h * 0.68], [w * 0.3, h * 0.76], [w * 0.5, h * 0.84], [w * 0.74, h * 0.88], [w + 30, h * 0.8]], roadWidth);
    road(ctx, [[w * 0.5, h + 30], [w * 0.46, h * 0.86], [w * 0.5, h * 0.7]], roadWidth * 0.8);

    // ---- outskirts buildings ----
    const spots = [
      [0.06, 0.12], [0.13, 0.2], [0.05, 0.62], [0.12, 0.83], [0.2, 0.9],
      [0.68, 0.05], [0.78, 0.16], [0.72, 0.93], [0.6, 0.95], [0.3, 0.06],
      [0.02, 0.42], [0.88, 0.55]
    ];
    spots.forEach(function (s) {
      const bw = 22 + rand() * 46;
      const bh = 18 + rand() * 40;
      outbuilding(ctx, w * s[0], h * s[1], bw, bh, rand);
    });

    // ---- tree cover, thicker towards the edges ----
    for (let i = 0; i < 260; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const edge = Math.min(x, w - x) / w + Math.min(y, h - y) / h;
      if (edge > 0.55 && rand() > 0.25) continue;   // keep the middle open
      if (x > riverX - w * 0.09 && x < riverX + w * 0.09) continue;
      tree(ctx, x, y, 6 + rand() * 9, rand);
    }

    // ---- depth: soft vignette so the board reads as the centre of the map ----
    const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }


  /**
   * Dusty Divot from the air: green terrain torn open by the meteor, with
   * the dirt thrown outwards in streaks and the research site in the middle.
   */
  function paintCrater(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    const rand = rng(77013);
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.max(w, h) * 0.62;          // crater radius, wider than the board

    // ---- surrounding terrain ----
    const base = ctx.createLinearGradient(0, 0, w * 0.4, h);
    base.addColorStop(0, '#4f8436');
    base.addColorStop(0.5, '#43742e');
    base.addColorStop(1, '#376026');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      blob(ctx, rand() * w, rand() * h, 50 + rand() * 150,
        GRASS[Math.floor(rand() * GRASS.length)], rand);
    }

    // a road skirting the crater, as in the map
    road(ctx, [[-30, h * 0.12], [w * 0.3, h * 0.07], [w * 0.62, h * 0.12], [w + 30, h * 0.06]],
      Math.max(10, w * 0.018));

    /** The rim is ragged, not a circle: the same wobble at every radius. */
    function rimAt(a) {
      return R * (1 + 0.10 * Math.sin(a * 7 + 0.6) + 0.07 * Math.sin(a * 3 - 1.1)
        + 0.045 * Math.sin(a * 13 + 2.2));
    }

    function craterPath(scale) {
      ctx.beginPath();
      for (let i = 0; i <= 160; i++) {
        const a = (i / 160) * Math.PI * 2;
        const r = rimAt(a) * scale;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.92;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }

    // ---- ejecta: dirt flung past the rim ----
    ctx.save();
    for (let i = 0; i < 150; i++) {
      const a = rand() * Math.PI * 2;
      const reach = rimAt(a) * (1 + rand() * 0.28);
      const x = cx + Math.cos(a) * reach;
      const y = cy + Math.sin(a) * reach * 0.92;
      ctx.globalAlpha = 0.25 + rand() * 0.45;
      blob(ctx, x, y, 8 + rand() * 30, rand() > 0.5 ? '#5a3c26' : '#6d4a2e', rand);
    }
    ctx.restore();

    // ---- the crater itself ----
    ctx.save();
    craterPath(1);
    ctx.clip();

    const bowl = ctx.createRadialGradient(cx, cy, R * 0.08, cx, cy, R);
    bowl.addColorStop(0, '#8a6540');
    bowl.addColorStop(0.45, '#6b4a2e');
    bowl.addColorStop(0.85, '#4b331f');
    bowl.addColorStop(1, '#35251722');
    ctx.fillStyle = bowl;
    ctx.fillRect(0, 0, w, h);

    // radial streaks scoured out from the impact point
    for (let i = 0; i < 150; i++) {
      const a = (i / 150) * Math.PI * 2 + rand() * 0.02;
      const inner = R * (0.06 + rand() * 0.12);
      const outer = rimAt(a) * (0.7 + rand() * 0.34);
      ctx.strokeStyle = rand() > 0.5
        ? 'rgba(38,24,14,' + (0.18 + rand() * 0.3) + ')'
        : 'rgba(190,150,104,' + (0.06 + rand() * 0.14) + ')';
      ctx.lineWidth = 2 + rand() * 9;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner * 0.92);
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer * 0.92);
      ctx.stroke();
    }

    // terraced steps down the crater wall
    ctx.strokeStyle = 'rgba(255,214,160,0.13)';
    ctx.lineWidth = 3;
    [0.86, 0.68, 0.5].forEach(function (k) {
      craterPath(k);
      ctx.stroke();
    });

    // rubble on the crater floor
    for (let i = 0; i < 120; i++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * R * 0.95;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.92;
      ctx.fillStyle = rand() > 0.6 ? 'rgba(20,12,6,0.4)' : 'rgba(206,170,120,0.22)';
      ctx.fillRect(x, y, 2 + rand() * 5, 2 + rand() * 4);
    }
    ctx.restore();

    // ---- rim shadow, so the bowl reads as a hole ----
    ctx.save();
    craterPath(1);
    ctx.clip();
    const lip = ctx.createRadialGradient(cx, cy, R * 0.72, cx, cy, R * 1.02);
    lip.addColorStop(0, 'rgba(0,0,0,0)');
    lip.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = lip;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // ---- the research site in the middle ----
    const site = Math.min(w, h) * 0.12;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(cx - site * 1.05, cy - site * 0.75, site * 2.1, site * 1.5);
    ctx.fillStyle = '#b9bdc2';
    ctx.fillRect(cx - site, cy - site * 0.7, site * 2, site * 1.4);
    ctx.strokeStyle = '#7f858c';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - site, cy - site * 0.7, site * 2, site * 1.4);
    for (let i = 0; i < 7; i++) {
      const bw = site * (0.22 + rand() * 0.3);
      const bh = site * (0.2 + rand() * 0.28);
      const bx = cx - site * 0.9 + rand() * (site * 1.8 - bw);
      const by = cy - site * 0.6 + rand() * (site * 1.2 - bh);
      outbuilding(ctx, bx, by, bw, bh, rand);
    }

    // trees ringing the blast, thinning out as they near it
    for (let i = 0; i < 220; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const a = Math.atan2((y - cy) / 0.92, x - cx);
      const d = Math.hypot(x - cx, (y - cy) / 0.92);
      if (d < rimAt(a) * 1.12) continue;
      tree(ctx, x, y, 6 + rand() * 9, rand);
    }

    const vig = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.3, cx, cy, Math.max(w, h) * 0.8);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
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
