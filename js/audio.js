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
