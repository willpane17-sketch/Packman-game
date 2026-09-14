/* ==========================================================================
   layout.js - sizes the board to the biggest it can be without pushing the
   HUD off screen.
   The HUD scales with the board, so the space it takes depends on the answer
   we are looking for; measuring and re-measuring converges in a couple of
   passes, which is cheaper and more reliable than guessing a fixed number in
   CSS.
   ========================================================================== */
(function (global) {
  'use strict';

  const ASPECT = 28 / 31;        // the board is 28 x 31 tiles
  const MAX_BOARD = 1040;
  const MIN_BOARD = 300;
  let raf = null;
  let applied = null;

  /**
   * The stage's own padding and border. Measured from computed style rather
   * than from its box, because the stage stretches to the HUD's width and so
   * its box says nothing about the frame around the canvas.
   */
  function stageChrome(stage) {
    const cs = getComputedStyle(stage);
    return parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) +
      parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
  }

  function fit() {
    const shell = document.querySelector('.shell');
    const stage = document.querySelector('.stage');
    if (!shell || !stage) return;

    const root = document.documentElement;
    const narrow = global.innerWidth <= 620;
    const bodyStyle = getComputedStyle(document.body);
    const bodyPad = parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);
    const chrome = stageChrome(stage);
    const widthCap = global.innerWidth * (narrow ? 0.96 : 0.94) - chrome;
    root.style.setProperty('--stage-chrome', chrome + 'px');

    // Two passes: the first sizes the board, the second corrects for the HUD
    // having grown or shrunk along with it.
    for (let pass = 0; pass < 2; pass++) {
      const overhead = shell.offsetHeight - stage.offsetHeight + bodyPad;
      const heightCap = (global.innerHeight - overhead - chrome) * ASPECT;
      let board = Math.min(widthCap, heightCap, MAX_BOARD);
      // on phones the d-pad sits below the board; let the page scroll rather
      // than squeeze the maze down to nothing
      const floor = narrow ? Math.min(widthCap, global.innerWidth * 0.8) : MIN_BOARD;
      board = Math.max(board, floor);
      const next = Math.floor(board);
      // Writing the same value again would re-trigger the observer below and
      // spin; skipping the write is what makes the loop settle.
      if (next === applied) break;
      applied = next;
      root.style.setProperty('--board', next + 'px');
    }
  }

  function schedule() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(fit);
  }

  global.addEventListener('resize', schedule);
  global.addEventListener('orientationchange', schedule);

  // The HUD can change height on its own - an extra life icon appearing, the
  // loot row filling up - and the board has to give that space back.
  if (global.ResizeObserver) {
    const observer = new ResizeObserver(schedule);
    document.addEventListener('DOMContentLoaded', function () {
      ['.topbar', '.bottombar', '.hint'].forEach(function (sel) {
        const el = document.querySelector(sel);
        if (el) observer.observe(el);
      });
    });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fit);
  } else {
    fit();
  }

  global.Layout = { fit: fit };
})(window);
