/* ==========================================================================
   fx.js - the arcade effects layer.
   Screen shake, pixel explosions, floating score numbers, full-screen
   announcements and colour flashes. Self-contained: the game pushes effects
   in, calls update once a frame, and draws them in two passes - world space
   (under the HUD) and screen space (over everything).
   ========================================================================== */
(function (global) {
  'use strict';

  let W = 0, H = 0, UNIT = 1;
  let ctx = null;

  const state = {
    shakeTime: 0,
    shakeMax: 0,
    shakeAmp: 0,
    particles: [],
    floats: [],
    rings: [],
    flashes: [],
    announcement: null
  };

  function init(context, width, height, unit) {
    ctx = context;
    W = width;
    H = height;
    UNIT = unit || 1;
  }

  function clear() {
    state.particles.length = 0;
    state.floats.length = 0;
    state.rings.length = 0;
    state.flashes.length = 0;
    state.announcement = null;
    state.shakeTime = 0;
  }

  /* ------------------------------------------------------------------ */
  /* SCREEN SHAKE                                                        */
  /* ------------------------------------------------------------------ */

  /** @param {number} amp pixels of throw @param {number} time seconds */
  function shake(amp, time) {
    // a new shake never cuts an existing stronger one short
    if (amp >= state.shakeAmp || state.shakeTime <= 0) {
      state.shakeAmp = amp;
      state.shakeTime = time;
      state.shakeMax = time;
    }
  }

  // reused, because this is read every frame and the caller never keeps it
  const shakeVec = { x: 0, y: 0 };

  function shakeOffset() {
    if (state.shakeTime <= 0) {
      shakeVec.x = 0; shakeVec.y = 0;
      return shakeVec;
    }
    const k = state.shakeTime / state.shakeMax;       // decays to nothing
    const a = state.shakeAmp * k * k;
    shakeVec.x = (Math.random() - 0.5) * 2 * a;
    shakeVec.y = (Math.random() - 0.5) * 2 * a;
    return shakeVec;
  }

  /* ------------------------------------------------------------------ */
  /* PARTICLES                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * A pixel explosion.
   * @param {object} opts count, speed, size, gravity, life, spread
   */
  function burst(x, y, color, opts) {
    const o = opts || {};
    const count = o.count || 14;
    const speed = o.speed || 110;
    for (let i = 0; i < count; i++) {
      const a = o.spread
        ? o.angle + (Math.random() - 0.5) * o.spread
        : (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const v = speed * (0.45 + Math.random() * 0.8);
      state.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: (o.life || 0.55) * (0.7 + Math.random() * 0.6),
        maxLife: o.life || 0.55,
        size: (o.size || 3) * (0.7 + Math.random() * 0.8),
        gravity: o.gravity === undefined ? 190 : o.gravity,
        color: Array.isArray(color) ? color[Math.floor(Math.random() * color.length)] : color
      });
    }
  }

  /** An expanding ring - shockwaves, power-up pickups, boss stomps. */
  function ring(x, y, color, radius, time, width) {
    state.rings.push({
      x: x, y: y, color: color, r: 0, target: radius,
      life: time || 0.45, maxLife: time || 0.45, width: width || 3
    });
  }

  /* ------------------------------------------------------------------ */
  /* FLOATING TEXT                                                       */
  /* ------------------------------------------------------------------ */

  /** @param {object} opts size, rise, life, bold, outline */
  function float(x, y, text, color, opts) {
    const o = opts || {};
    state.floats.push({
      x: x, y: y, text: String(text), color: color || '#ffffff',
      life: o.life || 1.1, maxLife: o.life || 1.1,
      size: o.size || 9, rise: o.rise === undefined ? 22 : o.rise,
      drift: (Math.random() - 0.5) * 10
    });
  }

  /* ------------------------------------------------------------------ */
  /* ANNOUNCEMENTS + FLASHES                                             */
  /* ------------------------------------------------------------------ */

  /** The big arcade banner that slams in for events and boss warnings. */
  function announce(title, subtitle, color, time) {
    state.announcement = {
      title: title, subtitle: subtitle || '', color: color || '#ffd447',
      life: time || 2.2, maxLife: time || 2.2
    };
  }

  function announcing() { return !!state.announcement; }

  function flash(color, alpha, time) {
    state.flashes.push({ color: color || '#ffffff', alpha: alpha || 0.5,
      life: time || 0.22, maxLife: time || 0.22 });
  }

  /* ------------------------------------------------------------------ */
  /* UPDATE + DRAW                                                       */
  /* ------------------------------------------------------------------ */
  /**
   * Drop entry `i` by moving the last one into its place. splice() shifts
   * every element after the hole, so clearing a burst of hundreds of dead
   * particles was quadratic; nothing here depends on draw order.
   */
  function dropAt(list, i) {
    const last = list.length - 1;
    if (i !== last) list[i] = list[last];
    list.pop();
  }

  function update(dt) {
    if (state.shakeTime > 0) state.shakeTime = Math.max(0, state.shakeTime - dt);

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) { dropAt(state.particles, i); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 1 - dt * 1.2;
    }

    for (let i = state.rings.length - 1; i >= 0; i--) {
      const r = state.rings[i];
      r.life -= dt;
      if (r.life <= 0) { dropAt(state.rings, i); continue; }
      const k = 1 - r.life / r.maxLife;
      const inv = 1 - k;
      r.r = r.target * (1 - inv * inv);
    }

    for (let i = state.floats.length - 1; i >= 0; i--) {
      const f = state.floats[i];
      f.life -= dt;
      if (f.life <= 0) dropAt(state.floats, i);
    }

    for (let i = state.flashes.length - 1; i >= 0; i--) {
      const f = state.flashes[i];
      f.life -= dt;
      if (f.life <= 0) dropAt(state.flashes, i);
    }

    if (state.announcement) {
      state.announcement.life -= dt;
      if (state.announcement.life <= 0) state.announcement = null;
    }
  }

  /** World-space pass: particles, rings and floating numbers on the board. */
  function draw() {
    if (!ctx) return;
    ctx.save();
    state.rings.forEach(function (r) {
      ctx.globalAlpha = Math.max(0, r.life / r.maxLife) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // plain loop, and only touch fillStyle when the colour actually changes:
    // a burst is usually two colours, so this is a couple of state changes
    // instead of one per particle
    let lastColor = null;
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      ctx.globalAlpha = Math.min(1, p.life / p.maxLife * 1.4);
      if (p.color !== lastColor) { ctx.fillStyle = p.color; lastColor = p.color; }
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }

    ctx.textAlign = 'center';
    state.floats.forEach(function (f) {
      const k = 1 - f.life / f.maxLife;
      const y = f.y - f.rise * k;
      const pop = k < 0.2 ? 0.7 + 1.5 * k : 1;
      ctx.globalAlpha = Math.min(1, f.life * 2.2);
      ctx.font = 'bold ' + Math.round(f.size * UNIT * pop) + 'px "Press Start 2P", monospace';
      ctx.lineWidth = 4 * UNIT;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(f.text, f.x + f.drift * k, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x + f.drift * k, y);
    });
    ctx.restore();
  }

  /** Screen-space pass: flashes and the announcement banner. */
  function drawOverlay() {
    if (!ctx) return;
    ctx.save();
    state.flashes.forEach(function (f) {
      ctx.globalAlpha = f.alpha * (f.life / f.maxLife);
      ctx.fillStyle = f.color;
      ctx.fillRect(0, 0, W, H);
    });
    ctx.globalAlpha = 1;

    const a = state.announcement;
    if (a) {
      const k = 1 - a.life / a.maxLife;
      // slam in, hold, slide out
      let slide = 0;
      let alpha = 1;
      if (k < 0.12) { slide = (1 - k / 0.12) * W; alpha = k / 0.12; }
      else if (k > 0.82) { slide = -((k - 0.82) / 0.18) * W; alpha = 1 - (k - 0.82) / 0.18; }

      const y = H * 0.30;
      const barH = H * 0.115;
      ctx.globalAlpha = alpha;
      ctx.translate(slide, 0);

      ctx.fillStyle = 'rgba(0,0,0,0.82)';
      ctx.fillRect(0, y, W, barH);
      ctx.fillStyle = a.color;
      ctx.fillRect(0, y, W, 3);
      ctx.fillRect(0, y + barH - 3, W, 3);

      ctx.textAlign = 'center';
      ctx.font = 'bold ' + Math.round(15 * UNIT) + 'px "Press Start 2P", monospace';
      ctx.lineWidth = 4 * UNIT;
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText(a.title, W / 2, y + barH * 0.46);
      ctx.fillStyle = a.color;
      ctx.fillText(a.title, W / 2, y + barH * 0.46);

      if (a.subtitle) {
        ctx.font = 'bold ' + Math.round(8 * UNIT) + 'px "Press Start 2P", monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(a.subtitle, W / 2, y + barH * 0.78);
      }
    }
    ctx.restore();
  }

  global.FX = {
    init: init, clear: clear,
    shake: shake, shakeOffset: shakeOffset,
    burst: burst, ring: ring, float: float,
    announce: announce, announcing: announcing, flash: flash,
    update: update, draw: draw, drawOverlay: drawOverlay
  };
})(window);
