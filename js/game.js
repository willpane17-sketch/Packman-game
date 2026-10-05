/* ==========================================================================
   game.js - TILTED TOWERS BURGER MUNCH
   A full re-creation of the classic arcade maze game:
     * the hero is a pixel burger
     * the four ghosts are pixel Jonesy
     * the maze is the Tilted Towers city block
   ========================================================================== */
(function () {
  'use strict';

  const T = Maze.TILE;
  const TILE = 24;                       // pixels per tile
  const W = Maze.COLS * TILE;            // 672
  const H = Maze.ROWS * TILE;            // 744
  const UNIT = TILE / 16;                // everything sized in the old 16px units
  const BASE = TILE * 9.6;               // 100% speed in px/sec

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const TURN_ORDER = ['up', 'left', 'down', 'right'];

  const STATE = {
    TITLE: 'title',
    READY: 'ready',
    PLAY: 'play',
    DYING: 'dying',
    LEVEL_CLEAR: 'levelclear',
    WIN: 'win',
    GAME_OVER: 'gameover'
  };

  const GHOST_DEFS = [
    { name: 'Blinky', color: '#e8412f', scatter: { x: 25, y: 0 }, start: { x: 13, y: 11 }, house: false, dotLimit: 0 },
    { name: 'Pinky', color: '#ff9ad5', scatter: { x: 2, y: 0 }, start: { x: 13, y: 14 }, house: true, dotLimit: 0 },
    { name: 'Inky', color: '#3fd8e8', scatter: { x: 27, y: 30 }, start: { x: 12, y: 14 }, house: true, dotLimit: 30 },
    { name: 'Clyde', color: '#f2a03c', scatter: { x: 0, y: 30 }, start: { x: 15, y: 14 }, house: true, dotLimit: 60 }
  ];

  // Classic-style mode schedule, in seconds. Index alternates scatter/chase.
  const MODE_TABLE = [
    { mode: 'scatter', time: 7 },
    { mode: 'chase', time: 20 },
    { mode: 'scatter', time: 7 },
    { mode: 'chase', time: 20 },
    { mode: 'scatter', time: 5 },
    { mode: 'chase', time: 20 },
    { mode: 'scatter', time: 5 },
    { mode: 'chase', time: Infinity }
  ];

  const FRIGHT_TIME = [6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1, 0];

  /* ------------------------------------------------------------------ */
  /* DIFFICULTY                                                          */
  /* Each mode scales the same arcade curves rather than replacing them, */
  /* so level progression still behaves the way it should.               */
  /* ------------------------------------------------------------------ */
  const DIFFICULTIES = {
    easy: {
      key: 'easy',
      name: 'EASY',
      stars: 1,
      tag: 'LEARN',
      color: '#7ee07a',
      blurb: 'SLOW ENEMIES - PLENTY OF ROOM TO LEARN',
      lives: 5,
      levels: 5,          // clear this many boards to win the run
      pac: 1.06,          // scales the burger's speed curve
      ghost: 0.72,        // scales the ghosts' speed curve
      fright: 2.0,        // scales how long a shield potion lasts
      frightFloor: 7,     // ...and never less than this many seconds
      release: 2,         // scales the house dot counters (ghosts come out later)
      stall: 7,           // seconds of no pick-ups before a ghost is forced out
      scatter: 1.9,       // scales the scatter phases (more time not being hunted)
      extraLife: 8000,
      scoreMul: 1,
      eventEvery: 26      // seconds between random events
    },
    hard: {
      key: 'hard',
      name: 'HARD',
      stars: 2,
      tag: 'CHALLENGE',
      color: '#ffd447',
      blurb: 'FAST AND AGGRESSIVE - THE ARCADE RULES',
      lives: 3,
      levels: 8,
      pac: 1,
      ghost: 1,
      fright: 1,
      frightFloor: 1,
      release: 1,
      stall: 4,
      scatter: 1,
      extraLife: 10000,
      scoreMul: 2,
      eventEvery: 20
    },
    extreme: {
      key: 'extreme',
      name: 'EXTREME',
      stars: 3,
      tag: 'CHAOS',
      color: '#ff5a5a',
      blurb: 'THEY OUTRUN YOU - ONE MISTAKE AND IT IS OVER',
      lives: 1,
      levels: 3,
      pac: 1,
      ghost: 1.22,        // the enemies out-run the burger
      fright: 0.45,
      frightFloor: 0,
      release: 0,         // everyone leaves the house immediately
      stall: 1,
      scatter: 0.22,      // barely any respite from the chase
      extraLife: 25000,
      scoreMul: 4,
      eventEvery: 13
    }
  };

  const DIFFICULTY_ORDER = ['easy', 'hard', 'extreme'];

  /* Honour the system's reduced-motion setting: the menu stops breathing and
     pulsing, and the burger's mouth holds open. Nothing that matters to play
     is animation-dependent, so this costs the player nothing. */
  let reducedMotion = false;
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = mq.matches;
    const onChange = function (e) { reducedMotion = e.matches; };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
  const HIGH_KEY_PREFIX = 'tt-burger-high-';

  /** Scores are tracked per map and per mode - they are different games. */
  function highKey(mapKey, mode) {
    return HIGH_KEY_PREFIX + mapKey + '-' + mode;
  }

  function storedHigh(mapKey, mode) {
    const own = Number(localStorage.getItem(highKey(mapKey, mode)) || 0);
    if (own) return own;
    // carry over scores set before maps, and before modes, existed
    if (mapKey !== 'tilted') return 0;
    const beforeMaps = Number(localStorage.getItem(HIGH_KEY_PREFIX + mode) || 0);
    if (beforeMaps) return beforeMaps;
    if (mode === 'hard') return Number(localStorage.getItem('tt-burger-high') || 0);
    return 0;
  }

  function currentMap() { return Maze.get(game.mapKey); }

  /**
   * Each map plays a little differently: Loot Lake's shallows drag on the
   * burger, Pleasant Park's hedges hide quicker enemies, the crater's dust
   * slows everyone a touch.
   */
  const MAP_FLAVOUR = {
    tilted: { pac: 1, ghost: 1, siren: 0, hazardName: '' },
    divot: { pac: 0.97, ghost: 1.02, siren: 4, hazardName: 'DUST' },
    lake: { pac: 1.04, ghost: 0.96, siren: 8, hazardName: 'SHALLOWS' },
    park: { pac: 1, ghost: 1.08, siren: 12, hazardName: 'HEDGES' }
  };

  function flavour() { return MAP_FLAVOUR[game.mapKey] || MAP_FLAVOUR.tilted; }

  /** True on a tile this map treats as heavy going. */
  function inHazard(x, y) {
    const map = currentMap();
    if (!map.hazard) return false;
    if (map.hazard === 'water') {
      // the open shallows in the middle of the lake
      return Math.abs(x - 13.5) > 3 && Math.abs(x - 13.5) < 9
        && Math.abs(y - 15) > 3 && Math.abs(y - 15) < 8;
    }
    if (map.hazard === 'hedge') {
      // the lanes behind the hedges, where enemies get the jump on you
      return (x + y) % 9 === 0;
    }
    return false;
  }

  function diff() { return DIFFICULTIES[game.difficulty]; }

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  canvas.width = W;
  canvas.height = H;
  ctx.imageSmoothingEnabled = false;

  const hud = {
    score: document.getElementById('score'),
    high: document.getElementById('highscore'),
    level: document.getElementById('level'),
    lives: document.getElementById('lives'),
    loot: document.getElementById('loot-row'),
    modeBtn: document.getElementById('mode-btn'),
    mapBtn: document.getElementById('map-btn'),
    mapTitle: document.getElementById('map-title'),
    mute: document.getElementById('mute-btn'),
    pause: document.getElementById('pause-btn'),
    full: document.getElementById('fullscreen-btn')
  };

  /* ------------------------------------------------------------------ */
  /* GAME STATE                                                          */
  /* ------------------------------------------------------------------ */
  const game = {
    state: STATE.TITLE,
    difficulty: DIFFICULTY_ORDER.indexOf(localStorage.getItem('tt-burger-mode')) >= 0
      ? localStorage.getItem('tt-burger-mode') : 'easy',
    mapKey: Maze.get(localStorage.getItem('tt-burger-map') || 'tilted').key,
    grid: null,
    board: null,
    pelletsLeft: 0,
    pelletsTotal: 0,
    dotsEaten: 0,
    score: 0,
    high: 0,
    level: 1,
    lives: 3,
    paused: false,
    timer: 0,
    modeIndex: 0,
    modeTimer: 0,
    mode: 'scatter',
    frightTimer: 0,
    ghostsEaten: 0,
    globalDots: 0,
    releaseTimer: 0,
    loot: null,
    lootTimer: 0,
    lootsSpawned: 0,
    lootHistory: [],
    flashTimer: 0,
    deathTimer: 0,
    readyTimer: 0,
    popups: [],
    sirenTimer: 0,
    extraAwarded: false,
    winTimer: 0,
    wins: 0,
    eliminations: 0,
    // --- combo ---
    combo: 0,
    comboMult: 1,
    comboTimer: 0,
    comboBest: 0,
    bestMult: 1,
    // --- run tallies, shown on the end screens ---
    tally: { pellets: 0, enemies: 0, powerups: 0, combo: 0, boss: 0, secret: 0, level: 0, quiz: 0 },
    pickups: 0,
    secrets: 0,
    bosses: 0,
    hitThisLevel: false,
    levelStart: 0,
    newHigh: false,
    newHighTimer: 0,
    // --- systems ---
    powerups: [],
    active: {},
    setbacks: {},
    quizTimer: 0,
    shieldGrace: 0,
    event: null,
    eventTimer: 0,
    shiftTiles: [],
    secrets_: [],
    boss: null,
    bossWarning: 0,
    bonusRound: false,
    bonusTimer: 0,
    bonusCollected: 0,
    bonusTotal: 0,
    fireworks: [],
    confetti: [],
    frame: 0,
    menuTime: 0
  };

  const pac = {
    x: 0, y: 0, dir: 'left', next: 'left', moving: false, mouth: 0, isPac: true
  };

  const ghosts = GHOST_DEFS.map(function (def) {
    return {
      def: def,
      name: def.name,
      color: def.color,
      x: 0, y: 0,
      dir: 'left',
      state: 'house',        // house | leaving | normal | eaten | entering
      frightened: false,
      released: false,
      reviveTimer: 0,
      bob: 0,
      frame: 0,
      anim: 0
    };
  });

  /* ------------------------------------------------------------------ */
  /* HELPERS                                                             */
  /* ------------------------------------------------------------------ */
  function tileOf(v) { return Math.floor(v / TILE); }
  function centerOf(t) { return t * TILE + TILE / 2; }

  function tileAt(x, y) {
    if (y < 0 || y >= Maze.ROWS) return T.WALL;
    if (x < 0 || x >= Maze.COLS) return T.FLOOR; // tunnel
    return game.grid[y][x];
  }

  function isWallFor(x, y, entity) {
    const t = tileAt(x, y);
    if (t === T.WALL) {
      // a secret door looks solid but lets the burger slip through
      if (!entity && isSecretDoor(x, y)) return false;
      return true;
    }
    if (t === T.DOOR) {
      if (!entity) return true;
      return !(entity.state === 'eaten' || entity.state === 'entering' || entity.state === 'leaving');
    }
    return false;
  }

  function wrapX(e) {
    const span = (Maze.COLS + 1) * TILE;
    if (e.x < -TILE / 2) e.x += span;
    else if (e.x > W + TILE / 2) e.x -= span;
  }

  function distance(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Grid-locked movement. Moves `dist` pixels in 1px steps, letting `chooser`
   * pick a new direction every time the entity is centred on a tile.
   * A chooser may return false to stop the entity on that tile.
   * `onStep` runs before every 1px advance, which is where the burger gets
   * to corner - checking once a frame would miss the window on a slow frame.
   */
  function step(e, dist, chooser, onStep) {
    let remaining = dist;
    let guard = 0;
    while (remaining > 0.0001 && guard++ < 4096) {
      const s = Math.min(remaining, 1);
      if (onStep) onStep(e);
      const tx = tileOf(e.x), ty = tileOf(e.y);
      const cx = centerOf(tx), cy = centerOf(ty);
      if (Math.abs(e.x - cx) < 0.75 && Math.abs(e.y - cy) < 0.75) {
        e.x = cx;
        e.y = cy;
        if (chooser(e, tx, ty) === false) return;
        const d = DIRS[e.dir];
        if (!d || isWallFor(tx + d.x, ty + d.y, e)) {
          e.moving = false;
          return;
        }
        e.moving = true;
      }
      const d = DIRS[e.dir];
      e.x += d.x * s;
      e.y += d.y * s;
      wrapX(e);
      remaining -= s;
    }
  }

  /* ------------------------------------------------------------------ */
  /* LEVEL SETUP                                                         */
  /* ------------------------------------------------------------------ */
  /**
   * Breadth-first distance from every walkable tile to the house entrance.
   * Eaten ghosts steer down this field, which guarantees they find their way
   * home - plain greedy targeting can get stuck circling a block.
   */
  function computeHomeDistances() {
    const dist = [];
    for (let y = 0; y < Maze.ROWS; y++) {
      dist.push(new Array(Maze.COLS).fill(Infinity));
    }
    const home = { x: 13, y: 11 };
    dist[home.y][home.x] = 0;
    const queue = [home];
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const d = dist[cur.y][cur.x] + 1;
      for (const key in DIRS) {
        const dir = DIRS[key];
        let nx = cur.x + dir.x;
        const ny = cur.y + dir.y;
        if (ny < 0 || ny >= Maze.ROWS) continue;
        if (nx < 0) nx = Maze.COLS - 1;              // tunnel wraps around
        if (nx >= Maze.COLS) nx = 0;
        const t = game.grid[ny][nx];
        if (t === T.WALL) continue;                  // doors stay passable
        if (dist[ny][nx] <= d) continue;
        dist[ny][nx] = d;
        queue.push({ x: nx, y: ny });
      }
    }
    game.homeDist = dist;
  }

  function homeDistanceAt(x, y) {
    if (y < 0 || y >= Maze.ROWS) return Infinity;
    let tx = x;
    if (tx < 0) tx = Maze.COLS - 1;
    if (tx >= Maze.COLS) tx = 0;
    const d = game.homeDist[y][tx];
    return d === undefined ? Infinity : d;
  }

  function loadLevel(fresh) {
    const parsed = Maze.parse(game.mapKey);
    game.grid = parsed.grid;
    game.pelletsTotal = parsed.pelletCount;
    game.pelletsLeft = parsed.pelletCount;
    placeSecrets();
    game.board = Renderer.buildBoard(game.grid, TILE, currentMap().theme);
    computeHomeDistances();

    // per-board system reset
    game.powerups = [];
    game.active = {};
    game.setbacks = {};
    // the first question of a board comes sooner, so a new player meets the
    // mechanic before the maze gets busy
    game.quizTimer = fresh ? QUIZ_FIRST : QUIZ_EVERY;
    game.event = null;
    game.eventTimer = diff().eventEvery;
    game.shiftTiles = [];
    game.boss = null;
    game.bossWarning = 0;
    game.bonusRound = false;
    game.shieldGrace = 0;
    game.hitThisLevel = false;
    game.levelStart = performance.now();
    breakCombo();
    FX.clear();
    game.loot = null;
    game.lootTimer = 0;
    game.lootsSpawned = 0;
    game.dotsEaten = 0;
    if (fresh) {
      game.lootHistory = [];
    }
    resetPositions();
  }

  function resetPositions() {
    // losing a life is punishment enough; a setback does not carry over, and
    // a fresh start gets a moment before the next question
    game.setbacks = {};
    if (game.quizTimer < 4) game.quizTimer = 4;
    pac.x = centerOf(13) + TILE / 2;   // starts on the seam, like the original
    pac.y = centerOf(23);
    pac.dir = 'left';
    pac.next = 'left';
    pac.nextTtl = 0;
    pac.moving = false;
    pac.mouth = 0;

    ghosts.forEach(function (g, i) {
      const def = g.def;
      g.x = centerOf(def.start.x);
      g.y = centerOf(def.start.y);
      g.dir = i === 0 ? 'left' : (i === 1 ? 'up' : 'up');
      g.state = def.house ? 'house' : 'normal';
      g.frightened = false;
      g.released = !def.house;
      g.reviveTimer = 0;
      g.bob = Math.random() * Math.PI * 2;
    });

    game.modeIndex = 0;
    game.modeTimer = 0;
    game.mode = MODE_TABLE[0].mode;
    game.frightTimer = 0;
    game.ghostsEaten = 0;
    game.releaseTimer = 0;
  }

  /** Switch difficulty. Only meaningful outside a run, so callers check. */
  function syncBoardScope() {
    if (!window.Leaderboard) return;
    Leaderboard.setScope(game.mapKey, game.difficulty,
      currentMap().name + ' / ' + diff().name);
  }

  function setDifficulty(key) {
    if (!DIFFICULTIES[key] || key === game.difficulty) return;
    game.difficulty = key;
    localStorage.setItem('tt-burger-mode', key);
    game.high = storedHigh(game.mapKey, key);
    syncBoardScope();
    updateHud();
    renderModeButtons();
    Sound.unlock();
    Sound.waka();
  }

  /** Switch map. Only meaningful outside a run, so callers check. */
  function setMap(key) {
    const map = Maze.get(key);
    if (map.key === game.mapKey) return;
    game.mapKey = map.key;
    localStorage.setItem('tt-burger-map', map.key);
    game.high = storedHigh(game.mapKey, game.difficulty);
    syncBoardScope();
    if (window.Backdrop) Backdrop.setTheme(map.theme);
    loadLevel(true);            // repaint the board in the new map's theme
    updateHud();
    renderModeButtons();
    Sound.unlock();
    Sound.waka();
  }

  function cycleMap(step) {
    const keys = Maze.MAPS.map(function (m) { return m.key; });
    const i = keys.indexOf(game.mapKey);
    setMap(keys[(i + step + keys.length) % keys.length]);
  }

  function cycleDifficulty(step) {
    const i = DIFFICULTY_ORDER.indexOf(game.difficulty);
    const next = (i + step + DIFFICULTY_ORDER.length) % DIFFICULTY_ORDER.length;
    setDifficulty(DIFFICULTY_ORDER[next]);
  }

  function modeSelectable() {
    return game.state === STATE.TITLE || game.state === STATE.GAME_OVER
      || game.state === STATE.WIN;
  }

  function startGame() {
    game.menuTime = 0;
    // leaving the menu drops its hover state; otherwise the hand cursor would
    // stay up over the board until the mouse next moved
    menu.hover = null;
    menu.pressed = null;
    canvas.style.cursor = '';
    if (window.Quiz) Quiz.reset();
    game.score = 0;
    game.level = 1;
    game.lives = diff().lives;
    game.eliminations = 0;
    game.combo = 0;
    game.comboMult = 1;
    game.comboBest = 0;
    game.bestMult = 1;
    game.pickups = 0;
    game.secrets = 0;
    game.bosses = 0;
    game.newHigh = false;
    game.tally = { pellets: 0, enemies: 0, powerups: 0, combo: 0, boss: 0, secret: 0, level: 0, quiz: 0 };
    game.extraAwarded = false;
    game.popups = [];
    loadLevel(true);
    game.state = STATE.READY;
    game.readyTimer = 2.4;
    Sound.unlock();
    Sound.start();
    updateHud();
    renderModeButtons();
  }

  function nextLevel() {
    if (game.level >= diff().levels) {
      winGame();
      return;
    }
    game.level++;
    loadLevel(false);
    game.state = STATE.READY;
    game.readyTimer = 1.8;
    updateHud();
  }

  /** Every board on this difficulty cleared: Victory Royale. */
  function winGame() {
    game.state = STATE.WIN;
    game.winTimer = 0;
    game.fireworks = [];
    spawnConfetti();
    for (let i = 0; i < 3; i++) {
      spawnFirework(W * (0.2 + Math.random() * 0.6), H * (0.15 + Math.random() * 0.35));
    }
    Sound.victory();
    if (game.score > game.high) {
      game.high = game.score;
      localStorage.setItem(highKey(game.mapKey, diff().key), String(game.high));
    }
    grantAchievements({ wonExtreme: game.difficulty === 'extreme', noHit: !game.hitThisLevel });
    const winKey = 'tt-burger-wins-' + game.mapKey + '-' + diff().key;
    const wins = Number(localStorage.getItem(winKey) || 0) + 1;
    localStorage.setItem(winKey, String(wins));
    game.wins = wins;
    postRun(true);
    updateHud();
    renderModeButtons();
  }

  /** Send the finished run to the leaderboard. Guests are simply skipped. */
  function postRun(won) {
    if (!window.Leaderboard) return;
    Leaderboard.submit(game.score, game.mapKey, diff().key, won);
  }

  function loseLife() {
    game.lives--;
    updateHud();
    if (game.lives <= 0) {
      game.state = STATE.GAME_OVER;
      Sound.gameOver();
      postRun(false);
      renderModeButtons();
      if (game.score > game.high) {
        game.high = game.score;
        localStorage.setItem(highKey(game.mapKey, diff().key), String(game.high));
        updateHud();
      }
    } else {
      resetPositions();
      game.loot = null;
      game.state = STATE.READY;
      game.readyTimer = 1.8;
    }
  }

  /* ------------------------------------------------------------------ */
  /* SPEEDS                                                              */
  /* ------------------------------------------------------------------ */
  function levelIndex() { return Math.min(game.level - 1, 20); }

  function pacSpeed() {
    const l = game.level;
    let f = l === 1 ? 0.80 : (l < 5 ? 0.90 : (l < 21 ? 1.0 : 0.90));
    if (game.frightTimer > 0) f += 0.06;
    if (powerActive('chili')) f *= 1.45;
    if (eventActive('speed')) f *= 1.3;
    if (setbackActive('sluggish')) f *= 0.88;
    f *= flavour().pac;
    // heavy going on this map's hazard tiles
    if (inHazard(tileOf(pac.x), tileOf(pac.y)) && !powerActive('chili')) f *= 0.8;
    return BASE * f * diff().pac;
  }

  function ghostSpeed(g) {
    const l = game.level;
    // frozen enemies stop dead, but eyes still find their way home
    if (powerActive('freeze') && g.state !== 'eaten' && g.state !== 'entering') return 0;
    if (g.state === 'eaten') return BASE * 2.0;
    if (g.state === 'leaving' || g.state === 'entering') return BASE * 0.55;
    let f = l === 1 ? 0.75 : (l < 5 ? 0.85 : 0.95);
    if (g.frightened) f = l === 1 ? 0.50 : (l < 5 ? 0.55 : 0.60);
    f *= diff().ghost;
    if (eventActive('fast')) f *= 1.25;
    if (eventActive('speed')) f *= 1.15;
    f *= huntedFactor();
    f *= flavour().ghost;
    // slow crawl through the tunnel
    const ty = tileOf(g.y);
    const tx = tileOf(g.x);
    if (ty === Maze.TUNNEL_ROW && (tx <= 5 || tx >= Maze.COLS - 6)) f *= 0.55;
    return BASE * f;
  }

  function frightDuration() {
    const base = FRIGHT_TIME[Math.min(game.level - 1, FRIGHT_TIME.length - 1)];
    const d = diff();
    return Math.max(d.frightFloor, base * d.fright);
  }

  /* ------------------------------------------------------------------ */
  /* GHOST AI                                                            */
  /* ------------------------------------------------------------------ */
  function pacTile() {
    return { x: tileOf(pac.x), y: tileOf(pac.y) };
  }

  function ghostTarget(g) {
    if (g.state === 'eaten') return { x: 13, y: 11 };
    if (game.mode === 'scatter' && !g.frightened) return g.def.scatter;

    const p = pacTile();
    const d = DIRS[pac.dir];
    switch (g.name) {
      case 'Blinky':
        return p;
      case 'Pinky': {
        // faithful to the original, including the "up" overflow quirk.
        // The harder modes cut the corner further ahead of the burger.
        const lead = game.difficulty === 'extreme' ? 6 : (game.difficulty === 'hard' ? 5 : 4);
        let tx = p.x + d.x * lead;
        let ty = p.y + d.y * lead;
        if (pac.dir === 'up') tx -= 4;
        return { x: tx, y: ty };
      }
      case 'Inky': {
        const blinky = ghosts[0];
        let px2 = p.x + d.x * 2;
        let py2 = p.y + d.y * 2;
        if (pac.dir === 'up') px2 -= 2;
        const bx = tileOf(blinky.x), by = tileOf(blinky.y);
        return { x: px2 + (px2 - bx), y: py2 + (py2 - by) };
      }
      case 'Clyde': {
        // he loses his nerve close up - but much less so on the hard modes
        const nerve = game.difficulty === 'extreme' ? 3 : (game.difficulty === 'hard' ? 6 : 8);
        const dist = distance(tileOf(g.x), tileOf(g.y), p.x, p.y);
        return dist > nerve ? p : g.def.scatter;
      }
    }
    return p;
  }

  function noUpTile(tx, ty) {
    return Maze.NO_UP_TILES.some(function (t) { return t.x === tx && t.y === ty; });
  }

  function chooseGhostDir(g, tx, ty) {
    if (g.state === 'eaten') {
      return chooseHomewardDir(g, tx, ty);   // may return false to stop here
    }
    const target = ghostTarget(g);
    const reverse = OPPOSITE[g.dir];
    let best = null;
    let bestDist = Infinity;
    const options = [];

    TURN_ORDER.forEach(function (dir) {
      if (dir === reverse) return;
      const d = DIRS[dir];
      const nx = tx + d.x, ny = ty + d.y;
      if (isWallFor(nx, ny, g)) return;
      if (dir === 'up' && noUpTile(tx, ty) && g.state !== 'eaten' && !g.frightened) return;
      options.push(dir);
      const dist = distance(nx, ny, target.x, target.y);
      if (dist < bestDist) { bestDist = dist; best = dir; }
    });

    if (!options.length) {
      g.dir = reverse;   // dead end - turn around
      return;
    }
    if (g.frightened && g.state !== 'eaten') {
      g.dir = options[Math.floor(Math.random() * options.length)];
      return;
    }
    g.dir = best;
  }

  /** Steepest descent down the BFS field, so the eyes always reach the house. */
  function chooseHomewardDir(g, tx, ty) {
    if (tx === 13 && ty === 11) {
      // exactly on the door tile - drop into the house from here. Testing the
      // tile rather than the distance matters: eyes move fast enough to jump
      // clean over a proximity check between frames.
      g.state = 'entering';
      g.dir = 'down';
      return false;
    }
    let best = null;
    let bestDist = homeDistanceAt(tx, ty);
    const reverse = OPPOSITE[g.dir];
    TURN_ORDER.forEach(function (dir) {
      const d = DIRS[dir];
      const nx = tx + d.x, ny = ty + d.y;
      if (isWallFor(nx, ny, g)) return;
      const nd = homeDistanceAt(nx, ny);
      if (nd < bestDist || (nd === bestDist && dir !== reverse && best === null)) {
        bestDist = nd;
        best = dir;
      }
    });
    if (best) g.dir = best;
    else if (!isWallFor(tx + DIRS[reverse].x, ty + DIRS[reverse].y, g)) g.dir = reverse;
  }

  function updateGhost(g, dt) {
    g.anim += dt;
    g.frame = Math.floor(g.anim * 8) % 2;

    if (g.state === 'house') {
      g.bob += dt * 4;
      g.y = centerOf(g.def.start.y) + Math.sin(g.bob) * 3;
      if (g.reviveTimer > 0) {
        g.reviveTimer -= dt;
        if (g.reviveTimer <= 0) g.released = true;
      }
      if (g.released) {
        g.state = 'leaving';
        g.frightened = game.frightTimer > 0;
      }
      return;
    }

    if (g.state === 'leaving') {
      const speed = ghostSpeed(g) * dt;
      const houseX = centerOf(13);
      if (Math.abs(g.x - houseX) > 0.5) {
        g.x += Math.sign(houseX - g.x) * Math.min(speed, Math.abs(houseX - g.x));
        g.dir = houseX > g.x ? 'right' : 'left';
      } else {
        g.x = houseX;
        const outY = centerOf(11);
        g.y -= Math.min(speed, g.y - outY);
        g.dir = 'up';
        if (g.y <= outY + 0.5) {
          g.y = outY;
          g.state = 'normal';
          g.dir = Math.random() < 0.5 ? 'left' : 'right';
          if (game.frightTimer > 0) g.frightened = true;
        }
      }
      return;
    }

    if (g.state === 'entering') {
      const speed = ghostSpeed(g) * dt;
      const homeX = centerOf(g.def.start.x);
      const homeY = centerOf(14);
      if (g.y < homeY - 0.5) {
        g.y += Math.min(speed, homeY - g.y);
        g.dir = 'down';
      } else if (Math.abs(g.x - homeX) > 0.5) {
        g.x += Math.sign(homeX - g.x) * Math.min(speed, Math.abs(homeX - g.x));
      } else {
        g.x = homeX;
        g.y = homeY;
        g.state = 'house';
        g.frightened = false;
        g.released = false;
        g.reviveTimer = 0.6;
      }
      return;
    }

    step(g, ghostSpeed(g) * dt, chooseGhostDir);
  }

  /* ------------------------------------------------------------------ */
  /* PAC-BURGER                                                          */
  /* ------------------------------------------------------------------ */
  function choosePacDir(e, tx, ty) {
    const nd = DIRS[e.next];
    if (nd && !isWallFor(tx + nd.x, ty + nd.y, null)) {
      e.dir = e.next;
    }
  }

  // How far either side of a tile centre a turn is still accepted. Without
  // this the burger could only turn on the exact frame it sat on a centre -
  // at ~200px/s that is a window about 3px wide, so an ordinary human press
  // sailed straight past the junction and fired at some later one instead.
  // Turning early cuts the corner, which is what the arcade does too.
  const CORNER_EARLY = 10;         // px before the centre
  const CORNER_LATE = 8;           // px after it
  const NEXT_TTL = 1.0;            // seconds a queued turn stays live

  /**
   * Take a perpendicular turn when close enough to a tile centre, snapping
   * onto the new axis. Runs every pixel of travel, so no press is missed.
   */
  function corner(e) {
    const nd = DIRS[e.next];
    const d = DIRS[e.dir];
    if (!nd || !d || e.next === e.dir) return;
    // reversals already turn anywhere; only perpendicular turns corner
    if (nd.x * d.x !== 0 || nd.y * d.y !== 0) return;
    const tx = tileOf(e.x), ty = tileOf(e.y);
    if (isWallFor(tx + nd.x, ty + nd.y, null)) return;
    const cx = centerOf(tx), cy = centerOf(ty);
    const along = d.x !== 0 ? (e.x - cx) * d.x : (e.y - cy) * d.y;
    if (along > CORNER_LATE || along < -CORNER_EARLY) return;
    e.x = cx;                      // at most 10px, and always inside this tile
    e.y = cy;
    e.dir = e.next;
    e.moving = true;
  }

  function updatePac(dt) {
    // a turn nobody could take stops being pending, so it cannot fire by
    // surprise several junctions later
    if (pac.next !== pac.dir) {
      pac.nextTtl -= dt;
      if (pac.nextTtl <= 0) pac.next = pac.dir;
    }
    applyHeld();
    // an instant U-turn is allowed anywhere, not just on a tile centre
    if (pac.next === OPPOSITE[pac.dir]) {
      const tx = tileOf(pac.x), ty = tileOf(pac.y);
      const d = DIRS[pac.next];
      if (!isWallFor(tx + d.x, ty + d.y, null)) pac.dir = pac.next;
    }
    step(pac, pacSpeed() * dt, choosePacDir, corner);
    if (pac.moving) pac.mouth = (pac.mouth + dt * 11) % (Math.PI * 2);

    eatTile();
    checkLoot();
  }

  const COMBO_WINDOW = 2.4;        // seconds to keep the chain alive
  const COMBO_MAX = 10;

  /** Every pick-up extends the chain; ten in a row raises the multiplier. */
  function bumpCombo(x, y) {
    if (setbackActive('butterfingers')) return;    // the chain will not build
    game.combo++;
    game.comboTimer = COMBO_WINDOW;
    if (game.combo > game.comboBest) game.comboBest = game.combo;
    const mult = Math.min(COMBO_MAX, 1 + Math.floor(game.combo / 10));
    if (mult !== game.comboMult) {
      game.comboMult = mult;
      if (mult > game.bestMult) { game.bestMult = mult; grantAchievements(); }
      if (mult > 1) {
        FX.float(x, y - TILE, 'COMBO x' + mult, '#ff9ad5', { size: 11, life: 1.3 });
        FX.flash('#ff9ad5', 0.12, 0.18);
        FX.ring(x, y, '#ff9ad5', TILE * 2.2, 0.4, 3);
        Sound.combo(mult);
      }
    }
  }

  function breakCombo() {
    game.combo = 0;
    game.comboMult = 1;
    game.comboTimer = 0;
  }

  function updateCombo(dt) {
    if (game.comboTimer > 0) {
      game.comboTimer -= dt;
      if (game.comboTimer <= 0) breakCombo();
    }
  }

  /**
   * @param {string} bucket which tally this score belongs to
   * @param {object} opts   x, y to float the number from; quiet to skip the popup
   */
  function addScore(n, bucket, opts) {
    const d = diff();
    const o = opts || {};
    const base = n * d.scoreMul;
    const total = Math.round(base * (o.noCombo ? 1 : game.comboMult) * scoreEventMul());
    if (bucket && game.tally[bucket] !== undefined) game.tally[bucket] += total;
    if (!o.noCombo && game.comboMult > 1) {
      game.tally.combo += total - Math.round(base * scoreEventMul());
    }

    // a satisfying popup for anything worth noticing
    if (o.x !== undefined && !o.quiet && total >= 100) {
      FX.float(o.x, o.y, '+' + total, o.color || '#ffd447', { size: total >= 800 ? 13 : 10 });
    }

    game.score += total;
    if (!game.extraAwarded && game.score >= d.extraLife) {
      game.extraAwarded = true;
      game.lives++;
      Sound.extraLife();
    }
    if (game.score > game.high) {
      if (!game.newHigh && game.high > 0) {
        game.newHigh = true;
        game.newHighTimer = 3;
        FX.announce('NEW HIGH SCORE!', 'YOU BEAT YOUR BEST', '#ffd447', 2.4);
        FX.flash('#ffd447', 0.3, 0.4);
        Sound.highScore();
      }
      game.high = game.score;
      localStorage.setItem(highKey(game.mapKey, d.key), String(game.high));
    }
    updateHud();
    return total;
  }

  /** Score multiplier from an active random event (1 when none). */
  function scoreEventMul() {
    return game.event && game.event.def.key === 'double' ? 2 : 1;
  }

  function eatTile() {
    const tx = tileOf(pac.x), ty = tileOf(pac.y);
    if (tx < 0 || tx >= Maze.COLS || ty < 0 || ty >= Maze.ROWS) return;
    const t = game.grid[ty][tx];
    if (t !== T.PELLET && t !== T.POWER) return;
    // only eat when reasonably centred on the tile
    if (distance(pac.x, pac.y, centerOf(tx), centerOf(ty)) > TILE * 0.45) return;

    game.grid[ty][tx] = T.FLOOR;
    game.pelletsLeft--;
    game.dotsEaten++;
    game.releaseTimer = 0;

    game.pickups++;
    if (game.pickups === 1 || game.pickups % 25 === 0) grantAchievements();
    if (game.bonusRound) game.bonusCollected++;
    bumpCombo(pac.x, pac.y);

    if (t === T.PELLET) {
      addScore(10, 'pellets', { x: pac.x, y: pac.y });
      Sound.waka();
      FX.burst(pac.x, pac.y, ['#4fc3ff', '#eafaff'], { count: 4, speed: 45, size: 2, life: 0.3 });
    } else {
      addScore(50, 'pellets', { x: pac.x, y: pac.y, color: '#ffd447' });
      Sound.power();
      FX.burst(pac.x, pac.y, ['#f5c132', '#fff3b0'], { count: 16, speed: 120, size: 3 });
      FX.ring(pac.x, pac.y, '#f5c132', TILE * 3, 0.5, 3);
      FX.shake(3, 0.25);
      game.frightTimer = frightDuration();
      game.ghostsEaten = 0;
      ghosts.forEach(function (g) {
        if (g.state === 'normal') {
          g.frightened = true;
          g.dir = OPPOSITE[g.dir] || g.dir;   // frightened ghosts reverse
        } else if (g.state === 'house' || g.state === 'leaving') {
          g.frightened = true;
        }
      });
    }

    if (game.pelletsLeft <= 0) completeLevel();
  }

  /** Board cleared: bonuses, achievements, then the flash. */
  function completeLevel() {
    if (game.state === STATE.LEVEL_CLEAR) return;
    const seconds = (performance.now() - game.levelStart) / 1000;
    const clean = !game.hitThisLevel;
    const levelBonus = 500 * game.level + (clean ? 1500 : 0);
    addScore(levelBonus, 'level', { noCombo: true, x: pac.x, y: pac.y, color: '#7ee07a' });
    grantAchievements({ noHit: clean, clearTime: seconds });
    game.state = STATE.LEVEL_CLEAR;
    game.flashTimer = 2.2;
    FX.flash('#ffffff', 0.35, 0.3);
    FX.shake(5, 0.4);
    Sound.levelUp();
  }

  /* ------------------------------------------------------------------ */
  /* LOOT (bonus item)                                                   */
  /* ------------------------------------------------------------------ */
  function lootIndexForLevel() {
    return Math.min(game.level - 1, Sprites.LOOT.length - 1);
  }

  function checkLoot() {
    const eaten = game.pelletsTotal - game.pelletsLeft;
    if (game.lootsSpawned === 0 && eaten >= 70) spawnLoot();
    else if (game.lootsSpawned === 1 && eaten >= 170) spawnLoot();

    if (game.loot) {
      if (distance(pac.x, pac.y, game.loot.x, game.loot.y) < TILE * 0.8) {
        const item = Sprites.LOOT[game.loot.index];
        addScore(item.points);
        popup(game.loot.x, game.loot.y, item.points, '#ffd447');
        Sound.eatLoot();
        game.loot = null;
      }
    }
  }

  function spawnLoot() {
    game.lootsSpawned++;
    const index = lootIndexForLevel();
    game.loot = { x: centerOf(13) + TILE / 2, y: centerOf(17), index: index, life: 9.5 };
    if (game.lootHistory[game.lootHistory.length - 1] !== index) {
      game.lootHistory.push(index);
      if (game.lootHistory.length > 7) game.lootHistory.shift();
      renderLootRow();
    }
  }

  function popup(x, y, text, color) {
    game.popups.push({ x: x, y: y, text: String(text), color: color || '#ffffff', life: 1.1 });
  }

  /* ------------------------------------------------------------------ */
  /* COLLISIONS + MODE TIMERS                                            */
  /* ------------------------------------------------------------------ */
  function updateModes(dt) {
    if (game.frightTimer > 0) {
      game.frightTimer -= dt;
      if (game.frightTimer <= 0) {
        game.frightTimer = 0;
        ghosts.forEach(function (g) { g.frightened = false; });
      }
    } else {
      const entry = MODE_TABLE[game.modeIndex];
      const phase = entry.mode === 'scatter' ? entry.time * diff().scatter : entry.time;
      game.modeTimer += dt;
      if (game.modeTimer >= phase) {
        game.modeTimer = 0;
        game.modeIndex = Math.min(game.modeIndex + 1, MODE_TABLE.length - 1);
        const newMode = MODE_TABLE[game.modeIndex].mode;
        if (newMode !== game.mode) {
          game.mode = newMode;
          ghosts.forEach(function (g) {
            if (g.state === 'normal') g.dir = OPPOSITE[g.dir] || g.dir;
          });
        }
      }
    }

    // release ghosts from the house on dot count, with a timeout fallback
    game.releaseTimer += dt;
    ghosts.forEach(function (g) {
      if (g.state !== 'house' || g.released || g.reviveTimer > 0) return;
      const d = diff();
      if (game.dotsEaten >= g.def.dotLimit * d.release || game.releaseTimer > d.stall) {
        g.released = true;
      }
    });

    game.sirenTimer -= dt;
    if (game.sirenTimer <= 0) {
      game.sirenTimer = game.frightTimer > 0 ? 0.24 : 0.5;
      if (ghosts.some(function (g) { return g.state === 'eaten'; })) Sound.retreat();
      else Sound.siren(Math.min(game.level, 8) + flavour().siren
        + (game.frightTimer > 0 ? 6 : 0));
    }
  }

  function checkGhostCollisions() {
    ghosts.forEach(function (g) {
      if (g.state === 'eaten' || g.state === 'entering' || g.state === 'house') return;
      if (distance(pac.x, pac.y, g.x, g.y) > TILE * 0.72) return;

      if (g.frightened) {
        game.ghostsEaten++;
        game.eliminations++;
        const points = 200 * Math.pow(2, Math.min(game.ghostsEaten, 4) - 1);
        bumpCombo(g.x, g.y);
        addScore(points, 'enemies', { x: g.x, y: g.y, color: '#7ef0ff' });
        Sound.eatGhost();
        FX.burst(g.x, g.y, ['#7ef0ff', '#ffffff', g.color], { count: 20, speed: 150, size: 3 });
        FX.ring(g.x, g.y, '#7ef0ff', TILE * 2.6, 0.4, 3);
        FX.shake(5, 0.3);
        g.frightened = false;
        g.state = 'eaten';
      } else {
        if (consumeShield(g)) return;       // a shield eats the hit instead
        hitByEnemy();
      }
    });
  }

  /** Caught: lose the combo, lose a life. */
  function hitByEnemy() {
    if (game.state !== STATE.PLAY) return;
    breakCombo();
    game.hitThisLevel = true;
    game.state = STATE.DYING;
    game.deathTimer = 0;
    Sound.death();
    FX.shake(9, 0.6);
    FX.flash('#ff5a5a', 0.4, 0.3);
    FX.burst(pac.x, pac.y, ['#f0a03a', '#ffd447', '#ff5a5a'], { count: 24, speed: 150, size: 4 });
  }

  /* ------------------------------------------------------------------ */
  /* DRAWING                                                             */
  /* ------------------------------------------------------------------ */
  function drawPellets() {
    const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(game.frame * 0.12);
    for (let y = 0; y < Maze.ROWS; y++) {
      for (let x = 0; x < Maze.COLS; x++) {
        const t = game.grid[y][x];
        if (t === T.PELLET) {
          Sprites.drawCoin(ctx, centerOf(x), centerOf(y), TILE * 0.46);
        } else if (t === T.POWER) {
          Sprites.drawPotion(ctx, centerOf(x), centerOf(y), TILE * 1.05, pulse);
        }
      }
    }
  }

  /** Found vaults keep a soft glow so you can see where you got in. */
  function drawSecrets() {
    if (!game.secrets_ || game.state === STATE.TITLE) return;
    game.secrets_.forEach(function (sec) {
      if (!sec.found) return;
      const x = centerOf(sec.rx), y = centerOf(sec.ry);
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(game.frame * 0.1);
      ctx.fillStyle = '#c6a6ff';
      ctx.fillRect(x - TILE / 2, y - TILE / 2, TILE, TILE);
      ctx.restore();
    });
  }

  function drawGhosts() {
    ghosts.forEach(function (g) {
      let mode = 'normal';
      if (g.state === 'eaten') mode = 'eaten';
      else if (g.frightened) {
        const flashing = game.frightTimer < 2 && Math.floor(game.frightTimer * 6) % 2 === 0;
        mode = flashing ? 'flash' : 'fright';
      }
      Sprites.drawGhost(ctx, g.x, g.y, TILE * 1.15, g.color, g.frame, mode, g.dir,
        currentMap().skin);
    });
  }

  function drawPac() {
    const open = game.state === STATE.PLAY || game.state === STATE.READY
      ? (pac.moving ? Math.abs(Math.sin(pac.mouth)) : 0.35)
      : 0.35;
    Sprites.drawPac(ctx, pac.x, pac.y, TILE * 1.35, pac.dir, open);
  }

  function drawPopups(dt) {
    game.popups = game.popups.filter(function (p) {
      p.life -= dt;
      if (p.life <= 0) return false;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 1.6);
      ctx.fillStyle = p.color;
      ctx.font = 'bold ' + Math.round(11 * UNIT) + 'px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y - (1.1 - p.life) * TILE);
      ctx.restore();
      return true;
    });
  }

  function bannerText(text, y, color, size) {
    ctx.save();
    ctx.font = 'bold ' + Math.round((size || 16) * UNIT) + 'px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4 * UNIT;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, W / 2, y);
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, y);
    ctx.restore();
  }

  function draw(dt) {
    ctx.clearRect(0, 0, W, H);

    // everything on the board rides the screen shake
    const shake = (game.state === STATE.PLAY || game.state === STATE.DYING)
      ? FX.shakeOffset() : { x: 0, y: 0 };
    ctx.save();
    ctx.translate(shake.x, shake.y);

    // on the menu the map drifts a few whole pixels behind the panel
    const par = game.state === STATE.TITLE ? menuParallax() : null;
    if (par) {
      ctx.fillStyle = '#0b1512';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(par.x, par.y);
    }

    if (game.state === STATE.LEVEL_CLEAR) {
      // flash the city between normal and blown-out white
      const flash = Math.floor(game.flashTimer * 6) % 2 === 0;
      ctx.drawImage(game.board, 0, 0);
      if (flash) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;
        ctx.drawImage(game.board, 0, 0);
        ctx.restore();
      }
    } else {
      ctx.drawImage(game.board, 0, 0);
    }

    if (game.state !== STATE.LEVEL_CLEAR) drawPellets();
    drawSecrets();
    if (par) ctx.restore();

    if (game.loot && game.state === STATE.PLAY) {
      const bounce = Math.sin(game.frame * 0.1) * 1.5;
      Sprites.drawLoot(ctx, game.loot.index, game.loot.x, game.loot.y + bounce, TILE * 1.3);
    }

    drawPowerUps();

    if (game.state === STATE.DYING) {
      Sprites.drawPacDeath(ctx, pac.x, pac.y, TILE * 1.35, Math.min(1, game.deathTimer / 1.3));
      drawBoss();
    } else if (game.state !== STATE.LEVEL_CLEAR && game.state !== STATE.TITLE
      && game.state !== STATE.WIN) {
      drawBoss();
      if (!game.bonusRound) drawGhosts();
      drawPac();
    }

    drawPopups(dt);
    FX.draw();
    drawLowLight();
    ctx.restore();

    drawPlayOverlays();

    // ------- overlays -------
    if (game.state === STATE.READY) {
      bannerText('READY!', centerOf(17) + 6 * UNIT, diff().color, 16);
    }
    if (game.state === STATE.WIN) drawVictory();

    if (game.state === STATE.GAME_OVER) {
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(0, 0, W, H);
      bannerText('GAME OVER', H * 0.24, '#ff5a5a', 22);
      bannerText(currentMap().name + '  -  ' + diff().name, H * 0.30, diff().color, 8);

      // the run, totted up
      const rows = [
        ['FINAL SCORE', String(game.score)],
        ['BEST COMBO', 'x' + Math.min(COMBO_MAX, 1 + Math.floor(game.comboBest / 10))
          + '  (' + game.comboBest + ' CHAIN)'],
        ['ENEMIES DOWN', String(game.eliminations)],
        ['SECRETS FOUND', String(game.secrets)],
        ['BOARDS CLEARED', String(Math.max(0, game.level - 1))]
      ];
      if (window.Quiz) {
        const qs = Quiz.score();
        if (qs.asked) {
          rows.push(['FORENSICS', qs.right + '/' + qs.asked + '  ('
            + Math.round(100 * qs.right / qs.asked) + '%)']);
        }
      }
      const boxY = H * 0.36;
      const rowH = H * 0.058;
      ctx.save();
      ctx.fillStyle = 'rgba(8, 14, 28, 0.8)';
      ctx.fillRect(W * 0.1, boxY, W * 0.8, rowH * rows.length + H * 0.02);
      ctx.strokeStyle = 'rgba(255, 90, 90, 0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(W * 0.1, boxY, W * 0.8, rowH * rows.length + H * 0.02);
      rows.forEach(function (r, i) {
        const y = boxY + H * 0.012 + rowH * (i + 0.7);
        ctx.font = 'bold ' + Math.round(8 * UNIT) + 'px "Press Start 2P", monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(190, 210, 235, 0.85)';
        ctx.fillText(r[0], W * 0.14, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = i === 0 ? '#ffd447' : '#ffffff';
        ctx.fillText(r[1], W * 0.86, y);
      });
      ctx.restore();

      if (game.newHigh) {
        bannerText('NEW HIGH SCORE!', H * 0.72,
          Math.floor(game.frame / 10) % 2 ? '#ffd447' : '#ffffff', 12);
      }
      bannerText('PRESS ENTER TO RETRY', H * 0.82, '#ffd447', 11);
      bannerText('1-3 MODE   LEFT/RIGHT MAP', H * 0.88, 'rgba(255,255,255,0.65)', 8);
    }
    if (game.state === STATE.TITLE) drawTitleScreen();

    if (game.paused && game.state === STATE.PLAY) drawPauseScreen();
  }

  /* ------------------------------------------------------------------ */
  /* MAIN MENU                                                           */
  /* ------------------------------------------------------------------ */
  /* Drawn into the game canvas, so it scales with the board and can never
     fall out of step with it. Everything is built from one container - a
     pixel box with stepped corners, a chunky drop and a lit top row - so
     every section reads as part of the same machine.

     The layout runs top to bottom in UNITs (the board is 448 x 496 of them):
     title, the cast, the map, the difficulty, its numbers, PLAY, progress
     and today's challenge. PLAY is the only thing that glows all the time. */

  const U = UNIT;
  const MENU_FONT = '"Press Start 2P", monospace';
  const CAST_COLORS = ['#e8412f', '#f7b2ff', '#4fd2ff', '#f0a03c'];
  const MAP_ACCENT = { tilted: '#9fd4ff', divot: '#e8b062', lake: '#5fd8f0', park: '#8ee07a' };
  // the cards get their own accents: Hard's game colour is the same gold as
  // PLAY, and a selected card should never compete with the button
  const MODE_ACCENT = { easy: '#7ee07a', hard: '#f2a03c', extreme: '#ff5a5a' };
  const MODE_IDS = DIFFICULTY_ORDER.map(function (k) { return 'mode:' + k; });
  const ACH_IDS = Achievements.LIST.map(function (_, i) { return 'ach:' + i; });

  // content column inside the main panel
  const PANEL_X = 10 * U, PANEL_Y = 8 * U, PANEL_W = 428 * U, PANEL_H = 480 * U;
  const CX0 = 26 * U, CX1 = 422 * U, CW = CX1 - CX0;

  const CHALLENGES = [
    'CLEAR A BOARD WITHOUT LOSING A LIFE',
    'GET 5 FORENSICS QUESTIONS RIGHT',
    'EAT ALL FOUR ENEMIES FROM ONE CHUG JUG',
    'BUILD A x5 COMBO',
    'FIND A SECRET VAULT',
    'CLEAR A BOARD IN UNDER 90 SECONDS',
    'BEAT YOUR HIGH SCORE ON THIS MAP'
  ];
  // one per calendar day, worked out once - it is a suggestion, not tracked
  const CHALLENGE = (function () {
    const d = new Date();
    const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
    return CHALLENGES[day % CHALLENGES.length];
  })();

  const PIX = {
    star: ['..#..', '.###.', '#####', '.###.', '.#.#.'],
    heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
    check: ['.....##', '....##.', '##.##..', '.###...', '..#....'],
    trophy: ['#######', '#.###.#', '.#####.', '..###..', '...#...', '..###..', '.#####.'],
    flag: ['##....', '####..', '######', '####..', '##....', '#.....', '#.....'],
    diamond: ['.#.', '###', '.#.']
  };

  const menu = {
    hover: null, pressed: null, audioReady: false,
    lastMap: null, mapPrev: null, mapDir: 0, mapK: 1,
    lastMode: null, modePrev: null, modeK: 1,
    mx: 0, my: 0, tx: 0, ty: 0,
    regions: [], regionCount: 0
  };

  /* ---- small helpers ------------------------------------------------- */

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function easeOut(k) { const i = 1 - clamp01(k); return 1 - i * i * i; }

  const colorCache = {};
  function hexA(hex, a) {
    const key = hex + a;
    let c = colorCache[key];
    if (!c) {
      const v = parseInt(hex.slice(1), 16);
      c = colorCache[key] = 'rgba(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + a + ')';
    }
    return c;
  }

  function hexMix(a, b, k) {
    const key = a + b + k;
    let c = colorCache[key];
    if (!c) {
      const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
      const r = Math.round(((x >> 16) & 255) * (1 - k) + ((y >> 16) & 255) * k);
      const g = Math.round(((x >> 8) & 255) * (1 - k) + ((y >> 8) & 255) * k);
      const bl = Math.round((x & 255) * (1 - k) + (y & 255) * k);
      c = colorCache[key] = 'rgb(' + r + ',' + g + ',' + bl + ')';
    }
    return c;
  }

  function mFont(size) { ctx.font = 'bold ' + Math.round(size * U) + 'px ' + MENU_FONT; }

  function mText(str, x, y, color, size, align) {
    mFont(size);
    ctx.textAlign = align || 'center';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  /** Text with a hard drop shadow - the pixel-art way to lift it. */
  function mShadowText(str, x, y, color, size, align, shadow) {
    mFont(size);
    ctx.textAlign = align || 'center';
    ctx.fillStyle = shadow || 'rgba(0,0,0,0.8)';
    ctx.fillText(str, x, y + Math.max(1, Math.round(size * U / 7)));
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  /** Shrinks the text rather than letting it run out of its box. */
  function mFitText(str, x, y, color, size, maxW, align, shadow) {
    let s = size;
    mFont(s);
    while (s > 4 && ctx.measureText(str).width > maxW) { s -= 0.5; mFont(s); }
    if (shadow) mShadowText(str, x, y, color, s, align);
    else mText(str, x, y, color, s, align);
  }

  /** A rectangle with stepped corners - the pixel answer to a radius. */
  function mPath(x, y, w, h, n, append) {
    if (!append) ctx.beginPath();
    ctx.moveTo(x + n, y);
    ctx.lineTo(x + w - n, y); ctx.lineTo(x + w - n, y + n); ctx.lineTo(x + w, y + n);
    ctx.lineTo(x + w, y + h - n); ctx.lineTo(x + w - n, y + h - n); ctx.lineTo(x + w - n, y + h);
    ctx.lineTo(x + n, y + h); ctx.lineTo(x + n, y + h - n); ctx.lineTo(x, y + h - n);
    ctx.lineTo(x, y + n); ctx.lineTo(x + n, y + n);
    ctx.closePath();
  }

  /**
   * The one container: chunky drop, coloured edge ring, face, a lit top row
   * and a shaded bottom row. The face is filled first and the edge drawn as a
   * ring, so a translucent face lets the map through instead of the edge.
   */
  function mBox(x, y, w, h, o) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const n = Math.round((o.notch === undefined ? 3 : o.notch) * U);
    const b = Math.max(1, Math.round((o.border === undefined ? 2 : o.border) * U));
    const drop = o.drop === undefined ? 4 : o.drop;
    const inN = Math.max(Math.round(U), n - b);
    if (drop) {
      ctx.fillStyle = o.dropColor || 'rgba(0,0,0,0.45)';
      mPath(x, y + Math.round(drop * U), w, h, n);
      ctx.fill();
    }
    ctx.fillStyle = o.face;
    mPath(x + b, y + b, w - 2 * b, h - 2 * b, inN);
    ctx.fill();
    ctx.fillStyle = o.edge;
    mPath(x, y, w, h, n);
    mPath(x + b, y + b, w - 2 * b, h - 2 * b, inN, true);
    ctx.fill('evenodd');
    if (o.light !== null) {
      const lh = Math.max(1, Math.round(U * 1.2));
      const lw = w - 2 * (b + inN);
      ctx.fillStyle = o.light || 'rgba(255,255,255,0.09)';
      ctx.fillRect(x + b + inN, y + b, lw, lh);
      ctx.fillStyle = o.shade || 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + b + inN, y + h - b - lh, lw, lh);
    }
  }

  /** A stepped ring, for layered borders and light bleeding inwards. */
  function mRing(x, y, w, h, n, thick, color) {
    ctx.fillStyle = color;
    mPath(x, y, w, h, n);
    mPath(x + thick, y + thick, w - 2 * thick, h - 2 * thick, Math.max(1, n - thick), true);
    ctx.fill('evenodd');
  }

  /** Draws a '#' pattern, merging runs so a row is one fillRect, not five. */
  function mIcon(rows, x, y, s, color) {
    ctx.fillStyle = color;
    x = Math.round(x); y = Math.round(y);
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        if (row.charCodeAt(c) !== 35) continue;
        const start = c;
        while (c + 1 < row.length && row.charCodeAt(c + 1) === 35) c++;
        ctx.fillRect(x + start * s, y + r * s, (c - start + 1) * s, s);
      }
    }
  }

  /** A solid pixel triangle pointing left (-1) or right (1). */
  function mChevron(cx, cy, s, dir, color) {
    ctx.fillStyle = color;
    for (let i = -3; i <= 3; i++) {
      const len = (4 - Math.abs(i)) * s;
      const y = Math.round(cy + i * s - s / 2);
      const x = dir > 0 ? Math.round(cx - 2 * s) : Math.round(cx + 2 * s - len);
      ctx.fillRect(x, y, len, s);
    }
  }

  // one radial gradient per colour, reused by moving and scaling it
  const glowCache = {};
  function mGlow(x, y, r, color, alpha, squash) {
    let g = glowCache[color];
    if (!g) {
      g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, hexA(color, 1));
      g.addColorStop(1, hexA(color, 0));     // same hue, so no dark fringe
      glowCache[color] = g;
    }
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.scale(r, r * (squash || 1));
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  /** A stepped pixel shadow under a character. */
  function mShadow(x, y, rx, alpha) {
    const u = Math.max(1, Math.round(U * 1.4));
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = hexA('#000000', alpha);
    ctx.fillRect(Math.round(x - rx * 0.7), y - u, Math.round(rx * 1.4), u);
    ctx.fillRect(Math.round(x - rx), y, Math.round(rx * 2), u);
    ctx.fillRect(Math.round(x - rx * 0.7), y + u, Math.round(rx * 1.4), u);
  }

  /* ---- hit regions: written while drawing, read by the mouse --------- */

  function addRegion(id, x, y, w, h) {
    let r = menu.regions[menu.regionCount];
    if (!r) { r = {}; menu.regions[menu.regionCount] = r; }
    r.id = id; r.x = x; r.y = y; r.w = w; r.h = h;
    menu.regionCount++;
  }

  function hitRegion(px, py) {
    for (let i = menu.regionCount - 1; i >= 0; i--) {
      const r = menu.regions[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r.id;
    }
    return null;
  }

  /** Each section rises in a beat after the one above it. */
  function mSection(i) {
    ctx.save();
    if (reducedMotion) return;
    const k = easeOut((game.menuTime - 0.08 - i * 0.045) / 0.26);
    ctx.globalAlpha *= k;
    if (k < 1) ctx.translate(0, Math.round((1 - k) * 8 * U));
  }

  /* ---- menu clock: transitions, change detection, parallax ----------- */

  function mapIndex(key) {
    for (let i = 0; i < Maze.MAPS.length; i++) if (Maze.MAPS[i].key === key) return i;
    return 0;
  }

  function updateMenu(dt) {
    const k = Math.min(1, dt * 4);
    menu.mx += (menu.tx - menu.mx) * k;
    menu.my += (menu.ty - menu.my) * k;
    if (menu.mapK < 1) menu.mapK = Math.min(1, menu.mapK + dt / 0.2);
    if (menu.modeK < 1) menu.modeK = Math.min(1, menu.modeK + dt / 0.25);

    // map and mode change through the keyboard as well as the mouse, so
    // changes are noticed here rather than in every place that makes them
    if (menu.lastMap !== game.mapKey) {
      if (menu.lastMap !== null) {
        let d = mapIndex(game.mapKey) - mapIndex(menu.lastMap);
        if (d > 1) d = -1; else if (d < -1) d = 1;
        menu.mapPrev = menu.lastMap;
        menu.mapDir = d < 0 ? -1 : 1;
        menu.mapK = 0;
        if (menu.audioReady) Sound.select();
      }
      menu.lastMap = game.mapKey;
    }
    if (menu.lastMode !== game.difficulty) {
      if (menu.lastMode !== null) {
        menu.modePrev = menu.lastMode;
        menu.modeK = 0;
        if (menu.audioReady) Sound.select();
      }
      menu.lastMode = game.difficulty;
    }
  }

  const parVec = { x: 0, y: 0 };
  /** The map drifts a few pixels behind the menu and leans toward the mouse. */
  function menuParallax() {
    if (reducedMotion) { parVec.x = 0; parVec.y = 0; return parVec; }
    const t = game.menuTime;
    parVec.x = Math.round(Math.sin(t * 0.21) * 2 * U + menu.mx * 3 * U);
    parVec.y = Math.round(Math.cos(t * 0.17) * 2 * U + menu.my * 2 * U);
    return parVec;
  }

  /* ---- the shell ------------------------------------------------------ */

  let vignette = null;
  const MOTES = [];
  for (let i = 0; i < 14; i++) {
    MOTES.push({ x: Math.random(), y: Math.random(), s: 1 + Math.round(Math.random()),
      sp: 5 + Math.random() * 8, ph: Math.random() * 6.28 });
  }

  function drawShell() {
    if (!vignette) {
      vignette = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.22, W / 2, H * 0.45, H * 0.8);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.66)');
    }
    // the map stays visible: a light tint, then the vignette
    ctx.fillStyle = 'rgba(3, 10, 9, 0.38)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    const x = PANEL_X, y = PANEL_Y, w = PANEL_W, h = PANEL_H;
    const n = Math.round(7 * U);
    // hard outer rim, teal edge, then light bleeding in from the edge
    mRing(x - 2 * U, y - 2 * U, w + 4 * U, h + 4 * U, n + 2 * U, 2 * U, '#020806');
    mBox(x, y, w, h, { face: 'rgba(7, 20, 17, 0.8)', edge: '#2c5d54', notch: 7, border: 2,
      drop: 0, light: 'rgba(126,240,255,0.12)', shade: 'rgba(0,0,0,0.3)' });
    mRing(x + 2 * U, y + 2 * U, w - 4 * U, h - 4 * U, n - 2 * U, U, 'rgba(126,240,255,0.16)');
    mRing(x + 3 * U, y + 3 * U, w - 6 * U, h - 6 * U, n - 3 * U, U, 'rgba(126,240,255,0.07)');
    mRing(x + 4 * U, y + 4 * U, w - 8 * U, h - 8 * U, n - 4 * U, 2 * U, 'rgba(126,240,255,0.03)');

    // gold brackets and rivets in each corner
    const L = Math.round(14 * U), T = Math.round(2 * U), inset = Math.round(6 * U);
    const bx0 = x + inset, by0 = y + inset, bx1 = x + w - inset, by1 = y + h - inset;
    ctx.fillStyle = '#c9952e';
    ctx.fillRect(bx0, by0, L, T); ctx.fillRect(bx0, by0, T, L);
    ctx.fillRect(bx1 - L, by0, L, T); ctx.fillRect(bx1 - T, by0, T, L);
    ctx.fillRect(bx0, by1 - T, L, T); ctx.fillRect(bx0, by1 - L, T, L);
    ctx.fillRect(bx1 - L, by1 - T, L, T); ctx.fillRect(bx1 - T, by1 - L, T, L);
    ctx.fillStyle = '#ffd447';
    ctx.fillRect(bx0, by0, T, T); ctx.fillRect(bx1 - T, by0, T, T);
    ctx.fillRect(bx0, by1 - T, T, T); ctx.fillRect(bx1 - T, by1 - T, T, T);
  }

  /** Dust in the light: a handful of slow motes, drawn last and faint. */
  function drawMotes() {
    if (reducedMotion) return;
    const t = game.menuTime;
    ctx.fillStyle = '#ffe9a0';
    for (let i = 0; i < MOTES.length; i++) {
      const m = MOTES[i];
      const px = Math.round(m.x * W + Math.sin(t * 0.4 + m.ph) * 8 * U);
      const py = Math.round((((m.y * H - t * m.sp * U) % H) + H) % H);
      ctx.globalAlpha = 0.08 + 0.1 * (0.5 + 0.5 * Math.sin(t * 1.3 + m.ph));
      const s = Math.round(m.s * U);
      ctx.fillRect(px, py, s, s);
    }
    ctx.globalAlpha = 1;
  }

  /* ---- title ---------------------------------------------------------- */

  let titleArt = null;
  if (document.fonts && document.fonts.ready) {
    // the first build may have used a fallback font; rebuild once it is in
    document.fonts.ready.then(function () { titleArt = null; });
  }

  function buildTitle() {
    const size = Math.round(23 * U);
    const font = 'bold ' + size + 'px ' + MENU_FONT;
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = font;
    const tw = Math.ceil(probe.measureText('BURGER MUNCH').width);
    const depth = 5;
    const pad = Math.ceil(4 * U);
    const w = tw + pad * 2;
    const h = Math.ceil(size * 1.15 + depth * U + pad * 2);
    const base = pad + size;
    const make = function () {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.font = font; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
      return { canvas: c, ctx: x };
    };
    const full = make(), face = make(), shine = make();
    const f = full.ctx;
    // extrusion: stepped layers, darkest at the back
    for (let i = depth; i >= 1; i--) {
      f.fillStyle = i >= depth - 1 ? '#3a1606' : (i >= 3 ? '#6b2a0c' : '#8a3b12');
      f.fillText('BURGER MUNCH', pad, base + i * U);
    }
    // a one-pixel dark outline around the face
    f.fillStyle = '#2a1004';
    f.fillText('BURGER MUNCH', pad - U, base);
    f.fillText('BURGER MUNCH', pad + U, base);
    f.fillText('BURGER MUNCH', pad, base - U);
    const g = f.createLinearGradient(0, base - size, 0, base);
    g.addColorStop(0, '#fff3bd');
    g.addColorStop(0.45, '#ffd447');
    g.addColorStop(1, '#f29a2e');
    f.fillStyle = g;
    f.fillText('BURGER MUNCH', pad, base);
    face.ctx.fillStyle = '#ffffff';
    face.ctx.fillText('BURGER MUNCH', pad, base);
    return { w: w, h: h, base: base, full: full.canvas, face: face.canvas, shine: shine };
  }

  function drawTitle(cx, baseY) {
    if (!titleArt) titleArt = buildTitle();
    const T = titleArt;
    const t = game.menuTime;
    const float = reducedMotion ? 0 : Math.round(Math.sin(t * 1.6) * 2 * U);
    const x = Math.round(cx - T.w / 2);
    const y = Math.round(baseY - T.base + float);

    const breathe = reducedMotion ? 0 : Math.sin(t * 1.1) * 0.06;
    mGlow(cx, baseY - 9 * U + float, T.w * 0.62, '#ffb23a', 0.34 + breathe, 0.3);
    ctx.drawImage(T.full, x, y);

    // every few seconds a narrow band of light crosses the letters
    if (!reducedMotion) {
      const p = (t % 4.6) / 0.9;
      if (p < 1 && t > 1) {
        const s = T.shine;
        s.ctx.globalCompositeOperation = 'source-over';
        s.ctx.clearRect(0, 0, T.w, T.h);
        s.ctx.drawImage(T.face, 0, 0);
        s.ctx.globalCompositeOperation = 'source-atop';
        const bx = -T.h + p * (T.w + T.h * 2);
        const bw = 10 * U;
        s.ctx.fillStyle = 'rgba(255,255,255,0.9)';
        s.ctx.beginPath();
        s.ctx.moveTo(bx, 0); s.ctx.lineTo(bx + bw, 0);
        s.ctx.lineTo(bx + bw - T.h * 0.6, T.h); s.ctx.lineTo(bx - T.h * 0.6, T.h);
        s.ctx.closePath(); s.ctx.fill();
        s.ctx.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.globalAlpha *= 0.6;
        ctx.drawImage(s.canvas, x, y);
        ctx.restore();
      }
    }
  }

  /* ---- the cast ------------------------------------------------------- */

  function drawCast(cy) {
    const t = game.menuTime;
    const skin = currentMap().skin;
    const slots = [-94, -50, 50, 94];
    for (let i = 0; i < 4; i++) {
      const x = W / 2 + slots[i] * U;
      const bob = reducedMotion ? 0 : Math.sin(t * 2.2 + i * 1.3) * 2.5 * U;
      const col = CAST_COLORS[i];
      mGlow(x, cy, 20 * U, col, 0.2, 0.9);
      mShadow(x, cy + 16 * U, 10 * U - bob * 0.4, 0.38);
      Sprites.drawGhost(ctx, x, Math.round(cy + bob), 26 * U, col,
        reducedMotion ? 0 : Math.floor(t * 4 + i) % 2, 'normal', slots[i] < 0 ? 'right' : 'left', skin);
    }

    // the burger: idles, and every few seconds hops and chomps
    const hp = (t % 3.2) / 0.42;
    const hopping = !reducedMotion && hp < 1 && t > 0.8;
    const hop = hopping ? Math.sin(hp * Math.PI) * 7 * U : 0;
    const bob = reducedMotion ? 0 : Math.sin(t * 2.6) * 1.5 * U;
    const by = Math.round(cy - 2 * U + bob - hop);
    mGlow(W / 2, cy, 34 * U, '#ffd447', 0.3, 0.75);
    mShadow(W / 2, cy + 19 * U, 14 * U - hop * 0.5, 0.48);
    const mouth = reducedMotion ? 0.6
      : (hopping ? Math.abs(Math.sin(hp * Math.PI * 2)) : 0.3 + 0.25 * Math.sin(t * 3));
    Sprites.drawPac(ctx, W / 2, by, 38 * U, 'right', mouth);

    // a little YOU tag, pointing up at the hero
    const tagW = Math.round(24 * U), tagH = Math.round(10 * U);
    const tx = Math.round(W / 2 - tagW / 2), ty = Math.round(cy + 23 * U);
    ctx.fillStyle = '#ffd447';
    ctx.fillRect(Math.round(W / 2 - U), ty - Math.round(U * 1.5), Math.round(2 * U), Math.round(U * 1.5));
    mBox(tx, ty, tagW, tagH, { face: '#ffd447', edge: '#3a2000', border: 1, notch: 1.5, drop: 2,
      light: 'rgba(255,255,255,0.5)', shade: 'rgba(160,80,0,0.4)' });
    mText('YOU', W / 2, ty + 7.6 * U, '#3a2000', 5.5);
  }

  /* ---- map ------------------------------------------------------------ */

  const thumbs = {};
  /** A minimap from the real board, kept once it has been seen. */
  function mapThumb(key) {
    if (thumbs[key]) return thumbs[key];
    if (key !== game.mapKey || !game.board) return null;
    const c = document.createElement('canvas');
    c.width = Math.round(37 * U); c.height = Math.round(41 * U);
    const t = c.getContext('2d');
    t.imageSmoothingEnabled = true;          // a minimap wants averaging
    t.drawImage(game.board, 0, 0, c.width, c.height);
    thumbs[key] = c;
    return c;
  }

  function mapContent(map, x, top, w, h) {
    const accent = MAP_ACCENT[map.key] || '#7ef0ff';
    const tw = Math.round(37 * U), th = Math.round(41 * U);
    const tx = Math.round(x + 9 * U), ty = Math.round(top + (h - th) / 2);
    ctx.fillStyle = '#030a08';
    ctx.fillRect(tx - 2 * U, ty - 2 * U, tw + 4 * U, th + 4 * U);
    mRing(tx - Math.round(U), ty - Math.round(U), tw + Math.round(2 * U), th + Math.round(2 * U), 0, Math.round(U), accent);
    const img = mapThumb(map.key);
    if (img) ctx.drawImage(img, tx, ty, tw, th);

    const textX = tx + tw + 11 * U;
    const maxW = x + w - 10 * U - textX;
    mFitText(map.sub || '', textX, top + 17 * U, accent, 6, maxW, 'left', true);
    mFitText(map.name, textX, top + 33 * U, '#ffd447', 13, maxW, 'left', true);
    mFitText(map.blurb, textX, top + 46 * U, 'rgba(206,228,224,0.72)', 5, maxW, 'left');
  }

  function arrowButton(id, x, y, w, h, dir) {
    const hov = menu.hover === id;
    const prs = hov && menu.pressed === id;
    const lift = prs ? U : (hov ? -2 * U : 0);
    mBox(x, y + lift, w, h, { face: hov ? '#173a31' : '#0c211c', edge: hov ? '#ffd447' : '#2f6f63',
      notch: 2, border: 2, drop: prs ? 1 : 3 });
    const pulse = reducedMotion || hov ? 1 : 0.7 + 0.3 * Math.sin(game.menuTime * 3);
    const nudge = hov && !reducedMotion ? dir * 1.5 * U : 0;
    ctx.save();
    ctx.globalAlpha *= pulse;
    mChevron(x + w / 2 + nudge, y + lift + h / 2, Math.round(2 * U), dir, hov ? '#ffd447' : '#7ef0ff');
    ctx.restore();
    addRegion(id, x, y, w, h);
  }

  function drawMapSection(top) {
    const h = Math.round(56 * U), btnW = Math.round(26 * U), gap = Math.round(5 * U);
    const cardX = CX0 + btnW + gap, cardW = CW - 2 * (btnW + gap);
    const map = currentMap();
    const accent = MAP_ACCENT[map.key] || '#7ef0ff';

    arrowButton('map-prev', CX0, top + 8 * U, btnW, h - 16 * U, -1);
    arrowButton('map-next', CX1 - btnW, top + 8 * U, btnW, h - 16 * U, 1);

    mBox(cardX, top, cardW, h, { face: '#0b1f1a', edge: hexMix(accent, '#0b1f1a', 0.35),
      notch: 3, border: 2, drop: 4 });

    // the new map slides in from the side it came from; the old one leaves
    // the other way. Clipped to the card, about 200ms.
    const k = easeOut(menu.mapK);
    const slide = 34 * U;
    const inset = Math.round(2 * U);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cardX + inset, top + inset, cardW - inset * 2, h - inset * 2);
    ctx.clip();
    const base = ctx.globalAlpha;
    if (menu.mapK < 1 && menu.mapPrev) {
      ctx.globalAlpha = base * (1 - k);
      mapContent(Maze.get(menu.mapPrev), cardX - menu.mapDir * slide * k, top, cardW, h);
    }
    ctx.globalAlpha = base * (menu.mapK < 1 ? k : 1);
    mapContent(map, cardX + menu.mapDir * slide * (1 - k), top, cardW, h);
    ctx.restore();

    // a folder tab names the section, sitting on the card's top edge
    const tabW = Math.round(34 * U), tabH = Math.round(10 * U);
    const tabX = Math.round(cardX + 10 * U), tabY = Math.round(top - tabH + 2 * U);
    mBox(tabX, tabY, tabW, tabH, { face: accent, edge: '#06120f', notch: 1.5, border: 1,
      drop: 0, light: 'rgba(255,255,255,0.45)', shade: null });
    mText('MAP', tabX + tabW / 2, tabY + 7.6 * U, '#06120f', 5.5);

    // which of the four maps this is
    const count = Maze.MAPS.length, ds = Math.round(3 * U), dg = Math.round(5 * U);
    let dx = Math.round(W / 2 - (count * ds + (count - 1) * dg) / 2);
    const dy = Math.round(top + h + 8 * U);
    for (let i = 0; i < count; i++) {
      const on = Maze.MAPS[i].key === map.key;
      ctx.fillStyle = on ? '#ffd447' : 'rgba(255,255,255,0.22)';
      ctx.fillRect(dx, on ? dy - U : dy, on ? ds + Math.round(U) : ds, on ? ds + Math.round(U) : ds);
      dx += ds + dg;
    }
  }

  /* ---- difficulty ----------------------------------------------------- */

  function drawDifficulty(top) {
    mText('CHOOSE DIFFICULTY', W / 2, top - 6 * U, 'rgba(160,200,196,0.7)', 5);
    const gap = Math.round(8 * U), ch = Math.round(54 * U);
    const cw = Math.round((CW - 2 * gap) / 3);
    const t = game.menuTime;

    for (let i = 0; i < 3; i++) {
      const key = DIFFICULTY_ORDER[i], d = DIFFICULTIES[key], id = MODE_IDS[i];
      const accent = MODE_ACCENT[key] || d.color;
      const sel = key === game.difficulty;
      const hov = menu.hover === id;
      const prs = hov && menu.pressed === id;
      const x0 = CX0 + i * (cw + gap);

      // grow the box rather than scale it, so the pixels stay crisp
      let grow = 0, lift = 0;
      if (sel) {
        const snap = menu.modeK < 1 ? 1 - easeOut(menu.modeK) : 0;
        grow = Math.round((3 + snap * 3) * U);
      } else if (hov) lift = Math.round(-2 * U);
      if (prs) lift = Math.round(U);
      const x = x0 - grow, y = top - grow + lift, w = cw + grow * 2, h = ch + grow * 2;
      const cx = x0 + cw / 2;

      if (sel) {
        const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 4);
        ctx.fillStyle = hexA(accent, (0.14 + pulse * 0.12).toFixed(2));
        mPath(x - 4 * U, y - 4 * U, w + 8 * U, h + 8 * U, 6 * U);
        ctx.fill();
      }
      const edge = sel ? accent : (hov ? hexMix(accent, '#14302a', 0.4) : '#24433c');
      const face = sel ? hexMix(accent, '#0a1a16', 0.8) : (hov ? '#11271f' : '#0b1d18');
      mBox(x, y, w, h, { face: face, edge: edge, border: sel ? 3 : 2, notch: 3,
        drop: prs ? 1 : 4, light: sel ? hexA(accent, 0.3) : undefined });

      const yy = top + lift;
      mShadowText(d.name, cx, yy + 17 * U, sel ? '#ffffff' : (hov ? accent : 'rgba(226,240,236,0.62)'),
        sel ? 10 : 9);

      // stars: how fast the enemies are
      const s = Math.round(2 * U), sg = Math.round(3 * U);
      const sw = 3 * 5 * s + 2 * sg;
      let sx = Math.round(cx - sw / 2);
      for (let k = 0; k < 3; k++) {
        const filled = k < (d.stars || 1);
        mIcon(PIX.star, sx, yy + 23 * U, s,
          filled ? (sel ? '#ffd447' : (hov ? '#c9a640' : '#6f6236')) : (sel ? 'rgba(0,0,0,0.35)' : '#1c3630'));
        sx += 5 * s + sg;
      }
      mText(d.tag || '', cx, yy + 46 * U, sel ? accent : 'rgba(206,228,224,0.42)', 6);

      if (sel) {
        // a check badge on the corner, so the choice reads even in greyscale
        const bs = Math.round(12 * U);
        const bx = x + w - bs + Math.round(3 * U), by = y - Math.round(4 * U);
        mBox(bx, by, bs, bs, { face: accent, edge: '#06120f', border: 1.5, notch: 1.5, drop: 2,
          light: 'rgba(255,255,255,0.45)', shade: null });
        const cs = Math.max(1, Math.round(U));
        mIcon(PIX.check, bx + (bs - 7 * cs) / 2, by + (bs - 5 * cs) / 2, cs, '#06120f');
      }
      addRegion(id, x0, top, cw, ch);
    }
  }

  /** The numbers behind the choice; they count to their new values. */
  function drawStats(top) {
    const h = Math.round(28 * U);
    mBox(CX0, top, CW, h, { face: '#0a1b17', edge: '#1f4038', border: 2, notch: 2, drop: 3 });
    const d = diff();
    const prev = (menu.modeK < 1 && DIFFICULTIES[menu.modePrev]) || d;
    const k = easeOut(menu.modeK);
    const lerp = function (a, b) { return a + (b - a) * k; };
    const accent = MODE_ACCENT[d.key] || d.color;
    const flash = menu.modeK < 1 ? 1 - k : 0;
    const valColor = flash > 0.05 ? accent : '#ffd447';

    const cells = 4, cw = CW / cells;
    ctx.fillStyle = '#1f4038';
    for (let i = 1; i < cells; i++) {
      ctx.fillRect(Math.round(CX0 + i * cw), Math.round(top + 6 * U), Math.round(U), Math.round(h - 12 * U));
    }
    const ly = top + 10 * U, vy = top + 23 * U;
    const labels = ['ENEMY SPEED', 'LIVES', 'BOARDS', 'SCORE BONUS'];
    for (let i = 0; i < cells; i++) {
      mText(labels[i], CX0 + cw * (i + 0.5), ly, 'rgba(160,200,196,0.75)', 4.5);
    }

    // enemy speed as stars, filling across when it changes
    const fill = lerp(prev.stars || 1, d.stars || 1);
    const s = Math.round(1.8 * U), sg = Math.round(2 * U);
    let sx = Math.round(CX0 + cw * 0.5 - (15 * s + 2 * sg) / 2);
    for (let j = 0; j < 3; j++) {
      mIcon(PIX.star, sx, vy - 9 * U, s, '#1c3630');
      const a = clamp01(fill - j);
      if (a > 0) {
        ctx.save(); ctx.globalAlpha *= a;
        mIcon(PIX.star, sx, vy - 9 * U, s, valColor);
        ctx.restore();
      }
      sx += 5 * s + sg;
    }

    // lives with a heart
    const lives = Math.round(lerp(prev.lives, d.lives));
    const hs = Math.round(1.4 * U);
    mFont(8);
    const lw = ctx.measureText('×' + lives).width;
    const groupW = 7 * hs + 3 * U + lw;
    const gx = CX0 + cw * 1.5 - groupW / 2;
    mIcon(PIX.heart, gx, vy - 7.5 * U, hs, '#ff5a6e');
    mShadowText('×' + lives, gx + 7 * hs + 3 * U, vy, valColor, 8, 'left');

    mShadowText(String(Math.round(lerp(prev.levels, d.levels))), CX0 + cw * 2.5, vy, valColor, 8);
    mShadowText('×' + Math.round(lerp(prev.scoreMul, d.scoreMul)), CX0 + cw * 3.5, vy, valColor, 8);
  }

  /* ---- PLAY ----------------------------------------------------------- */

  let playGrad = null;

  function drawPlay(top) {
    const w = Math.round(214 * U), h = Math.round(40 * U), x = Math.round((W - w) / 2);
    const hov = menu.hover === 'play';
    const prs = hov && menu.pressed === 'play';
    const t = game.menuTime;
    const lift = prs ? Math.round(3 * U) : (hov ? Math.round(-2 * U) : 0);
    const ext = prs ? 1 : (hov ? 7 : 5);
    const y = Math.round(top + lift);

    const beat = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 3.2);
    mGlow(W / 2, top + h / 2 + 2 * U, w * 0.66, '#ffc23a', (hov ? 0.46 : 0.3) + beat * 0.12, 0.4);

    // the extrusion: the button sits on a block, and pressing it sinks in
    ctx.fillStyle = '#5a2f04';
    mPath(x, y + Math.round(ext * U), w, h, Math.round(4 * U));
    ctx.fill();
    ctx.fillStyle = '#2a1500';
    ctx.fillRect(x + Math.round(4 * U), y + h + Math.round(ext * U) - Math.round(U), w - Math.round(8 * U), Math.round(U));

    if (!playGrad) {
      playGrad = ctx.createLinearGradient(0, 0, 0, h);
      playGrad.addColorStop(0, '#fff0a0');
      playGrad.addColorStop(0.4, '#ffd447');
      playGrad.addColorStop(1, '#f5a623');
    }
    ctx.save();
    ctx.translate(x, y);
    mBox(0, 0, w, h, { face: playGrad, edge: '#3a2000', border: 2.5, notch: 4, drop: 0,
      light: 'rgba(255,255,255,0.6)', shade: 'rgba(170,85,0,0.5)' });

    // a sliver of light that crosses the button now and then
    if (!reducedMotion) {
      const p = (t % 2.8) / 0.75;
      if (p < 1) {
        const b = Math.round(2.5 * U);
        ctx.save();
        mPath(b, b, w - 2 * b, h - 2 * b, Math.round(1.5 * U));
        ctx.clip();
        const bx = -30 * U + p * (w + 60 * U);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.moveTo(bx, 0); ctx.lineTo(bx + 12 * U, 0);
        ctx.lineTo(bx + 12 * U - h * 0.5, h); ctx.lineTo(bx - h * 0.5, h);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath();
        ctx.moveTo(bx + 16 * U, 0); ctx.lineTo(bx + 20 * U, 0);
        ctx.lineTo(bx + 20 * U - h * 0.5, h); ctx.lineTo(bx + 16 * U - h * 0.5, h);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }

    // ▶ PLAY, engraved: light underneath, dark on top
    mFont(18);
    const label = 'PLAY';
    const tw = ctx.measureText(label).width;
    const cs = Math.round(3 * U);
    const groupW = 4 * cs + 8 * U + tw;
    const gx = w / 2 - groupW / 2;
    const ty = Math.round(h / 2 + 18 * U * 0.46);
    mChevron(gx + 2 * cs, h / 2 + Math.round(U * 0.5), cs, 1, '#fff5c8');
    mChevron(gx + 2 * cs, h / 2 - Math.round(U * 0.5), cs, 1, '#3a2000');
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff5c8';
    ctx.fillText(label, gx + 4 * cs + 8 * U, ty + Math.round(1.5 * U));
    ctx.fillStyle = '#3a2000';
    ctx.fillText(label, gx + 4 * cs + 8 * U, ty);
    ctx.restore();

    addRegion('play', x, top - 2 * U, w, h + 9 * U);

    // the keyboard route, as a keycap
    mFont(5.5);
    const kText = 'ENTER', rest = 'TO DROP IN';
    const kw = Math.round(ctx.measureText(kText).width + 8 * U), kh = Math.round(10 * U);
    const rw = ctx.measureText(rest).width;
    const total = kw + 5 * U + rw;
    const kx = Math.round(W / 2 - total / 2), ky = Math.round(top + h + 12 * U);
    mBox(kx, ky, kw, kh, { face: '#1a2f2a', edge: '#4f8076', border: 1, notch: 1, drop: 2,
      light: 'rgba(255,255,255,0.18)' });
    mText(kText, kx + kw / 2, ky + 7.4 * U, '#e9fff9', 5.5);
    mText(rest, kx + kw + 5 * U, ky + 7.4 * U, 'rgba(206,228,224,0.7)', 5.5, 'left');
  }

  /* ---- progress ------------------------------------------------------- */

  function drawProgress(top) {
    const h = Math.round(32 * U);
    mBox(CX0, top, CW, h, { face: '#0a1b17', edge: '#1f4038', border: 2, notch: 2, drop: 3 });
    const list = Achievements.LIST;
    const got = Achievements.earnedCount(), total = Achievements.total;
    const hi = ACH_IDS.indexOf(menu.hover);

    mIcon(PIX.trophy, CX0 + 9 * U, top + 4.5 * U, Math.round(1.4 * U), '#ffd447');
    const headX = CX0 + 22 * U, headY = top + 12 * U;
    if (hi >= 0) {
      // hovering a pip names it, in the header, so nothing pops over the menu
      const a = list[hi], has = Achievements.has(a.id);
      mFitText((has ? a.name : 'LOCKED') + '  ·  ' + String(a.hint).toUpperCase(),
        headX, headY, has ? a.icon : 'rgba(206,228,224,0.75)', 5.5, CX1 - 50 * U - headX, 'left');
    } else {
      mText('ACHIEVEMENTS', headX, headY, '#e9fff9', 6, 'left');
    }
    mShadowText(got + ' / ' + total, CX1 - 9 * U, headY, '#ffd447', 8, 'right');

    const ps = Math.round(10 * U), pg = Math.round(4 * U);
    const py = Math.round(top + 17 * U);
    let px = Math.round(CX0 + 9 * U);
    for (let i = 0; i < list.length; i++) {
      const a = list[i], has = Achievements.has(a.id);
      if (has) {
        mGlow(px + ps / 2, py + ps / 2, ps * 1.1, a.icon, 0.35);
        mBox(px, py, ps, ps, { face: a.icon, edge: hexMix(a.icon, '#000000', 0.5), border: 1,
          notch: 1, drop: 2, light: 'rgba(255,255,255,0.55)' });
      } else {
        mBox(px, py, ps, ps, { face: '#0e211c', edge: '#24433c', border: 1, notch: 1, drop: 0,
          light: null });
      }
      if (i === hi) mRing(px - Math.round(2 * U), py - Math.round(2 * U), ps + Math.round(4 * U),
        ps + Math.round(4 * U), Math.round(U), Math.round(U), '#ffd447');
      addRegion(ACH_IDS[i], px, py, ps, ps);
      px += ps + pg;
    }

    // a segmented bar that fills as the screen opens
    const bx = px + Math.round(6 * U), bw = Math.round(CX1 - 9 * U - bx);
    const bh = Math.round(6 * U), by = Math.round(py + (ps - bh) / 2);
    ctx.fillStyle = '#050f0c';
    ctx.fillRect(bx, by, bw, bh);
    const open = reducedMotion ? 1 : easeOut((game.menuTime - 0.45) / 0.6);
    const fw = Math.round(bw * (total ? got / total : 0) * open);
    if (fw > 0) {
      ctx.fillStyle = '#ffd447';
      ctx.fillRect(bx, by, fw, bh);
      ctx.fillStyle = '#fff3bd';
      ctx.fillRect(bx, by, fw, Math.round(U));
    }
    ctx.fillStyle = '#0a1b17';
    const seg = Math.round(6 * U);
    for (let sx = bx + seg; sx < bx + bw; sx += seg) ctx.fillRect(sx, by, Math.round(U), bh);
    mRing(bx - Math.round(U), by - Math.round(U), bw + Math.round(2 * U), bh + Math.round(2 * U), 0,
      Math.round(U), '#24433c');
  }

  /* ---- today's challenge and the footer ------------------------------- */

  function drawChallenge(top) {
    const h = Math.round(20 * U);
    mBox(CX0, top, CW, h, { face: '#0d1a12', edge: '#355a2a', border: 1.5, notch: 2, drop: 2 });
    mIcon(PIX.flag, CX0 + 8 * U, top + 5.5 * U, Math.round(1.3 * U), '#8ee07a');
    const lx = CX0 + 20 * U;
    mText("TODAY'S CHALLENGE", lx, top + 12.5 * U, '#8ee07a', 5, 'left');
    mFont(5);
    const lw = ctx.measureText("TODAY'S CHALLENGE").width;
    mFitText(CHALLENGE, CX1 - 8 * U, top + 12.5 * U, '#e9fff9', 5.5, CX1 - 8 * U - (lx + lw + 10 * U), 'right');
  }

  function drawFooter(y) {
    mText('← → MAP   ↑ ↓ MODE   M SOUND', CX0 + 2 * U, y,
      'rgba(206,228,224,0.42)', 5, 'left');
    const who = window.Leaderboard && Leaderboard.who();
    const hov = menu.hover === 'signin';
    const label = who ? 'SIGNED IN AS ' + who.toUpperCase() : 'GUEST · SIGN IN FOR THE BOARD';
    mFont(5);
    const lw = ctx.measureText(label).width;
    mText(label, CX1 - 2 * U, y, hov ? '#ffd447' : (who ? 'rgba(142,224,122,0.85)' : 'rgba(206,228,224,0.55)'),
      5, 'right');
    if (hov) {
      ctx.fillStyle = '#ffd447';
      ctx.fillRect(Math.round(CX1 - 2 * U - lw), Math.round(y + 2 * U), Math.round(lw), Math.round(U));
    }
    addRegion('signin', CX1 - 2 * U - lw, y - 8 * U, lw, 12 * U);
  }

  /* ---- the whole screen ----------------------------------------------- */

  function drawTitleScreen() {
    menu.regionCount = 0;
    ctx.save();
    const fade = reducedMotion ? 1 : easeOut(game.menuTime * 3);
    ctx.globalAlpha = fade;
    drawShell();

    mSection(0);
    drawTitle(W / 2, 49 * U);
    mText('A FORTNITE ARCADE MAZE', W / 2, 63 * U, 'rgba(126,240,255,0.78)', 6);
    ctx.restore();

    mSection(1); drawCast(98 * U); ctx.restore();
    mSection(2); drawMapSection(148 * U); ctx.restore();
    mSection(3); drawDifficulty(232 * U); ctx.restore();
    mSection(4); drawStats(300 * U); ctx.restore();
    mSection(5); drawPlay(339 * U); ctx.restore();
    mSection(6); drawProgress(408 * U); ctx.restore();
    mSection(7); drawChallenge(449 * U); ctx.restore();
    mSection(8); drawFooter(478 * U); ctx.restore();

    drawMotes();
    ctx.restore();
  }

  function drawPauseScreen() {
    ctx.save();
    ctx.fillStyle = 'rgba(3, 10, 9, 0.72)';
    ctx.fillRect(0, 0, W, H);
    const w = Math.round(W * 0.62), h = Math.round(70 * U);
    const x = Math.round((W - w) / 2), y = Math.round((H - h) / 2);
    mBox(x, y, w, h, { face: '#0b1d18', edge: '#ffd447', border: 2, notch: 4, drop: 5 });
    mShadowText('PAUSED', W / 2, y + 33 * U, '#ffd447', 18);
    mText('ENTER OR P TO CARRY ON', W / 2, y + 53 * U, 'rgba(206,228,224,0.75)', 6);
    ctx.restore();
  }


  /* ================================================================== */
  /* POWER-UPS                                                           */
  /* ================================================================== */
  const POWERUPS = [
    { key: 'chili', name: 'CHILI PEPPER', sub: 'SPEED BOOST', color: '#ff5a3c', time: 6 },
    { key: 'golden', name: 'GOLDEN BURGER', sub: 'DOUBLE POINTS', color: '#ffd447', time: 8 },
    { key: 'shield', name: 'SHIELD', sub: 'SURVIVE ONE HIT', color: '#4fc3ff', time: 0 },
    { key: 'freeze', name: 'FREEZE', sub: 'ENEMIES FROZEN', color: '#9fe4ff', time: 4.5 },
    { key: 'shock', name: 'SHOCKWAVE', sub: 'CLEARS NEARBY', color: '#c6a6ff', time: 0 },
    { key: 'magnet', name: 'MAGNET', sub: 'PULLS PICK-UPS', color: '#7ee07a', time: 7 }
  ];

  function powerDef(key) {
    for (let i = 0; i < POWERUPS.length; i++) if (POWERUPS[i].key === key) return POWERUPS[i];
    return null;
  }

  function powerActive(key) { return (game.active[key] || 0) > 0; }

  /* ------------------------------------------------------------------ */
  /* THE QUESTION CLOCK                                                  */
  /* ------------------------------------------------------------------ */
  /* Power-ups are not scattered around the maze any more. A forensics
     question comes up every 20 seconds and that is the only way to get one.
     Getting it wrong costs you a short setback instead.

     Both sides are deliberately gentle. A power-up is the same one you used
     to find on the floor, and a setback is a few seconds of being slightly
     worse off - never something that takes a life on its own. */
  const QUIZ_EVERY = 20;           // seconds between questions
  const QUIZ_FIRST = 8;            // the first one comes sooner, to explain itself

  const SETBACKS = [
    { key: 'sluggish', name: 'SLUGGISH', sub: 'YOU ARE SLOWER', color: '#ff9a3c', time: 6 },
    { key: 'hunted', name: 'HUNTED', sub: 'THEY ARE QUICKER', color: '#ff5a5a', time: 5 },
    { key: 'blinkers', name: 'BLINKERS', sub: 'HARD TO SEE', color: '#9fe4ff', time: 6 },
    { key: 'butterfingers', name: 'BUTTERFINGERS', sub: 'NO COMBO BUILDING', color: '#c6a6ff', time: 8 }
  ];

  function setbackActive(key) { return (game.setbacks[key] || 0) > 0; }

  /** How much quicker the enemies get while HUNTED, eased off on Extreme
      where they already outrun the burger. */
  function huntedFactor() {
    if (!setbackActive('hunted')) return 1;
    return game.difficulty === 'extreme' ? 1.05
      : (game.difficulty === 'hard' ? 1.08 : 1.10);
  }

  function startSetback(def) {
    game.setbacks[def.key] = def.time;
    FX.announce(def.name, def.sub, def.color, 1.6);
    FX.flash(def.color, 0.16, 0.22);
    if (def.key === 'butterfingers') breakCombo();
    Sound.wrong();
  }

  function updateSetbacks(dt) {
    Object.keys(game.setbacks).forEach(function (key) {
      game.setbacks[key] -= dt;
      if (game.setbacks[key] <= 0) delete game.setbacks[key];
    });
  }

  /** The question itself: right answer buys a power-up, wrong one a setback. */
  function askQuestion() {
    if (!window.Quiz || Quiz.active()) return;
    clearHeld();                   // nobody holds the stick while reading
    Quiz.ask(function (correct) {
      if (correct) {
        const def = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
        applyPowerUp(def.key, def);
        FX.announce(def.name, def.sub, def.color, 1.6);
        addScore(400, 'quiz', { x: pac.x, y: pac.y, color: '#7ee07a', noCombo: true });
      } else {
        startSetback(SETBACKS[Math.floor(Math.random() * SETBACKS.length)]);
      }
      game.quizTimer = QUIZ_EVERY;
    });
  }

  function updateQuizClock(dt) {
    if (!window.Quiz || game.bonusRound) return;
    if (Quiz.active()) return;                   // the clock waits for an answer
    game.quizTimer -= dt;
    if (game.quizTimer <= 0) askQuestion();
  }

  function updatePowerUps(dt) {
    // nothing spawns on the floor any more - the question clock is the only
    // way a power-up arrives, so this just ages out what is running

    // tick down whatever is running
    Object.keys(game.active).forEach(function (key) {
      if (key === 'shield') return;                     // held until it is used
      game.active[key] -= dt;
      if (game.active[key] <= 0) delete game.active[key];
    });
  }

  function applyPowerUp(key, def) {
    def = def || powerDef(key);
    if (key === 'shock') {
      triggerShockwave();
      return;
    }
    if (key === 'shield') {
      game.active.shield = 1;                            // a flag, not a timer
      Sound.shield();
      return;
    }
    game.active[key] = def.time;
    if (key === 'freeze') {
      Sound.freeze();
      FX.flash('#9fe4ff', 0.25, 0.3);
    }
  }

  /** Clears every enemy within six tiles, scoring each one. */
  function triggerShockwave() {
    FX.ring(pac.x, pac.y, '#c6a6ff', TILE * 7, 0.6, 5);
    FX.shake(8, 0.45);
    FX.flash('#c6a6ff', 0.3, 0.3);
    Sound.shockwave();
    let hit = 0;
    ghosts.forEach(function (g) {
      if (g.state !== 'normal' && g.state !== 'leaving') return;
      if (distance(pac.x, pac.y, g.x, g.y) > TILE * 6) return;
      hit++;
      game.eliminations++;
      g.frightened = false;
      g.state = 'eaten';
      addScore(300, 'enemies', { x: g.x, y: g.y, color: '#c6a6ff' });
      FX.burst(g.x, g.y, ['#c6a6ff', '#ffffff'], { count: 16, speed: 140, size: 3 });
    });
    if (game.boss && game.boss.alive && distance(pac.x, pac.y, game.boss.x, game.boss.y) < TILE * 6) {
      damageBoss(1);
    }
    if (hit) FX.float(pac.x, pac.y - TILE, hit + ' CLEARED', '#c6a6ff', { size: 9 });
  }

  /** The shield takes one hit and throws the enemy off. Returns true if used. */
  function consumeShield(g) {
    if (!game.active.shield) return false;
    delete game.active.shield;
    FX.ring(pac.x, pac.y, '#4fc3ff', TILE * 4, 0.5, 4);
    FX.burst(pac.x, pac.y, ['#4fc3ff', '#eafaff'], { count: 22, speed: 150, size: 3 });
    FX.flash('#4fc3ff', 0.35, 0.35);
    FX.shake(6, 0.35);
    FX.float(pac.x, pac.y - TILE, 'SHIELD!', '#4fc3ff', { size: 10 });
    Sound.shield();
    if (g) {
      g.frightened = false;
      g.state = 'eaten';
      game.eliminations++;
    }
    game.shieldGrace = 1.2;                  // a moment to get clear
    return true;
  }

  /** The magnet hoovers up any pick-up within a few tiles. */
  function updateMagnet() {
    if (!powerActive('magnet')) return;
    const R = 3;
    const ptx = tileOf(pac.x), pty = tileOf(pac.y);
    for (let y = pty - R; y <= pty + R; y++) {
      for (let x = ptx - R; x <= ptx + R; x++) {
        if (y < 0 || y >= Maze.ROWS || x < 0 || x >= Maze.COLS) continue;
        const t = game.grid[y][x];
        if (t !== T.PELLET) continue;
        if (distance(x, y, ptx, pty) > R) continue;
        game.grid[y][x] = T.FLOOR;
        game.pelletsLeft--;
        game.dotsEaten++;
        game.pickups++;
        bumpCombo(pac.x, pac.y);
        addScore(10, 'pellets', { quiet: true });
        FX.burst(centerOf(x), centerOf(y), '#7ee07a', { count: 3, speed: 40, size: 2, life: 0.25 });
      }
    }
    if (game.pelletsLeft <= 0) completeLevel();
  }

  /* ================================================================== */
  /* RANDOM EVENTS                                                       */
  /* ================================================================== */
  const EVENTS = [
    { key: 'double', title: 'DOUBLE SCORE', sub: 'EVERYTHING PAYS TWICE', color: '#ffd447', time: 12 },
    { key: 'fast', title: 'ENEMIES FASTER', sub: 'WATCH YOURSELF', color: '#ff5a5a', time: 12 },
    { key: 'dark', title: 'LOW LIGHT', sub: 'LIGHTS OUT', color: '#9fe4ff', time: 11 },
    { key: 'bonus', title: 'BONUS PELLETS', sub: 'GRAB THEM FAST', color: '#7ee07a', time: 12 },
    { key: 'shift', title: 'MAZE SHIFT', sub: 'NEW WAYS THROUGH', color: '#c6a6ff', time: 14 },
    { key: 'speed', title: 'SPEED ROUND', sub: 'EVERYTHING FASTER', color: '#f2a03c', time: 11 }
  ];

  function eventActive(key) { return game.event && game.event.def.key === key; }

  function startEvent() {
    const def = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    game.event = { def: def, time: def.time };
    FX.announce(def.title, def.sub, def.color, 2.2);
    FX.flash(def.color, 0.28, 0.35);
    FX.shake(4, 0.3);
    Sound.event();
    if (def.key === 'bonus') sprinkleBonusPellets();
    if (def.key === 'shift') openShiftPassages();
  }

  function endEvent() {
    if (game.event && game.event.def.key === 'shift') closeShiftPassages();
    game.event = null;
  }

  function updateEvents(dt) {
    if (game.event) {
      game.event.time -= dt;
      if (game.event.time <= 0) endEvent();
      return;
    }
    game.eventTimer -= dt;
    if (game.eventTimer <= 0) {
      game.eventTimer = diff().eventEvery * (0.8 + Math.random() * 0.5);
      if (!game.bonusRound && !game.bossWarning) startEvent();
    }
  }

  /** Extra pick-ups scattered over empty floor. */
  function sprinkleBonusPellets() {
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < 26; tries++) {
      const x = 1 + Math.floor(Math.random() * (Maze.COLS - 2));
      const y = 1 + Math.floor(Math.random() * (Maze.ROWS - 2));
      if (game.grid[y][x] !== T.FLOOR) continue;
      if (y >= 11 && y <= 17 && x >= 9 && x <= 18) continue;
      game.grid[y][x] = T.PELLET;
      game.pelletsLeft++;
      game.pelletsTotal++;
      placed++;
      FX.ring(centerOf(x), centerOf(y), '#7ee07a', TILE * 0.9, 0.4, 2);
    }
  }

  /**
   * Opens a handful of interior walls for the duration. Opening a wall only
   * ever adds routes, so this cannot strand anyone; closing them again skips
   * any tile something is standing on.
   */
  function openShiftPassages() {
    closeShiftPassages();          // anything still pending gets sealed first
    game.shiftTiles = [];
    for (let tries = 0; tries < 300 && game.shiftTiles.length < 9; tries++) {
      const x = 2 + Math.floor(Math.random() * (Maze.COLS - 4));
      const y = 2 + Math.floor(Math.random() * (Maze.ROWS - 4));
      if (game.grid[y][x] !== T.WALL) continue;
      if (y >= 10 && y <= 18 && x >= 8 && x <= 19) continue;       // leave the house alone
      // open a wall that already touches at least two open tiles, so the
      // result is a real new route rather than a pointless alcove
      let open = 0;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        if (game.grid[y + d[1]][x + d[0]] !== T.WALL) open++;
      });
      if (open < 2) continue;
      game.grid[y][x] = T.FLOOR;
      game.shiftTiles.push({ x: x, y: y });
      FX.ring(centerOf(x), centerOf(y), '#c6a6ff', TILE * 1.8, 0.5, 2);
    }
    if (game.shiftTiles.length) rebuildBoard();
  }

  /**
   * Seal the temporary passages again. A tile is left open if anything is
   * near enough to be walking into it: testing the exact tile an entity's
   * centre sits in is not enough, because one straddling the boundary would
   * have the tile ahead sealed around it and end up inside a wall.
   */
  function closeShiftPassages() {
    if (!game.shiftTiles || !game.shiftTiles.length) return;
    const movers = [pac].concat(ghosts);
    game.shiftTiles = game.shiftTiles.filter(function (t) {
      const busy = movers.some(function (e) {
        return Math.abs(e.x - centerOf(t.x)) < TILE * 1.5 &&
          Math.abs(e.y - centerOf(t.y)) < TILE * 1.5;
      });
      if (busy) return true;                                       // try again later
      if (game.grid[t.y][t.x] === T.FLOOR) game.grid[t.y][t.x] = T.WALL;
      return false;
    });
    rebuildBoard();
  }

  function rebuildBoard() {
    game.board = Renderer.buildBoard(game.grid, TILE, currentMap().theme);
  }

  /* ================================================================== */
  /* SECRET ROOMS                                                        */
  /* ================================================================== */

  /**
   * Carves a couple of one-tile vaults behind solid walls. A vault is only
   * reachable through its secret door, so adding one cannot change how the
   * rest of the maze connects.
   */
  function placeSecrets() {
    game.secrets_ = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const candidates = [];
    for (let y = 2; y < Maze.ROWS - 2; y++) {
      for (let x = 2; x < Maze.COLS - 2; x++) {
        if (game.grid[y][x] !== T.WALL) continue;
        if (y >= 10 && y <= 18 && x >= 8 && x <= 19) continue;
        dirs.forEach(function (d) {
          const fx = x - d[0], fy = y - d[1];           // the corridor side
          const rx = x + d[0], ry = y + d[1];           // the vault side
          if (fx < 1 || fy < 1 || rx < 1 || ry < 1) return;
          if (fx >= Maze.COLS - 1 || fy >= Maze.ROWS - 1) return;
          if (rx >= Maze.COLS - 1 || ry >= Maze.ROWS - 1) return;
          const floorSide = game.grid[fy][fx];
          if (floorSide !== T.PELLET && floorSide !== T.FLOOR) return;
          if (game.grid[ry][rx] !== T.WALL) return;
          // the vault must be walled in on its other three sides
          let sealed = true;
          dirs.forEach(function (d2) {
            const nx = rx + d2[0], ny = ry + d2[1];
            if (nx === x && ny === y) return;
            if (nx < 0 || ny < 0 || nx >= Maze.COLS || ny >= Maze.ROWS) return;
            if (game.grid[ny][nx] !== T.WALL) sealed = false;
          });
          if (!sealed) return;
          candidates.push({ dx: x, dy: y, rx: rx, ry: ry });
        });
      }
    }
    // spread them out: take two that are not neighbours
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
    }
    candidates.forEach(function (c) {
      if (game.secrets_.length >= 2) return;
      const clash = game.secrets_.some(function (s) {
        return distance(s.dx, s.dy, c.dx, c.dy) < 8;
      });
      if (clash) return;
      game.grid[c.ry][c.rx] = T.FLOOR;         // the vault itself
      game.secrets_.push({ dx: c.dx, dy: c.dy, rx: c.rx, ry: c.ry, found: false });
    });
  }

  function isSecretDoor(x, y) {
    if (!game.secrets_) return null;
    for (let i = 0; i < game.secrets_.length; i++) {
      const s = game.secrets_[i];
      if (s.dx === x && s.dy === y) return s;
    }
    return null;
  }

  function checkSecrets() {
    if (!game.secrets_) return;
    const tx = tileOf(pac.x), ty = tileOf(pac.y);
    game.secrets_.forEach(function (s) {
      if (s.found) return;
      if (s.rx !== tx || s.ry !== ty) return;
      s.found = true;
      game.secrets++;
      addScore(2500, 'secret', { x: pac.x, y: pac.y, color: '#c6a6ff' });
      FX.announce('SECRET FOUND!', 'A HIDDEN VAULT', '#c6a6ff', 1.9);
      FX.burst(pac.x, pac.y, ['#c6a6ff', '#ffd447', '#ffffff'], { count: 30, speed: 160, size: 4 });
      FX.ring(pac.x, pac.y, '#c6a6ff', TILE * 4, 0.6, 4);
      FX.shake(6, 0.4);
      Sound.secret();
      grantAchievements();
    });
  }

  /* ================================================================== */
  /* BOSS                                                                */
  /* ================================================================== */
  const BOSS_EVERY = 4;               // every fourth board

  function isBossLevel(level) { return level % BOSS_EVERY === 0; }

  function spawnBoss() {
    game.boss = {
      x: centerOf(13), y: centerOf(11),
      dir: 'left',
      hp: 3, maxHp: 3,
      alive: true,
      hitFlash: 0,
      stompTimer: 3.5,
      anim: 0
    };
    FX.announce('BOSS INCOMING', 'HIT IT WHILE IT IS BLUE', '#ff5a5a', 2.4);
    FX.flash('#ff5a5a', 0.4, 0.5);
    FX.shake(8, 0.7);
    Sound.bossWarn();
  }

  function damageBoss(n) {
    const b = game.boss;
    if (!b || !b.alive) return;
    b.hp -= n;
    b.hitFlash = 0.35;
    FX.burst(b.x, b.y, ['#ff5a5a', '#ffffff'], { count: 22, speed: 150, size: 4 });
    FX.shake(7, 0.35);
    Sound.bossHit();
    if (b.hp <= 0) {
      b.alive = false;
      game.bosses++;
      game.eliminations++;
      addScore(5000, 'boss', { x: b.x, y: b.y, color: '#ffd447' });
      FX.announce('BOSS DOWN!', '+5000', '#ffd447', 2.2);
      FX.burst(b.x, b.y, ['#ffd447', '#ff5a5a', '#ffffff'], { count: 50, speed: 220, size: 5 });
      FX.ring(b.x, b.y, '#ffd447', TILE * 8, 0.8, 5);
      FX.shake(12, 0.8);
      Sound.bossDown();
      grantAchievements();
    } else {
      FX.float(b.x, b.y - TILE, b.hp + ' LEFT', '#ff5a5a', { size: 9 });
    }
  }

  function updateBoss(dt) {
    const b = game.boss;
    if (!b || !b.alive) return;
    b.anim += dt;
    if (b.hitFlash > 0) b.hitFlash -= dt;

    // frightened while a chug jug is running, which is the window to hit it
    const vulnerable = game.frightTimer > 0;
    const speed = BASE * (vulnerable ? 0.45 : 0.72) * diff().ghost;
    step(b, speed * dt, function (e, tx, ty) {
      // heads for the burger, but will not double back on itself
      const target = vulnerable ? { x: 13, y: 11 } : { x: tileOf(pac.x), y: tileOf(pac.y) };
      let best = null, bestDist = Infinity;
      const reverse = OPPOSITE[e.dir];
      const options = [];
      TURN_ORDER.forEach(function (dir) {
        const d = DIRS[dir];
        if (isWallFor(tx + d.x, ty + d.y, null)) return;
        options.push(dir);
        if (dir === reverse) return;
        const dist = distance(tx + d.x, ty + d.y, target.x, target.y);
        if (dist < bestDist) { bestDist = dist; best = dir; }
      });
      if (best) e.dir = best;
      else if (options.length) e.dir = options[0];
    });

    // a periodic stomp that shakes the board and hurts up close
    b.stompTimer -= dt;
    if (b.stompTimer <= 0) {
      b.stompTimer = 4 + Math.random() * 2;
      FX.ring(b.x, b.y, '#ff5a5a', TILE * 4.5, 0.55, 4);
      FX.shake(7, 0.45);
      Sound.bossHit();
      if (distance(pac.x, pac.y, b.x, b.y) < TILE * 4 && !game.shieldGrace) {
        if (!consumeShield(null)) hitByEnemy();
      }
    }

    if (distance(pac.x, pac.y, b.x, b.y) < TILE * 1.1 && game.shieldGrace <= 0) {
      if (vulnerable) damageBoss(1);
      else if (!consumeShield(null)) hitByEnemy();
    }
  }

  /* ================================================================== */
  /* BONUS ROUND                                                         */
  /* ================================================================== */
  const BONUS_EVERY = 3;

  function isBonusLevel(level) {
    return level % BONUS_EVERY === 0 && !isBossLevel(level);
  }

  function startBonusRound() {
    game.bonusRound = true;
    game.bonusTimer = 22;
    game.bonusCollected = 0;
    game.powerups.length = 0;
    // clear the board and fill it with collectibles instead
    for (let y = 0; y < Maze.ROWS; y++) {
      for (let x = 0; x < Maze.COLS; x++) {
        if (game.grid[y][x] === T.PELLET || game.grid[y][x] === T.POWER) {
          game.grid[y][x] = T.FLOOR;
        }
      }
    }
    game.pelletsLeft = 0;
    let placed = 0;
    for (let y = 1; y < Maze.ROWS - 1 && placed < 140; y++) {
      for (let x = 1; x < Maze.COLS - 1; x++) {
        if (game.grid[y][x] !== T.FLOOR) continue;
        if (y >= 11 && y <= 17 && x >= 9 && x <= 18) continue;
        if (Math.random() > 0.55) continue;
        game.grid[y][x] = T.PELLET;
        placed++;
      }
    }
    game.bonusTotal = placed;
    FX.announce('BONUS ROUND', 'COLLECT ALL YOU CAN', '#7ee07a', 2.4);
    FX.flash('#7ee07a', 0.3, 0.4);
    Sound.levelUp();
  }

  function updateBonusRound(dt) {
    if (!game.bonusRound) return;
    const before = Math.ceil(game.bonusTimer);
    game.bonusTimer -= dt;
    const now = Math.ceil(game.bonusTimer);
    if (now !== before && now <= 5 && now > 0) Sound.tick();
    if (game.bonusTimer <= 0) finishBonusRound();
  }

  function finishBonusRound() {
    const collected = game.bonusCollected;
    const bonus = collected * 25 + (collected >= game.bonusTotal ? 3000 : 0);
    addScore(bonus, 'level', { noCombo: true, x: pac.x, y: pac.y, color: '#7ee07a' });
    FX.announce('TIME UP!', collected + ' COLLECTED  +' + bonus, '#7ee07a', 2.4);
    game.bonusRound = false;
    game.state = STATE.LEVEL_CLEAR;
    game.flashTimer = 2.2;
    Sound.levelUp();
  }

  /* ================================================================== */
  /* ACHIEVEMENTS                                                        */
  /* ================================================================== */
  function grantAchievements(extra) {
    const stats = {
      pickups: game.pickups,
      combo: 0,
      bosses: game.bosses,
      secrets: game.secrets,
      noHit: extra && extra.noHit,
      clearTime: extra && extra.clearTime,
      wonExtreme: extra && extra.wonExtreme
    };
    // the 10X COMBO badge is about the multiplier the run reached
    stats.combo = game.bestMult >= 10 ? 10 : 0;
    const fired = Achievements.check(stats);
    if (fired.length) Sound.achievement();
  }

  /* ------------------------------------------------------------------ */
  /* VICTORY                                                             */
  /* ------------------------------------------------------------------ */

  // The Victory Royale banner artwork. Everything else in the game is drawn
  // in code; if this file is missing the drawn banner stands in for it.
  const victoryArt = new Image();
  let victoryArtReady = false;
  victoryArt.onload = function () { victoryArtReady = victoryArt.width > 0; };
  victoryArt.onerror = function () { victoryArtReady = false; };
  victoryArt.src = 'assets/victory-royale.png';

  const CONFETTI_COLORS = ['#ffd447', '#ff9ad5', '#3fd8e8', '#7ee07a', '#ffffff', '#f2a03c'];

  const FIREWORK_COLORS = ['#ffd447', '#7ef0ff', '#ff9ad5', '#7ee07a', '#ffffff', '#ff7a4f'];

  /** A burst of sparks that arc out and fall away. */
  function spawnFirework(x, y) {
    const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
    const sparks = [];
    const n = 26 + Math.floor(Math.random() * 14);
    const power = 90 + Math.random() * 90;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const v = power * (0.55 + Math.random() * 0.6);
      sparks.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 0.8 + Math.random() * 0.7 });
    }
    game.fireworks.push({ sparks: sparks, color: color, flash: 1 });
  }

  function updateFireworks(dt) {
    // a new burst every so often, roughly where the eye is not already looking
    if (Math.random() < dt * 2.2) {
      spawnFirework(W * (0.12 + Math.random() * 0.76), H * (0.1 + Math.random() * 0.55));
    }
    game.fireworks.forEach(function (fw) {
      fw.flash = Math.max(0, fw.flash - dt * 6);
      fw.sparks.forEach(function (s) {
        s.life -= dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 110 * dt;            // gravity
        s.vx *= 1 - dt * 0.9;        // drag
      });
      fw.sparks = fw.sparks.filter(function (s) { return s.life > 0; });
    });
    game.fireworks = game.fireworks.filter(function (fw) { return fw.sparks.length; });
  }

  function drawFireworks() {
    game.fireworks.forEach(function (fw) {
      if (fw.flash > 0) {
        ctx.save();
        ctx.globalAlpha = fw.flash * 0.5;
        ctx.fillStyle = fw.color;
        ctx.beginPath();
        ctx.arc(fw.sparks[0].x, fw.sparks[0].y, 26 * fw.flash, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      fw.sparks.forEach(function (s) {
        ctx.globalAlpha = Math.min(1, s.life * 1.6);
        ctx.fillStyle = fw.color;
        ctx.fillRect(s.x, s.y, 3, 3);
        ctx.globalAlpha = Math.min(1, s.life) * 0.4;
        ctx.fillRect(s.x - s.vx * 0.02, s.y - s.vy * 0.02, 2, 2);
      });
      ctx.globalAlpha = 1;
    });
  }

  function spawnConfetti() {
    game.confetti = [];
    for (let i = 0; i < 90; i++) {
      game.confetti.push({
        x: Math.random() * W,
        y: -Math.random() * H * 0.6,
        vy: 40 + Math.random() * 120,
        vx: (Math.random() - 0.5) * 50,
        size: 3 + Math.random() * 5,
        spin: (Math.random() - 0.5) * 8,
        angle: Math.random() * Math.PI,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]
      });
    }
  }

  function updateConfetti(dt) {
    game.confetti.forEach(function (c) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.angle += c.spin * dt;
      if (c.y > H + 10) {          // recycle so the party keeps going
        c.y = -10;
        c.x = Math.random() * W;
      }
    });
  }

  function drawConfetti() {
    game.confetti.forEach(function (c) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 1.6);
      ctx.restore();
    });
  }

  function drawVictory() {
    const pop = Math.min(1, game.winTimer / 0.5);
    const ease = 1 - Math.pow(1 - pop, 3);

    // deep blue wash, the way the game desaturates behind the banner
    ctx.fillStyle = 'rgba(6, 14, 30, 0.82)';
    ctx.fillRect(0, 0, W, H);

    // light rays turning slowly behind everything
    ctx.save();
    ctx.translate(W / 2, H * 0.42);
    ctx.rotate(game.winTimer * 0.12);
    ctx.globalAlpha = 0.16 * ease;
    for (let i = 0; i < 14; i++) {
      ctx.rotate((Math.PI * 2) / 14);
      const g = ctx.createLinearGradient(0, 0, 0, -H);
      g.addColorStop(0, 'rgba(140, 215, 255, 0.85)');
      g.addColorStop(1, 'rgba(140, 215, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-W * 0.06, -H);
      ctx.lineTo(W * 0.06, -H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // glow pooled behind the banner
    const glow = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, W * 0.62);
    glow.addColorStop(0, 'rgba(90, 180, 255, ' + (0.4 * ease) + ')');
    glow.addColorStop(1, 'rgba(90, 180, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    drawConfetti();
    drawFireworks();

    // the banner, sliding in and settling
    ctx.save();
    ctx.globalAlpha = ease;
    ctx.translate(-(1 - ease) * W * 0.5, 0);
    if (victoryArtReady) {
      const bw = W * 0.88 * (0.92 + 0.08 * ease);
      const bh = bw * (victoryArt.height / victoryArt.width);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(victoryArt, W / 2 - bw / 2, H * 0.40 - bh / 2, bw, bh);
      ctx.imageSmoothingEnabled = false;
    } else {
      Sprites.drawVictoryBanner(ctx, W / 2, H * 0.42, W * 0.74,
        '"Press Start 2P", monospace', game.frame * 0.004);
    }
    ctx.restore();

    // stat bar, the row of numbers the end screen shows
    const barY = H * 0.60;
    const barH = H * 0.115;
    ctx.fillStyle = 'rgba(8, 20, 40, 0.75)';
    ctx.fillRect(W * 0.1, barY, W * 0.8, barH);
    ctx.strokeStyle = 'rgba(126, 240, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(W * 0.1, barY, W * 0.8, barH);

    const stats = [
      ['ELIMS', String(game.eliminations)],
      ['SCORE', String(game.score)],
      ['BOARDS', String(diff().levels)]
    ];
    stats.forEach(function (stat, i) {
      const x = W * (0.1 + 0.8 * ((i + 0.5) / stats.length));
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold ' + Math.round(8 * UNIT) + 'px "Press Start 2P", monospace';
      ctx.fillStyle = 'rgba(180, 225, 255, 0.85)';
      ctx.fillText(stat[0], x, barY + barH * 0.36);
      ctx.font = 'bold ' + Math.round(14 * UNIT) + 'px "Press Start 2P", monospace';
      ctx.fillStyle = '#ffd447';
      ctx.fillText(stat[1], x, barY + barH * 0.8);
      ctx.restore();
    });

    bannerText(currentMap().name + '  -  ' + diff().name, H * 0.755, diff().color, 9);
    if (game.wins > 1) {
      bannerText('WIN #' + game.wins + ' HERE', H * 0.80, 'rgba(255,255,255,0.7)', 8);
    }
    bannerText('PRESS ENTER TO PLAY AGAIN', H * 0.88, '#ffd447', 10);
    if (game.difficulty !== 'extreme') {
      bannerText('1-3 TO TRY A HARDER MODE', H * 0.925, 'rgba(255,255,255,0.65)', 8);
    }

    // the champion, up top
    Sprites.drawPac(ctx, W / 2, H * 0.15, 46 * UNIT, 'right',
      Math.abs(Math.sin(game.frame * 0.09)));

    // one white flash as the screen lands
    if (game.winTimer < 0.35) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.75 * (1 - game.winTimer / 0.35)) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }


  /* ------------------------------------------------------------------ */
  /* SYSTEM RENDERING                                                    */
  /* ------------------------------------------------------------------ */
  function drawPowerUps() {
    if (game.state !== STATE.PLAY && game.state !== STATE.READY
      && game.state !== STATE.DYING) return;
    const pulse = 0.5 + 0.5 * Math.sin(game.frame * 0.16);
  }

  function drawBoss() {
    const b = game.boss;
    if (!b || !b.alive) return;
    const vulnerable = game.frightTimer > 0;
    const size = TILE * 2.4;
    const bob = Math.sin(b.anim * 5) * 2;

    // shadow and threat ring
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(b.x, b.y + size * 0.45, size * 0.42, size * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const mode = b.hitFlash > 0 && Math.floor(b.hitFlash * 20) % 2 === 0
      ? 'flash' : (vulnerable ? 'fright' : 'normal');
    Sprites.drawGhost(ctx, b.x, b.y + bob, size, '#b3241a',
      Math.floor(b.anim * 8) % 2, mode, b.dir, currentMap().skin);

    // crown, so it reads as the boss and not just a big enemy
    ctx.fillStyle = '#ffd447';
    const cw = size * 0.5;
    ctx.fillRect(b.x - cw / 2, b.y - size * 0.62 + bob, cw, size * 0.1);
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(b.x - cw / 2 + i * (cw / 2.4), b.y - size * 0.74 + bob, cw / 5, size * 0.14);
    }

    // health pips
    for (let i = 0; i < b.maxHp; i++) {
      ctx.fillStyle = i < b.hp ? '#ff5a5a' : 'rgba(255,255,255,0.25)';
      ctx.fillRect(b.x - size * 0.34 + i * (size * 0.25), b.y + size * 0.52 + bob,
        size * 0.18, size * 0.08);
    }
  }

  /** The LOW LIGHT event: darkness with a lamp around the burger. */
  function drawLowLight() {
    if ((!eventActive('dark') && !setbackActive('blinkers')) || game.state !== STATE.PLAY) return;
    const r = TILE * 5.2;
    const g = ctx.createRadialGradient(pac.x, pac.y, r * 0.35, pac.x, pac.y, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.93)');
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.93)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'destination-out';
    const hole = ctx.createRadialGradient(pac.x, pac.y, 0, pac.x, pac.y, r);
    hole.addColorStop(0, 'rgba(0,0,0,1)');
    hole.addColorStop(0.65, 'rgba(0,0,0,0.9)');
    hole.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hole;
    ctx.fillRect(pac.x - r, pac.y - r, r * 2, r * 2);
    ctx.restore();
  }

  /** Combo meter, active power-ups, event timer, bonus countdown. */
  function drawPlayOverlays() {
    if (game.state !== STATE.PLAY && game.state !== STATE.READY) {
      FX.drawOverlay();
      Achievements.draw(ctx, W, H, UNIT);
      return;
    }

    // --- combo, top left ---
    if (game.comboMult > 1 || game.combo >= 3) {
      const pulse = 0.5 + 0.5 * Math.sin(game.frame * 0.25);
      ctx.save();
      ctx.textAlign = 'left';
      ctx.font = 'bold ' + Math.round(10 * UNIT) + 'px "Press Start 2P", monospace';
      ctx.lineWidth = 4 * UNIT;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      const label = 'COMBO x' + game.comboMult;
      ctx.strokeText(label, TILE * 0.8, TILE * 1.6);
      ctx.fillStyle = game.comboMult >= 4 ? '#ff9ad5' : '#ffd447';
      ctx.globalAlpha = 0.75 + 0.25 * pulse;
      ctx.fillText(label, TILE * 0.8, TILE * 1.6);
      // the window ticking away
      ctx.globalAlpha = 1;
      const w = TILE * 4;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(TILE * 0.8, TILE * 1.85, w, 3);
      ctx.fillStyle = '#ff9ad5';
      ctx.fillRect(TILE * 0.8, TILE * 1.85, w * Math.max(0, game.comboTimer / COMBO_WINDOW), 3);
      ctx.restore();
    }

    // --- active power-ups, top right ---
    const keys = Object.keys(game.active);
    keys.forEach(function (key, i) {
      const def = powerDef(key);
      if (!def) return;
      const size = TILE * 1.1;
      const x = W - TILE * 0.55 - size - i * (size + 8);
      const y = TILE * 0.9;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - 3, y - 3, size + 6, size + 12);
      Sprites.drawPowerUpIcon(ctx, key, x, y, size);
      if (def.time > 0) {
        const k = Math.max(0, game.active[key] / def.time);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(x, y + size + 1, size, 3);
        ctx.fillStyle = def.color;
        ctx.fillRect(x, y + size + 1, size * k, 3);
      }
      ctx.restore();
    });

    // --- setbacks, under the power-ups ---
    Object.keys(game.setbacks).forEach(function (key, i) {
      let def = null;
      for (let k = 0; k < SETBACKS.length; k++) if (SETBACKS[k].key === key) def = SETBACKS[k];
      if (!def) return;
      const bw = TILE * 5.2, bh = TILE * 0.72;
      const x = W - TILE * 0.55 - bw;
      const y = TILE * 2.5 + i * (bh + 5);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(x, y, bw, bh);
      ctx.textAlign = 'left';
      ctx.font = 'bold ' + Math.round(6 * UNIT) + 'px "Press Start 2P", monospace';
      ctx.fillStyle = def.color;
      ctx.fillText(def.name, x + 5, y + bh * 0.62);
      const k2 = Math.max(0, game.setbacks[key] / def.time);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(x, y + bh - 3, bw, 3);
      ctx.fillStyle = def.color;
      ctx.fillRect(x, y + bh - 3, bw * k2, 3);
      ctx.restore();
    });

    // --- the countdown to the next question, bottom left ---
    if (window.Quiz && !game.bonusRound && !Quiz.active()) {
      const left = Math.max(0, game.quizTimer);
      const soon = left <= 5;
      ctx.save();
      ctx.textAlign = 'left';
      ctx.font = 'bold ' + Math.round(6 * UNIT) + 'px "Press Start 2P", monospace';
      ctx.fillStyle = soon ? '#ffd447' : 'rgba(180, 210, 205, 0.72)';
      ctx.fillText('QUESTION IN ' + Math.ceil(left), TILE * 0.8, H - TILE * 0.6);
      ctx.restore();
    }

    // --- the running event, centre top ---
    if (game.event) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold ' + Math.round(7 * UNIT) + 'px "Press Start 2P", monospace';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(W / 2 - TILE * 5, TILE * 0.55, TILE * 10, TILE * 0.95);
      ctx.fillStyle = game.event.def.color;
      ctx.fillText(game.event.def.title, W / 2, TILE * 1.05);
      const k = Math.max(0, game.event.time / game.event.def.time);
      ctx.fillRect(W / 2 - TILE * 4.6, TILE * 1.28, TILE * 9.2 * k, 3);
      ctx.restore();
    }

    // --- bonus round countdown ---
    if (game.bonusRound) {
      const left = Math.max(0, Math.ceil(game.bonusTimer));
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold ' + Math.round(20 * UNIT) + 'px "Press Start 2P", monospace';
      ctx.lineWidth = 5 * UNIT;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(String(left), W / 2, H * 0.14);
      ctx.fillStyle = left <= 5 ? '#ff5a5a' : '#7ee07a';
      ctx.fillText(String(left), W / 2, H * 0.14);
      ctx.font = 'bold ' + Math.round(8 * UNIT) + 'px "Press Start 2P", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(game.bonusCollected + ' / ' + game.bonusTotal, W / 2, H * 0.175);
      ctx.restore();
    }

    // --- boss warning bar ---
    if (game.boss && game.boss.alive) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold ' + Math.round(7 * UNIT) + 'px "Press Start 2P", monospace';
      ctx.fillStyle = game.frightTimer > 0 ? '#7ef0ff' : '#ff5a5a';
      ctx.fillText(game.frightTimer > 0 ? 'HIT IT NOW' : 'BOSS ACTIVE', W / 2, H - TILE * 0.6);
      ctx.restore();
    }

    FX.drawOverlay();
    Achievements.draw(ctx, W, H, UNIT);
  }

  /* ------------------------------------------------------------------ */
  /* HUD                                                                 */
  /* ------------------------------------------------------------------ */
  // spare lives are shown as reboot cards
  const lifeIconCache = (function () {
    const c = document.createElement('canvas');
    c.width = 30; c.height = 30;
    const cx = c.getContext('2d');
    Sprites.drawReboot(cx, 15, 15, 28);
    return c.toDataURL();
  })();

  /* The score counts up to its new value rather than snapping. It is driven
     from the frame loop, but only writes to the DOM when the rendered number
     actually changes, so it is not a per-frame DOM write. */
  let shownScore = 0;

  function tickScore(dt) {
    if (shownScore === game.score) return;
    if (reducedMotion) { shownScore = game.score; }
    else {
      const gap = game.score - shownScore;
      if (Math.abs(gap) < 2) shownScore = game.score;
      // ~12% of the gap per frame at 60fps, with a floor so big jumps land
      else shownScore += Math.sign(gap) * Math.max(1, Math.ceil(Math.abs(gap) * Math.min(1, dt * 7)));
    }
    hud.score.textContent = String(Math.max(0, shownScore)).padStart(6, '0');
    hud.score.classList.add('ticking');
  }

  function updateHud() {
    renderModeButtons();
    if (game.score < shownScore) shownScore = game.score;     // a reset or a new run
    hud.score.textContent = String(Math.max(0, shownScore)).padStart(6, '0');
    hud.high.textContent = String(game.high).padStart(6, '0');
    hud.level.textContent = game.level + '/' + diff().levels;
    // Draw at most a handful of icons and count the rest, so a long run of
    // extra lives can never push the HUD out of shape.
    const MAX_ICONS = 3;
    // On the menus, preview what the selected mode gives you rather than
    // whatever the last run ended on.
    const lives = Math.max(0, game.state === STATE.TITLE ? diff().lives : game.lives);
    hud.lives.innerHTML = '';
    for (let i = 0; i < Math.min(lives, MAX_ICONS); i++) {
      const img = document.createElement('img');
      img.src = lifeIconCache;
      img.alt = 'life';
      img.className = 'life';
      hud.lives.appendChild(img);
    }
    if (lives > MAX_ICONS) {
      const more = document.createElement('span');
      more.className = 'life-count';
      more.textContent = '\u00d7' + lives;
      hud.lives.appendChild(more);
    }
  }

  /** Compact buttons that cycle the map and mode, live only between runs. */
  function renderModeButtons() {
    const open = modeSelectable();
    if (hud.modeBtn) {
      const d = diff();
      hud.modeBtn.textContent = d.name;
      hud.modeBtn.style.setProperty('--mode-color', d.color);
      hud.modeBtn.disabled = !open;
      hud.modeBtn.title = open
        ? 'Click to change difficulty (or press 1, 2, 3)'
        : 'Finish this run to change difficulty';
    }
    if (hud.mapTitle) hud.mapTitle.textContent = currentMap().name;
    if (hud.mapBtn) {
      hud.mapBtn.textContent = currentMap().name;
      hud.mapBtn.disabled = !open;
      hud.mapBtn.title = open
        ? 'Click to change map (or press left and right)'
        : 'Finish this run to change map';
    }
  }

  function renderLootRow() {
    // the stat hides itself while empty rather than showing a bare label
    // the row keeps its space while empty, so the first llama shifts nothing
    hud.loot.style.visibility = game.lootHistory.length ? 'visible' : 'hidden';
    hud.loot.innerHTML = '';
    game.lootHistory.slice(-7).forEach(function (idx) {
      const c = document.createElement('canvas');
      c.width = 22; c.height = 22;
      const cx = c.getContext('2d');
      Sprites.drawLoot(cx, idx, 11, 11, 20);
      c.className = 'loot-icon';
      c.title = Sprites.LOOT[idx].name;
      hud.loot.appendChild(c);
    });
  }

  /* ------------------------------------------------------------------ */
  /* MAIN LOOP                                                           */
  /* ------------------------------------------------------------------ */
  let last = performance.now();

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;      // clamp after a tab switch
    game.frame++;
    // the menu has its own clock so its animation never depends on whether a
    // board is running behind it
    if (game.state === STATE.TITLE) {
      game.menuTime += dt;
      updateMenu(dt);
    }

    const quizUp = !!(window.Quiz && Quiz.active());
    if (window.Quiz) Quiz.tick(dt);
    if (!game.paused && !quizUp) {
      update(dt);
      FX.update(dt);
      Achievements.update(dt);
    }
    tickScore(dt);
    if (shownScore === game.score) hud.score.classList.remove('ticking');
    draw(dt);
    if (window.Quiz) Quiz.draw(ctx, W, H, UNIT);
    pollPads();
    requestAnimationFrame(frame);
  }

  function update(dt) {
    switch (game.state) {
      case STATE.READY:
        game.readyTimer -= dt;
        if (game.readyTimer <= 0) {
          game.state = STATE.PLAY;
          game.levelStart = performance.now();
          if (isBonusLevel(game.level) && !game.bonusRound) startBonusRound();
          else if (isBossLevel(game.level) && !game.boss) spawnBoss();
        }
        break;

      case STATE.PLAY:
        if (game.shieldGrace > 0) game.shieldGrace -= dt;
        if (game.newHighTimer > 0) game.newHighTimer -= dt;
        updateCombo(dt);
        updateModes(dt);
        updatePac(dt);
        updateMagnet();
        if (!game.bonusRound) {
          ghosts.forEach(function (g) { updateGhost(g, dt); });
          checkGhostCollisions();
          updateBoss(dt);
          updateEvents(dt);
        }
        updatePowerUps(dt);
        updateSetbacks(dt);
        updateQuizClock(dt);
        updateBonusRound(dt);
        checkSecrets();
        if (game.loot) {
          game.loot.life -= dt;
          if (game.loot.life <= 0) game.loot = null;
        }
        break;

      case STATE.DYING:
        game.deathTimer += dt;
        if (game.deathTimer > 2.0) loseLife();
        break;

      case STATE.LEVEL_CLEAR:
        game.flashTimer -= dt;
        if (game.flashTimer <= 0) nextLevel();
        break;

      case STATE.WIN:
        game.winTimer += dt;
        updateConfetti(dt);
        updateFireworks(dt);
        break;

      default:
        break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* INPUT                                                               */
  /* ------------------------------------------------------------------ */
  const KEY_DIRS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right'
  };

  function queueDir(dir) {
    pac.next = dir;
    pac.nextTtl = NEXT_TTL;
  }

  function setDir(dir) {
    queueDir(dir);
    Sound.unlock();
  }

  /* ---- held directions ------------------------------------------------
     A joystick is held, not tapped. JoyToKey turns a tilt into a real key
     press and a real release, so tracking what is still down lets a held
     turn stay queued instead of ageing out, and lets a diagonal push resolve
     to the way that is actually open rather than to whichever of the two
     keys happened to arrive last. */
  const held = { up: false, down: false, left: false, right: false };

  function clearHeld() {
    held.up = held.down = held.left = held.right = false;
  }

  function resolveHeld() {
    const on = [];
    for (const d in held) if (held[d]) on.push(d);
    if (on.length < 2) return on[0] || null;
    // a diagonal: take whichever way is open here, so pushing up-right at a
    // corner turns up the moment up exists rather than a tile later
    const tx = tileOf(pac.x), ty = tileOf(pac.y);
    for (let i = 0; i < on.length; i++) {
      if (on[i] === pac.dir) continue;
      const v = DIRS[on[i]];
      if (v && !isWallFor(tx + v.x, ty + v.y, null)) return on[i];
    }
    // nothing open yet: keep the turn pending rather than cancelling it, so
    // a diagonal push still takes the corner as soon as one appears
    for (let i = 0; i < on.length; i++) if (on[i] !== pac.dir) return on[i];
    return on[0];
  }

  /** Re-assert a held direction every frame so it never expires mid-push. */
  function applyHeld() {
    const d = resolveHeld();
    if (d) queueDir(d);
  }

  const MODE_KEYS = { Digit1: 'easy', Digit2: 'hard', Digit3: 'extreme',
    Numpad1: 'easy', Numpad2: 'hard', Numpad3: 'extreme' };

  const QUIZ_PICK = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3,
    Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 };

  window.addEventListener('keydown', function (e) {
    menu.audioReady = true;
    // the sign-in overlay owns the keyboard while it is showing
    if (window.Leaderboard && Leaderboard.isOpen()) return;
    // a question owns the keyboard while it is up
    if (window.Quiz && Quiz.active()) {
      e.preventDefault();
      if (e.code === 'ArrowUp' || e.code === 'KeyW') Quiz.move(-1);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') Quiz.move(1);
      else if (QUIZ_PICK[e.code] !== undefined) Quiz.pick(QUIZ_PICK[e.code]);
      else if (e.code === 'Enter' || e.code === 'Space') Quiz.confirm();
      return;
    }
    if (MODE_KEYS[e.code] && modeSelectable()) {
      e.preventDefault();
      setDifficulty(MODE_KEYS[e.code]);
      return;
    }
    // on the menus the arrow keys choose the map and the mode - there is
    // nothing to steer yet
    if (modeSelectable() && KEY_DIRS[e.code]) {
      e.preventDefault();
      const dir = KEY_DIRS[e.code];
      if (dir === 'left') cycleMap(-1);
      else if (dir === 'right') cycleMap(1);
      else if (dir === 'up') cycleDifficulty(-1);
      else cycleDifficulty(1);
      return;
    }
    if (KEY_DIRS[e.code]) {
      e.preventDefault();
      held[KEY_DIRS[e.code]] = true;
      setDir(KEY_DIRS[e.code]);
      return;
    }
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      if (modeSelectable()) startGame();
      else togglePause();
      return;
    }
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'KeyM') toggleMute();
    if (e.code === 'KeyF') toggleFullscreen();
  });

  window.addEventListener('keyup', function (e) {
    if (KEY_DIRS[e.code]) held[KEY_DIRS[e.code]] = false;
  });


  // alt-tabbing away swallows the release, which would wedge the stick on
  window.addEventListener('blur', clearHeld);

  function togglePause() {
    if (game.state !== STATE.PLAY) return;
    game.paused = !game.paused;
    hud.pause.textContent = game.paused ? 'Resume' : 'Pause';
    hud.pause.dataset.state = game.paused ? 'paused' : '';
    if (!game.paused) last = performance.now();
  }

  function toggleMute() {
    const m = Sound.toggleMute();
    hud.mute.textContent = m ? 'Sound off' : 'Sound on';
    hud.mute.dataset.state = m ? 'off' : '';
  }

  function toggleFullscreen() {
    const root = document.documentElement;
    if (!document.fullscreenElement) {
      const req = root.requestFullscreen || root.webkitRequestFullscreen;
      if (req) req.call(root);
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    }
  }

  document.addEventListener('fullscreenchange', function () {
    hud.full.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
    if (window.Layout) window.Layout.fit();
  });

  if (hud.full) {
    if (!document.documentElement.requestFullscreen && !document.documentElement.webkitRequestFullscreen) {
      hud.full.style.display = 'none';    // unsupported, e.g. iPhone Safari
    }
    hud.full.addEventListener('click', toggleFullscreen);
  }

  hud.pause.addEventListener('click', function () {
    if (modeSelectable()) startGame();
    else togglePause();
  });
  hud.mute.addEventListener('click', toggleMute);

  if (hud.modeBtn) {
    hud.modeBtn.addEventListener('click', function () {
      if (!modeSelectable()) return;
      cycleDifficulty(1);
    });
  }

  if (hud.mapBtn) {
    hud.mapBtn.addEventListener('click', function () {
      if (!modeSelectable()) return;
      cycleMap(1);
    });
  }

  // touch: swipe anywhere plus an on-screen pad
  let touchStart = null;
  canvas.addEventListener('touchstart', function (e) {
    const t = e.changedTouches[0];
    Sound.unlock();
    menu.audioReady = true;
    if (game.state === STATE.TITLE) {
      // a tap on the menu means the thing under it, not "start". Stopping
      // the default also stops the browser faking a mouse click afterwards,
      // which would otherwise fire the same choice twice.
      e.preventDefault();
      const p = canvasPoint(t);
      const id = hitRegion(p.x, p.y);
      if (id) activateMenu(id);
      return;
    }
    touchStart = { x: t.clientX, y: t.clientY };
    if (modeSelectable()) startGame();
  }, { passive: false });

  canvas.addEventListener('touchend', function (e) {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
    setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    touchStart = null;
  }, { passive: true });

  Array.prototype.forEach.call(document.querySelectorAll('[data-dir]'), function (btn) {
    const fire = function (e) {
      e.preventDefault();
      setDir(btn.getAttribute('data-dir'));
    };
    btn.addEventListener('touchstart', fire, { passive: false });
    btn.addEventListener('mousedown', fire);
  });

  /* The menu answers the mouse: hover lights things up, and a click counts
     only if the button goes up over the same thing it went down on. */
  const menuPt = { x: 0, y: 0 };
  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    menuPt.x = (e.clientX - r.left) * W / r.width;
    menuPt.y = (e.clientY - r.top) * H / r.height;
    return menuPt;
  }

  function activateMenu(id) {
    if (id === 'play') startGame();
    else if (id === 'map-prev') cycleMap(-1);
    else if (id === 'map-next') cycleMap(1);
    else if (id === 'signin') { if (window.Leaderboard) Leaderboard.open(); }
    else if (id.indexOf('mode:') === 0) setDifficulty(id.slice(5));
  }

  canvas.addEventListener('mousemove', function (e) {
    if (game.state !== STATE.TITLE) {
      if (menu.hover) { menu.hover = null; canvas.style.cursor = ''; }
      return;
    }
    const p = canvasPoint(e);
    menu.tx = p.x / W * 2 - 1;
    menu.ty = p.y / H * 2 - 1;
    const id = hitRegion(p.x, p.y);
    if (id === menu.hover) return;
    menu.hover = id;
    const clickable = !!id && id.indexOf('ach:') !== 0;
    canvas.style.cursor = clickable ? 'pointer' : '';
    if (clickable && menu.audioReady) Sound.hover();
  });

  canvas.addEventListener('mouseleave', function () {
    menu.hover = null; menu.pressed = null;
    menu.tx = 0; menu.ty = 0;
    canvas.style.cursor = '';
  });

  canvas.addEventListener('mousedown', function (e) {
    Sound.unlock();
    menu.audioReady = true;
    if (game.state === STATE.TITLE) {
      const p = canvasPoint(e);
      menu.pressed = hitRegion(p.x, p.y);
      return;
    }
    if (modeSelectable()) startGame();
  });

  window.addEventListener('mouseup', function (e) {
    if (!menu.pressed) return;
    const id = menu.pressed;
    menu.pressed = null;
    if (game.state !== STATE.TITLE) return;
    const p = canvasPoint(e);
    if (hitRegion(p.x, p.y) === id) activateMenu(id);
  });

  /* ------------------------------------------------------------------ */
  /* GAMEPAD                                                             */
  /* ------------------------------------------------------------------ */
  /* Read a stick directly as well, so a pad works on its own without
     JoyToKey in between. Both paths end up dispatching the same key events,
     so the menus, the mode picker and the pause key all behave identically
     whichever one the player is using - and if both are running at once the
     two just agree with each other. */
  const PAD_ON = 0.55;             // tilt that counts as a push...
  const PAD_OFF = 0.35;            // ...and the smaller one that releases it,
                                   // so a stick resting on the line cannot chatter
  const PAD_BUTTONS = {            // standard layout
    0: 'Enter', 9: 'Enter',        // A / Start
    1: 'KeyP',                     // B      - pause
    2: 'KeyM',                     // X      - sound
    3: 'KeyF'                      // Y      - full screen
  };
  const PAD_DPAD = {               // hat reported as buttons
    12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight'
  };
  const padDown = {};              // key codes this pad is currently holding

  function padKey(code, down) {
    if (!!padDown[code] === down) return;          // only on a change
    padDown[code] = down;
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup',
      { code: code, bubbles: true }));
  }

  // a push has to pass PAD_ON to start but only falls back below PAD_OFF to
  // stop, so a stick resting near the line cannot chatter
  function axisOn(code, towards) {
    return padDown[code] ? towards > PAD_OFF : towards > PAD_ON;
  }

  function pollPads() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let pad = null;
    for (let i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
    }
    if (!pad) {                                    // unplugged mid-push
      for (const code in padDown) padKey(code, false);
      return;
    }
    const ax = pad.axes || [], btn = pad.buttons || [];
    // the left stick, or the right one when that is the one being pushed
    const x = Math.abs(ax[2] || 0) > Math.abs(ax[0] || 0) ? (ax[2] || 0) : (ax[0] || 0);
    const y = Math.abs(ax[3] || 0) > Math.abs(ax[1] || 0) ? (ax[3] || 0) : (ax[1] || 0);

    // stick and hat both feed the same four keys, so decide each one once
    const want = {
      ArrowLeft: axisOn('ArrowLeft', -x),
      ArrowRight: axisOn('ArrowRight', x),
      ArrowUp: axisOn('ArrowUp', -y),
      ArrowDown: axisOn('ArrowDown', y)
    };
    for (const i in PAD_DPAD) {
      if (btn[i] && btn[i].pressed) want[PAD_DPAD[i]] = true;
    }
    for (const i in PAD_BUTTONS) {
      const code = PAD_BUTTONS[i];
      want[code] = want[code] || !!(btn[i] && btn[i].pressed);
    }
    for (const code in want) padKey(code, want[code]);
  }

  /* ------------------------------------------------------------------ */
  /* BOOT                                                                */
  /* ------------------------------------------------------------------ */
  FX.init(ctx, W, H, UNIT);
  game.high = storedHigh(game.mapKey, game.difficulty);
  if (window.Backdrop) Backdrop.setTheme(currentMap().theme);
  loadLevel(true);
  updateHud();
  renderModeButtons();
  renderLootRow();
  requestAnimationFrame(frame);

  if (window.Leaderboard) {
    Leaderboard.init(function () {
      // the board is ranked per map and mode, so tell it which is showing
      Leaderboard.setScope(game.mapKey, game.difficulty,
        currentMap().name + ' / ' + diff().name);
    });
  }

  // exposed for the smoke test / debugging in the console
  window.__game = { menu: menu, game: game, pac: pac, ghosts: ghosts, startGame: startGame, STATE: STATE, TILE: TILE, updateHud: updateHud, setDifficulty: setDifficulty, setMap: setMap, DIFFICULTIES: DIFFICULTIES };
})();
