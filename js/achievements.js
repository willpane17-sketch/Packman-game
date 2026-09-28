/* ==========================================================================
   achievements.js - small arcade achievements.
   Definitions, unlock storage and the toast queue. The game reports progress
   through Achievements.check(); this module decides what that unlocks and
   queues the toast.
   ========================================================================== */
(function (global) {
  'use strict';

  const KEY = 'tt-burger-achievements';

  const LIST = [
    { id: 'first-bite', name: 'FIRST BITE', hint: 'Eat your first pick-up', icon: '#ffd447' },
    { id: 'hundred', name: '100 PELLETS', hint: 'Eat 100 pick-ups in one run', icon: '#7ef0ff' },
    { id: 'combo10', name: '10X COMBO', hint: 'Reach a x10 combo', icon: '#ff9ad5' },
    { id: 'boss', name: 'BOSS SLAYER', hint: 'Defeat a boss', icon: '#ff5a5a' },
    { id: 'secret', name: 'SECRET FINDER', hint: 'Find a secret room', icon: '#c6a6ff' },
    { id: 'nohit', name: 'NO-HIT ROUND', hint: 'Clear a board without being caught', icon: '#7ee07a' },
    { id: 'speed', name: 'SPEED DEMON', hint: 'Clear a board in under 60 seconds', icon: '#f2a03c' },
    { id: 'king', name: 'BURGER KING', hint: 'Win a run on Extreme', icon: '#ffffff' }
  ];

  let unlocked = load();
  const toasts = [];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};                    // corrupt or blocked storage: start fresh
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(unlocked));
    } catch (e) { /* storage full or blocked - the run still works */ }
  }

  function get(id) {
    for (let i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i];
    return null;
  }

  function has(id) { return !!unlocked[id]; }

  /** Unlock one achievement. Returns true the first time only. */
  function unlock(id) {
    if (unlocked[id]) return false;
    const def = get(id);
    if (!def) return false;
    unlocked[id] = Date.now();
    save();
    toasts.push({ def: def, life: 3.2, maxLife: 3.2 });
    return true;
  }

  /**
   * Hand this the run's running totals and it unlocks whatever they earn.
   * @param {object} s pickups, combo, bosses, secrets, noHit, clearTime, wonExtreme
   */
  function check(s) {
    const fired = [];
    if (s.pickups >= 1 && unlock('first-bite')) fired.push('first-bite');
    if (s.pickups >= 100 && unlock('hundred')) fired.push('hundred');
    if (s.combo >= 10 && unlock('combo10')) fired.push('combo10');
    if (s.bosses >= 1 && unlock('boss')) fired.push('boss');
    if (s.secrets >= 1 && unlock('secret')) fired.push('secret');
    if (s.noHit && unlock('nohit')) fired.push('nohit');
    if (s.clearTime && s.clearTime < 60 && unlock('speed')) fired.push('speed');
    if (s.wonExtreme && unlock('king')) fired.push('king');
    return fired;
  }

  function update(dt) {
    for (let i = toasts.length - 1; i >= 0; i--) {
      toasts[i].life -= dt;
      if (toasts[i].life <= 0) toasts.splice(i, 1);
    }
  }

  /** Toasts slide in from the right edge, stacked. */
  function draw(ctx, W, H, UNIT) {
    toasts.forEach(function (t, i) {
      const k = 1 - t.life / t.maxLife;
      let slide = 0;
      if (k < 0.12) slide = (1 - k / 0.12) * W * 0.6;
      else if (k > 0.86) slide = ((k - 0.86) / 0.14) * W * 0.6;

      const h = H * 0.052;
      const w = W * 0.62;
      const x = W - w - W * 0.04 + slide;
      const y = H * 0.07 + i * (h + 6);

      ctx.save();
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = t.def.icon;
      ctx.fillRect(x, y, 4, h);
      ctx.textAlign = 'left';
      ctx.font = 'bold ' + Math.round(6 * UNIT) + 'px "Press Start 2P", monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('ACHIEVEMENT', x + 12, y + h * 0.4);
      ctx.font = 'bold ' + Math.round(8 * UNIT) + 'px "Press Start 2P", monospace';
      ctx.fillStyle = t.def.icon;
      ctx.fillText(t.def.name, x + 12, y + h * 0.8);
      ctx.restore();
    });
  }

  function earnedCount() {
    return LIST.filter(function (d) { return !!unlocked[d.id]; }).length;
  }

  global.Achievements = {
    LIST: LIST,
    has: has,
    unlock: unlock,
    check: check,
    update: update,
    draw: draw,
    earnedCount: earnedCount,
    total: LIST.length
  };
})(window);
