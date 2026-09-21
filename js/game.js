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
      blurb: '5 LIVES - SLOW JONESYS - LONG POTIONS',
      lives: 5,
      levels: 5,          // clear this many boards to win the run
      pac: 1.06,          // scales the burger's speed curve
      ghost: 0.78,        // scales the ghosts' speed curve
      fright: 2.0,        // scales how long a shield potion lasts
      frightFloor: 7,     // ...and never less than this many seconds
      release: 2,         // scales the house dot counters (ghosts come out later)
      stall: 7,           // seconds of no pick-ups before a ghost is forced out
      scatter: 1.7,       // scales the scatter phases (more time not being hunted)
      extraLife: 8000,
      scoreMul: 1
    },
    hard: {
      key: 'hard',
      name: 'HARD',
      color: '#ffd447',
      blurb: 'ARCADE RULES - 3 LIVES - DOUBLE SCORE',
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
      scoreMul: 2
    },
    extreme: {
      key: 'extreme',
      name: 'EXTREME',
      color: '#ff5a5a',
      blurb: '1 LIFE - FASTER THAN YOU - ALL FOUR HUNT AT ONCE',
      lives: 1,
      levels: 3,
      pac: 1,
      ghost: 1.18,        // the Jonesys out-run the burger
      fright: 0.45,
      frightFloor: 0,
      release: 0,         // everyone leaves the house immediately
      stall: 1,
      scatter: 0.35,      // barely any respite from the chase
      extraLife: 25000,
      scoreMul: 4
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
    if (t === T.WALL) return true;
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
    game.board = Renderer.buildBoard(game.grid, TILE, currentMap().theme);
    computeHomeDistances();
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
    spawnConfetti();
    Sound.victory();
    if (game.score > game.high) {
      game.high = game.score;
      localStorage.setItem(highKey(game.mapKey, diff().key), String(game.high));
    }
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
    return BASE * f * diff().pac;
  }

  function ghostSpeed(g) {
    const l = game.level;
    if (g.state === 'eaten') return BASE * 2.0;
    if (g.state === 'leaving' || g.state === 'entering') return BASE * 0.55;
    let f = l === 1 ? 0.75 : (l < 5 ? 0.85 : 0.95);
    if (g.frightened) f = l === 1 ? 0.50 : (l < 5 ? 0.55 : 0.60);
    f *= diff().ghost;
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
        // faithful to the original, including the "up" overflow quirk
        let tx = p.x + d.x * 4;
        let ty = p.y + d.y * 4;
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
        const dist = distance(tileOf(g.x), tileOf(g.y), p.x, p.y);
        return dist > 8 ? p : g.def.scatter;
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

  function addScore(n) {
    const d = diff();
    game.score += n * d.scoreMul;
    if (!game.extraAwarded && game.score >= d.extraLife) {
      game.extraAwarded = true;
      game.lives++;
      Sound.extraLife();
    }
    if (game.score > game.high) {
      game.high = game.score;
      localStorage.setItem(highKey(game.mapKey, d.key), String(game.high));
    }
    updateHud();
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

    if (t === T.PELLET) {
      addScore(10);
      Sound.waka();
    } else {
      addScore(50);
      Sound.power();
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

    if (game.pelletsLeft <= 0) {
      game.state = STATE.LEVEL_CLEAR;
      game.flashTimer = 2.2;
      Sound.levelUp();
    }
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
      else Sound.siren(Math.min(game.level, 8) + (game.frightTimer > 0 ? 6 : 0));
    }
  }

  function checkGhostCollisions() {
    ghosts.forEach(function (g) {
      if (g.state === 'eaten' || g.state === 'entering' || g.state === 'house') return;
      if (distance(pac.x, pac.y, g.x, g.y) > TILE * 0.72) return;

      if (g.frightened) {
        game.ghostsEaten++;
        const points = 200 * Math.pow(2, Math.min(game.ghostsEaten, 4) - 1);
        addScore(points);
        popup(g.x, g.y, points, '#7ef0ff');
        Sound.eatGhost();
        g.frightened = false;
        g.state = 'eaten';
      } else {
        game.state = STATE.DYING;
        game.deathTimer = 0;
        Sound.death();
      }
    });
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
          Sprites.drawCoin(ctx, centerOf(x), centerOf(y), TILE * 0.44);
        } else if (t === T.POWER) {
          Sprites.drawPotion(ctx, centerOf(x), centerOf(y), TILE * 0.875, pulse);
        }
      }
    }
  }

  function drawGhosts() {
    ghosts.forEach(function (g) {
      let mode = 'normal';
      if (g.state === 'eaten') mode = 'eaten';
      else if (g.frightened) {
        const flashing = game.frightTimer < 2 && Math.floor(game.frightTimer * 6) % 2 === 0;
        mode = flashing ? 'flash' : 'fright';
      }
      Sprites.drawGhost(ctx, g.x, g.y, TILE * 1.15, g.color, g.frame, mode, g.dir);
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

    if (game.loot && game.state === STATE.PLAY) {
      const bounce = Math.sin(game.frame * 0.1) * 1.5;
      Sprites.drawLoot(ctx, game.loot.index, game.loot.x, game.loot.y + bounce, TILE * 1.3);
    }

    if (game.state === STATE.DYING) {
      Sprites.drawPacDeath(ctx, pac.x, pac.y, TILE * 1.35, Math.min(1, game.deathTimer / 1.3));
    } else if (game.state !== STATE.LEVEL_CLEAR && game.state !== STATE.TITLE
      && game.state !== STATE.WIN) {
      drawGhosts();
      drawPac();
    }

    drawPopups(dt);

    // ------- overlays -------
    if (game.state === STATE.READY) {
      bannerText('READY!', centerOf(17) + 6 * UNIT, diff().color, 16);
    }
    if (game.state === STATE.WIN) drawVictory();

    if (game.state === STATE.GAME_OVER) {
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(0, 0, W, H);
      bannerText('GAME OVER', H / 2 - 46 * UNIT, '#ff5a5a', 22);
      bannerText('SCORE ' + game.score, H / 2 - 14 * UNIT, '#ffffff', 12);
      bannerText(diff().name + ' MODE', H / 2 + 12 * UNIT, diff().color, 10);
      bannerText('PRESS ENTER TO PLAY AGAIN', H / 2 + 42 * UNIT, '#ffd447', 10);
      bannerText('1-3 TO CHANGE MODE', H / 2 + 66 * UNIT, 'rgba(255,255,255,0.65)', 9);
    }
    if (game.state === STATE.TITLE) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      // the map has its own name in the picker below, so the headline is
      // just the game
      bannerText('BURGER MUNCH', H * 0.135, '#ffd447', 20);
      const demoY = H * 0.235;
      Sprites.drawPac(ctx, W / 2 - 60 * UNIT, demoY, 34 * UNIT, 'right', Math.abs(Math.sin(game.frame * 0.08)));
      Sprites.drawGhost(ctx, W / 2 + 10 * UNIT, demoY, 30 * UNIT, '#e8412f', Math.floor(game.frame / 8) % 2, 'normal', 'left');
      Sprites.drawGhost(ctx, W / 2 + 60 * UNIT, demoY, 30 * UNIT, '#3fd8e8', Math.floor(game.frame / 8) % 2, 'normal', 'left');
      drawMapPicker(H * 0.355);
      drawModeMenu(H * 0.47);
      bannerText('LEFT/RIGHT MAP   UP/DOWN OR 1-3 MODE', H * 0.83, '#ffffff', 8);
      bannerText('PRESS ENTER TO DROP IN', H * 0.89, '#7ef0ff', 12);
    }
    if (game.paused && game.state === STATE.PLAY) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      bannerText('PAUSED', H / 2, '#ffffff', 20);
    }
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
    ctx.fillStyle = 'rgba(4, 10, 18, 0.78)';
    ctx.fillRect(0, 0, W, H);
    drawConfetti();

    const pop = Math.min(1, game.winTimer / 0.5);
    const ease = 1 - Math.pow(1 - pop, 3);

    // the banner slides in from the left and settles
    ctx.save();
    ctx.globalAlpha = ease;
    ctx.translate(-(1 - ease) * W * 0.5, 0);
    if (victoryArtReady) {
      const bw = W * 0.88;
      const bh = bw * (victoryArt.height / victoryArt.width);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(victoryArt, W / 2 - bw / 2, H * 0.40 - bh / 2, bw, bh);
      ctx.imageSmoothingEnabled = false;
    } else {
      Sprites.drawVictoryBanner(ctx, W / 2, H * 0.42, W * 0.74,
        '"Press Start 2P", monospace', game.frame * 0.004);
    }
    ctx.restore();

    const y = H * 0.60;
    bannerText(diff().name + ' MODE CLEARED', y, diff().color, 11);
    bannerText('ALL ' + diff().levels + ' BOARDS', y + H * 0.05, '#ffffff', 10);
    bannerText('SCORE ' + game.score, y + H * 0.105, '#ffd447', 14);
    if (game.wins > 1) {
      bannerText('WIN #' + game.wins + ' ON THIS MODE', y + H * 0.15, 'rgba(255,255,255,0.7)', 8);
    }
    bannerText('PRESS ENTER TO PLAY AGAIN', H * 0.86, '#ffd447', 10);
    if (game.difficulty !== 'extreme') {
      bannerText('1-3 TO TRY A HARDER MODE', H * 0.91, 'rgba(255,255,255,0.65)', 8);
    }

    // the champion burger, front and centre
    Sprites.drawPac(ctx, W / 2, H * 0.17, 46 * UNIT, 'right',
      Math.abs(Math.sin(game.frame * 0.09)));
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
  /* HUD                                                                 */
  /* ------------------------------------------------------------------ */
  const lifeIconCache = (function () {
    const c = document.createElement('canvas');
    c.width = 26; c.height = 30;
    const cx = c.getContext('2d');
    Sprites.drawPac(cx, 13, 15, 22, 'right', 0.8);
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

    if (!game.paused) update(dt);
    draw(dt);
    requestAnimationFrame(frame);
  }

  function update(dt) {
    switch (game.state) {
      case STATE.READY:
        game.readyTimer -= dt;
        if (game.readyTimer <= 0) game.state = STATE.PLAY;
        break;

      case STATE.PLAY:
        updateModes(dt);
        updatePac(dt);
        ghosts.forEach(function (g) { updateGhost(g, dt); });
        checkGhostCollisions();
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
