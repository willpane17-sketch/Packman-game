/* ==========================================================================
   audio.js - tiny WebAudio blip synth (no asset files needed)
   ========================================================================== */
(function (global) {
  'use strict';

  let ctx = null;
  let muted = false;

  function ac() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, gain, startAt, sweepTo) {
    if (muted) return;
    const a = ac();
    if (!a) return;
    const t0 = a.currentTime + (startAt || 0);
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.08, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  let wakaHigh = false;

  const Sound = {
    unlock: function () { ac(); },
    isMuted: function () { return muted; },
    toggleMute: function () { muted = !muted; return muted; },
    waka: function () {
      wakaHigh = !wakaHigh;
      tone(wakaHigh ? 420 : 300, 0.07, 'square', 0.05);
    },
    power: function () {
      tone(180, 0.28, 'sawtooth', 0.07, 0, 520);
      [523, 659, 784, 1046].forEach(function (n, i) { tone(n, 0.08, 'square', 0.05, 0.05 + i * 0.06); });
    },
    eatGhost: function () {
      tone(300, 0.10, 'square', 0.09, 0, 900);
      tone(900, 0.14, 'square', 0.07, 0.10, 1500);
    },
    eatLoot: function () {
      tone(660, 0.08, 'triangle', 0.09);
      tone(880, 0.10, 'triangle', 0.09, 0.08);
      tone(1180, 0.14, 'triangle', 0.08, 0.16);
    },
    death: function () {
      tone(700, 0.5, 'sawtooth', 0.09, 0, 90);
      tone(400, 0.5, 'square', 0.05, 0.18, 60);
    },
    start: function () {
      const notes = [523, 659, 784, 1046, 784, 1046];
      notes.forEach(function (n, i) { tone(n, 0.13, 'square', 0.07, i * 0.14); });
    },
    combo: function (mult) {
      tone(420 + mult * 70, 0.09, 'square', 0.06);
      tone(620 + mult * 90, 0.09, 'square', 0.05, 0.06);
    },
    powerUp: function () {
      tone(520, 0.08, 'square', 0.07);
      tone(780, 0.08, 'square', 0.07, 0.07);
      tone(1180, 0.14, 'triangle', 0.07, 0.14);
    },
    shockwave: function () {
      tone(900, 0.3, 'sawtooth', 0.09, 0, 80);
      tone(300, 0.35, 'square', 0.06, 0.02, 60);
    },
    freeze: function () {
      tone(1400, 0.3, 'sine', 0.06, 0, 500);
      tone(900, 0.3, 'triangle', 0.05, 0.05, 380);
    },
    wrong: function () {
      tone(300, 0.16, 'square', 0.07, 0, 170);
      tone(190, 0.26, 'sawtooth', 0.06, 0.1, 110);
    },
    shield: function () {
      tone(300, 0.2, 'square', 0.08, 0, 900);
    },
    secret: function () {
      [660, 880, 1046, 1318].forEach(function (n, i) {
        tone(n, 0.14, 'triangle', 0.08, i * 0.1);
      });
    },
    event: function () {
      tone(200, 0.18, 'sawtooth', 0.07, 0, 600);
      tone(600, 0.2, 'square', 0.06, 0.12);
    },
    bossWarn: function () {
      [0, 0.35, 0.7].forEach(function (t) {
        tone(150, 0.28, 'sawtooth', 0.09, t, 90);
      });
    },
    bossHit: function () {
      tone(180, 0.18, 'square', 0.1, 0, 90);
    },
    bossDown: function () {
      [392, 330, 262, 196].forEach(function (n, i) { tone(n, 0.3, 'sawtooth', 0.1, i * 0.16); });
      tone(1046, 0.5, 'triangle', 0.08, 0.7);
    },
    highScore: function () {
      [523, 659, 784, 1046, 1318, 1568].forEach(function (n, i) {
        tone(n, 0.12, 'square', 0.07, i * 0.09);
      });
    },
    // the menu: a soft blip on hover, a two-note click on a choice
    hover: function () {
      tone(880, 0.03, 'square', 0.022);
    },
    select: function () {
      tone(660, 0.05, 'square', 0.045);
      tone(990, 0.06, 'square', 0.04, 0.045);
    },
    tick: function () {
      tone(1200, 0.05, 'square', 0.05);
    },
    achievement: function () {
      [784, 988, 1318].forEach(function (n, i) { tone(n, 0.12, 'triangle', 0.07, i * 0.09); });
    },
    victory: function () {
      // a short triumphant fanfare
      const melody = [
        [523, 0.00], [659, 0.12], [784, 0.24], [1046, 0.36],
        [988, 0.60], [1046, 0.72], [1318, 0.86], [1568, 1.04]
      ];
      melody.forEach(function (n) {
        tone(n[0], 0.22, 'square', 0.075, n[1]);
        tone(n[0] / 2, 0.22, 'triangle', 0.05, n[1]);
      });
      tone(2093, 0.5, 'triangle', 0.06, 1.28);
      tone(1568, 0.5, 'square', 0.05, 1.28);
    },
    levelUp: function () {
      [523, 659, 784, 1046, 1318].forEach(function (n, i) {
        tone(n, 0.12, 'triangle', 0.08, i * 0.10);
      });
    },
    gameOver: function () {
      [392, 349, 311, 262].forEach(function (n, i) {
        tone(n, 0.3, 'sawtooth', 0.08, i * 0.22);
      });
    },
    siren: function (level) {
      tone(150 + level * 12, 0.18, 'triangle', 0.025, 0, 200 + level * 12);
    },
    retreat: function () {
      tone(900, 0.08, 'sine', 0.03, 0, 1300);
    },
    extraLife: function () {
      [784, 988, 1318].forEach(function (n, i) { tone(n, 0.14, 'square', 0.08, i * 0.12); });
    }
  };

  global.Sound = Sound;
})(window);
