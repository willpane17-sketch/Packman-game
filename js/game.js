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
      color: '#7ee07a',
      blurb: '5 LIVES - SLOW ENEMIES - LOTS OF POWER-UPS',
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
      powerEvery: 9,      // seconds between power-up spawns
      powerMax: 3,        // how many can sit on the board at once
      eventEvery: 26      // seconds between random events
    },
    hard: {
      key: 'hard',
      name: 'HARD',
      color: '#ffd447',
      blurb: '3 LIVES - FAST, AGGRESSIVE - DOUBLE SCORE',
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
      powerEvery: 16,
      powerMax: 2,
      eventEvery: 20
    },
    extreme: {
      key: 'extreme',
      name: 'EXTREME',
      color: '#ff5a5a',
      blurb: '1 LIFE - OUTRUNS YOU - EVENTS EVERY FEW SECONDS',
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
      powerEvery: 26,
      powerMax: 1,
      eventEvery: 13
    }
  };

  const DIFFICULTY_ORDER = ['easy', 'hard', 'extreme'];
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
    // --- run tallies, shown on the end screens ---
    tally: { pellets: 0, enemies: 0, powerups: 0, combo: 0, boss: 0, secret: 0, level: 0 },
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
    powerTimer: 0,
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
    frame: 0
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
   */
  function step(e, dist, chooser) {
    let remaining = dist;
    let guard = 0;
    while (remaining > 0.0001 && guard++ < 4096) {
      const s = Math.min(remaining, 1);
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
    game.powerTimer = diff().powerEvery * 0.6;
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
    pac.x = centerOf(13) + TILE / 2;   // starts on the seam, like the original
    pac.y = centerOf(23);
    pac.dir = 'left';
    pac.next = 'left';
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
  function setDifficulty(key) {
    if (!DIFFICULTIES[key] || key === game.difficulty) return;
    game.difficulty = key;
    localStorage.setItem('tt-burger-mode', key);
    game.high = storedHigh(game.mapKey, key);
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
    game.score = 0;
    game.level = 1;
    game.lives = diff().lives;
    game.eliminations = 0;
    game.combo = 0;
    game.comboMult = 1;
    game.comboBest = 0;
    game.pickups = 0;
    game.secrets = 0;
    game.bosses = 0;
    game.newHigh = false;
    game.tally = { pellets: 0, enemies: 0, powerups: 0, combo: 0, boss: 0, secret: 0, level: 0 };
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
    updateHud();
    renderModeButtons();
  }

  function loseLife() {
    game.lives--;
    updateHud();
    if (game.lives <= 0) {
      game.state = STATE.GAME_OVER;
      Sound.gameOver();
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

  function updatePac(dt) {
    // an instant U-turn is allowed anywhere, not just on a tile centre
    if (pac.next === OPPOSITE[pac.dir]) {
      const tx = tileOf(pac.x), ty = tileOf(pac.y);
      const d = DIRS[pac.next];
      if (!isWallFor(tx + d.x, ty + d.y, null)) pac.dir = pac.next;
    }
    step(pac, pacSpeed() * dt, choosePacDir);
    if (pac.moving) pac.mouth = (pac.mouth + dt * 11) % (Math.PI * 2);

    eatTile();
    checkLoot();
  }

  const COMBO_WINDOW = 2.4;        // seconds to keep the chain alive
  const COMBO_MAX = 8;

  /** Every pick-up extends the chain; ten in a row raises the multiplier. */
  function bumpCombo(x, y) {
    game.combo++;
    game.comboTimer = COMBO_WINDOW;
    if (game.combo > game.comboBest) game.comboBest = game.combo;
    const mult = Math.min(COMBO_MAX, 1 + Math.floor(game.combo / 10));
    if (mult !== game.comboMult) {
      game.comboMult = mult;
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
    const pulse = 0.5 + 0.5 * Math.sin(game.frame * 0.12);
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
    if (game.state === STATE.TITLE) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      // the map has its own name in the picker below, so the headline is
      // just the game
      bannerText('BURGER MUNCH', H * 0.135, '#ffd447', 20);
      const demoY = H * 0.235;
      Sprites.drawPac(ctx, W / 2 - 60 * UNIT, demoY, 34 * UNIT, 'right', Math.abs(Math.sin(game.frame * 0.08)));
      Sprites.drawGhost(ctx, W / 2 + 10 * UNIT, demoY, 30 * UNIT, '#e8412f',
        Math.floor(game.frame / 8) % 2, 'normal', 'left', currentMap().skin);
      Sprites.drawGhost(ctx, W / 2 + 60 * UNIT, demoY, 30 * UNIT, '#3fd8e8',
        Math.floor(game.frame / 8) % 2, 'normal', 'left', currentMap().skin);
      drawMapPicker(H * 0.355);
      drawModeMenu(H * 0.47);
      drawAchievementRow(H * 0.775);
      bannerText('LEFT/RIGHT MAP   UP/DOWN OR 1-3 MODE', H * 0.845, '#ffffff', 8);
      bannerText('PRESS ENTER TO DROP IN', H * 0.9, '#7ef0ff', 12);
    }
    if (game.paused && game.state === STATE.PLAY) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      bannerText('PAUSED', H / 2, '#ffffff', 20);
    }
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

  /** A free floor tile a sensible distance from the burger. */
  function randomFloorTile(minTilesFromPac) {
    const ptx = tileOf(pac.x), pty = tileOf(pac.y);
    for (let tries = 0; tries < 200; tries++) {
      const x = 1 + Math.floor(Math.random() * (Maze.COLS - 2));
      const y = 1 + Math.floor(Math.random() * (Maze.ROWS - 2));
      const t = game.grid[y][x];
      if (t !== T.PELLET && t !== T.FLOOR) continue;
      if (y >= 11 && y <= 17 && x >= 9 && x <= 18) continue;      // not in the house
      if (distance(x, y, ptx, pty) < (minTilesFromPac || 5)) continue;
      if (game.powerups.some(function (p) { return p.tx === x && p.ty === y; })) continue;
      return { x: x, y: y };
    }
    return null;
  }

  function spawnPowerUp() {
    const spot = randomFloorTile(6);
    if (!spot) return;
    const def = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
    game.powerups.push({
      key: def.key, tx: spot.x, ty: spot.y,
      x: centerOf(spot.x), y: centerOf(spot.y), life: 13
    });
    FX.ring(centerOf(spot.x), centerOf(spot.y), def.color, TILE * 1.6, 0.5, 2);
  }

  function updatePowerUps(dt) {
    // spawn timer, paced by difficulty
    game.powerTimer -= dt;
    if (game.powerTimer <= 0) {
      game.powerTimer = diff().powerEvery * (0.75 + Math.random() * 0.6);
      if (game.powerups.length < diff().powerMax && !game.bonusRound) spawnPowerUp();
    }

    for (let i = game.powerups.length - 1; i >= 0; i--) {
      const p = game.powerups[i];
      p.life -= dt;
      if (p.life <= 0) { game.powerups.splice(i, 1); continue; }
      if (distance(pac.x, pac.y, p.x, p.y) < TILE * 0.8) {
        game.powerups.splice(i, 1);
        collectPowerUp(p);
      }
    }

    // tick down whatever is running
    Object.keys(game.active).forEach(function (key) {
      if (key === 'shield') return;                     // held until it is used
      game.active[key] -= dt;
      if (game.active[key] <= 0) delete game.active[key];
    });
  }

  function collectPowerUp(p) {
    const def = powerDef(p.key);
    game.pickups++;
    bumpCombo(p.x, p.y);
    addScore(250, 'powerups', { x: p.x, y: p.y, color: def.color });
    FX.burst(p.x, p.y, [def.color, '#ffffff'], { count: 18, speed: 130, size: 3 });
    FX.ring(p.x, p.y, def.color, TILE * 3, 0.45, 3);
    FX.float(p.x, p.y - TILE * 1.4, def.name, def.color, { size: 8, life: 1.4 });
    Sound.powerUp();

    if (p.key === 'shock') {
      triggerShockwave();
      return;
    }
    if (p.key === 'shield') {
      game.active.shield = 1;                            // a flag, not a timer
      Sound.shield();
      return;
    }
    game.active[p.key] = def.time;
    if (p.key === 'freeze') {
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

  function closeShiftPassages() {
    if (!game.shiftTiles || !game.shiftTiles.length) return;
    const occupied = [pac].concat(ghosts).map(function (e) {
      return tileOf(e.x) + ',' + tileOf(e.y);
    });
    game.shiftTiles = game.shiftTiles.filter(function (t) {
      if (occupied.indexOf(t.x + ',' + t.y) >= 0) return true;     // try again later
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
      combo: game.comboBest >= 10 ? Math.floor(game.comboBest / 10) * 10 : 0,
      bosses: game.bosses,
      secrets: game.secrets,
      noHit: extra && extra.noHit,
      clearTime: extra && extra.clearTime,
      wonExtreme: extra && extra.wonExtreme
    };
    // the 10X COMBO badge is about the multiplier, not the raw chain
    stats.combo = game.comboMult >= 10 ? 10 : (Math.min(COMBO_MAX, 1 + Math.floor(game.comboBest / 10)) >= 8 ? 10 : 0);
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

  /** A row of pips on the title screen: one per achievement, lit when earned. */
  function drawAchievementRow(y) {
    const list = Achievements.LIST;
    const pip = TILE * 0.55;
    const gap = TILE * 0.3;
    const total = list.length * pip + (list.length - 1) * gap;
    let x = W / 2 - total / 2;
    bannerText('ACHIEVEMENTS  ' + Achievements.earnedCount() + '/' + Achievements.total,
      y - TILE * 0.55, 'rgba(255,255,255,0.75)', 7);
    list.forEach(function (def) {
      const got = Achievements.has(def.id);
      ctx.fillStyle = got ? def.icon : 'rgba(255,255,255,0.14)';
      ctx.fillRect(x, y, pip, pip);
      if (got) {
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.fillRect(x, y, pip, 2);
      }
      x += pip + gap;
    });
  }

  /** The map selector: arrows either side of the current map's name. */
  function drawMapPicker(y) {
    const map = currentMap();
    bannerText('MAP', y - H * 0.035, '#ffffff', 9);
    const blink = Math.floor(game.frame / 18) % 2 === 0;
    bannerText((blink ? '< ' : '  ') + map.name + (blink ? ' >' : '  '), y, '#ffd447', 15);
    bannerText(map.blurb, y + H * 0.032, 'rgba(255,255,255,0.72)', 7);
  }

  /** The three difficulty rows, with the selected one called out. */
  function drawModeMenu(top) {
    bannerText('MODE', top, '#ffffff', 9);
    DIFFICULTY_ORDER.forEach(function (key, i) {
      const d = DIFFICULTIES[key];
      const y = top + (0.055 + i * 0.055) * H;
      const on = key === game.difficulty;
      const blink = on && Math.floor(game.frame / 18) % 2 === 0;
      bannerText((blink ? '> ' : '  ') + d.name + (blink ? ' <' : '  '),
        y, on ? d.color : 'rgba(255,255,255,0.35)', on ? 16 : 12);
    });
    const sel = diff();
    bannerText(sel.blurb, top + 0.215 * H, sel.color, 7);
    if (sel.scoreMul > 1) {
      bannerText('SCORE x' + sel.scoreMul, top + 0.255 * H, '#ffd447', 8);
    }
  }


  /* ------------------------------------------------------------------ */
  /* SYSTEM RENDERING                                                    */
  /* ------------------------------------------------------------------ */
  function drawPowerUps() {
    if (game.state !== STATE.PLAY && game.state !== STATE.READY
      && game.state !== STATE.DYING) return;
    const pulse = 0.5 + 0.5 * Math.sin(game.frame * 0.16);
    game.powerups.forEach(function (p) {
      const bob = Math.sin(game.frame * 0.11 + p.tx) * TILE * 0.09;
      // blink out as it is about to expire
      if (p.life < 3 && Math.floor(p.life * 6) % 2 === 0) return;
      Sprites.drawPowerUp(ctx, p.key, p.x, p.y + bob, TILE * 1.15, pulse);
    });
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
    if (!eventActive('dark') || game.state !== STATE.PLAY) return;
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

  function updateHud() {
    renderModeButtons();
    hud.score.textContent = String(game.score).padStart(6, '0');
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

    if (!game.paused) {
      update(dt);
      FX.update(dt);
      Achievements.update(dt);
    }
    draw(dt);
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

  function setDir(dir) {
    pac.next = dir;
    Sound.unlock();
  }

  const MODE_KEYS = { Digit1: 'easy', Digit2: 'hard', Digit3: 'extreme',
    Numpad1: 'easy', Numpad2: 'hard', Numpad3: 'extreme' };

  window.addEventListener('keydown', function (e) {
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

  function togglePause() {
    if (game.state !== STATE.PLAY) return;
    game.paused = !game.paused;
    hud.pause.textContent = game.paused ? '▶ Resume' : '⏸ Pause';
    if (!game.paused) last = performance.now();
  }

  function toggleMute() {
    const m = Sound.toggleMute();
    hud.mute.textContent = m ? '🔇 Sound off' : '🔊 Sound on';
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
    hud.full.textContent = document.fullscreenElement ? '⛶ Exit full screen' : '⛶ Full screen';
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
    touchStart = { x: t.clientX, y: t.clientY };
    if (modeSelectable()) startGame();
  }, { passive: true });

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

  canvas.addEventListener('mousedown', function () {
    Sound.unlock();
    if (modeSelectable()) startGame();
  });

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

  // exposed for the smoke test / debugging in the console
  window.__game = { game: game, pac: pac, ghosts: ghosts, startGame: startGame, STATE: STATE, TILE: TILE, updateHud: updateHud, setDifficulty: setDifficulty, setMap: setMap, DIFFICULTIES: DIFFICULTIES };
})();
