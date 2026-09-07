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
  const TILE = 16;                       // pixels per tile
  const W = Maze.COLS * TILE;            // 448
  const H = Maze.ROWS * TILE;            // 496
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
    mute: document.getElementById('mute-btn'),
    pause: document.getElementById('pause-btn')
  };

  /* ------------------------------------------------------------------ */
  /* GAME STATE                                                          */
  /* ------------------------------------------------------------------ */
  const game = {
    state: STATE.TITLE,
    grid: null,
    board: null,
    pelletsLeft: 0,
    pelletsTotal: 0,
    dotsEaten: 0,
    score: 0,
    high: Number(localStorage.getItem('tt-burger-high') || 0),
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
        chooser(e, tx, ty);
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
    const parsed = Maze.parse();
    game.grid = parsed.grid;
    game.pelletsTotal = parsed.pelletCount;
    game.pelletsLeft = parsed.pelletCount;
    game.board = Renderer.buildBoard(game.grid, TILE);
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

  function startGame() {
    game.score = 0;
    game.level = 1;
    game.lives = 3;
    game.extraAwarded = false;
    game.popups = [];
    loadLevel(true);
    game.state = STATE.READY;
    game.readyTimer = 2.4;
    Sound.unlock();
    Sound.start();
    updateHud();
  }

  function nextLevel() {
    game.level++;
    loadLevel(false);
    game.state = STATE.READY;
    game.readyTimer = 1.8;
    updateHud();
  }

  function loseLife() {
    game.lives--;
    updateHud();
    if (game.lives <= 0) {
      game.state = STATE.GAME_OVER;
      Sound.gameOver();
      if (game.score > game.high) {
        game.high = game.score;
        localStorage.setItem('tt-burger-high', String(game.high));
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
    return BASE * f;
  }

  function ghostSpeed(g) {
    const l = game.level;
    if (g.state === 'eaten') return BASE * 2.0;
    if (g.state === 'leaving' || g.state === 'entering') return BASE * 0.55;
    let f = l === 1 ? 0.75 : (l < 5 ? 0.85 : 0.95);
    if (g.frightened) f = l === 1 ? 0.50 : (l < 5 ? 0.55 : 0.60);
    // slow crawl through the tunnel
    const ty = tileOf(g.y);
    const tx = tileOf(g.x);
    if (ty === Maze.TUNNEL_ROW && (tx <= 5 || tx >= Maze.COLS - 6)) f *= 0.55;
    return BASE * f;
  }

  function frightDuration() {
    return FRIGHT_TIME[Math.min(game.level - 1, FRIGHT_TIME.length - 1)];
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
      chooseHomewardDir(g, tx, ty);
      return;
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

    // eaten ghosts head back to the door, then drop inside
    if (g.state === 'eaten') {
      const doorX = centerOf(13), doorY = centerOf(11);
      if (Math.abs(g.x - doorX) < 1 && Math.abs(g.y - doorY) < 1) {
        g.x = doorX; g.y = doorY;
        g.state = 'entering';
        return;
      }
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
    game.score += n;
    if (!game.extraAwarded && game.score >= 10000) {
      game.extraAwarded = true;
      game.lives++;
      Sound.extraLife();
    }
    if (game.score > game.high) {
      game.high = game.score;
      localStorage.setItem('tt-burger-high', String(game.high));
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
      game.modeTimer += dt;
      if (game.modeTimer >= entry.time) {
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
      if (game.dotsEaten >= g.def.dotLimit || game.releaseTimer > 4) {
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
          Sprites.drawCoin(ctx, centerOf(x), centerOf(y), 7);
        } else if (t === T.POWER) {
          Sprites.drawPotion(ctx, centerOf(x), centerOf(y), 14, pulse);
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
      ctx.font = 'bold 11px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y - (1.1 - p.life) * 16);
      ctx.restore();
      return true;
    });
  }

  function bannerText(text, y, color, size) {
    ctx.save();
    ctx.font = 'bold ' + (size || 16) + 'px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
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
    } else if (game.state !== STATE.LEVEL_CLEAR && game.state !== STATE.TITLE) {
      drawGhosts();
      drawPac();
    }

    drawPopups(dt);

    // ------- overlays -------
    if (game.state === STATE.READY) {
      bannerText('READY!', centerOf(17) + 6, '#ffd447', 16);
    }
    if (game.state === STATE.GAME_OVER) {
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(0, 0, W, H);
      bannerText('GAME OVER', H / 2 - 26, '#ff5a5a', 22);
      bannerText('SCORE ' + game.score, H / 2 + 6, '#ffffff', 12);
      bannerText('PRESS ENTER', H / 2 + 40, '#ffd447', 12);
    }
    if (game.state === STATE.TITLE) {
      ctx.fillStyle = 'rgba(0,0,0,0.68)';
      ctx.fillRect(0, 0, W, H);
      bannerText('TILTED TOWERS', 130, '#ffd447', 20);
      bannerText('BURGER MUNCH', 162, '#ff9ad5', 20);
      Sprites.drawPac(ctx, W / 2 - 60, 230, 34, 'right', Math.abs(Math.sin(game.frame * 0.08)));
      Sprites.drawGhost(ctx, W / 2 + 10, 230, 30, '#e8412f', Math.floor(game.frame / 8) % 2, 'normal', 'left');
      Sprites.drawGhost(ctx, W / 2 + 60, 230, 30, '#3fd8e8', Math.floor(game.frame / 8) % 2, 'normal', 'left');
      bannerText('ARROWS / WASD TO MOVE', 300, '#ffffff', 10);
      bannerText('PRESS ENTER TO DROP IN', 330, '#7ef0ff', 12);
    }
    if (game.paused && game.state === STATE.PLAY) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      bannerText('PAUSED', H / 2, '#ffffff', 20);
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
    hud.score.textContent = String(game.score).padStart(6, '0');
    hud.high.textContent = String(game.high).padStart(6, '0');
    hud.level.textContent = String(game.level);
    hud.lives.innerHTML = '';
    for (let i = 0; i < Math.max(0, game.lives - (game.state === STATE.GAME_OVER ? 0 : 0)); i++) {
      const img = document.createElement('img');
      img.src = lifeIconCache;
      img.alt = 'life';
      img.className = 'life';
      hud.lives.appendChild(img);
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

  window.addEventListener('keydown', function (e) {
    if (KEY_DIRS[e.code]) {
      e.preventDefault();
      setDir(KEY_DIRS[e.code]);
      return;
    }
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      if (game.state === STATE.TITLE || game.state === STATE.GAME_OVER) startGame();
      else togglePause();
      return;
    }
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'KeyM') toggleMute();
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

  hud.pause.addEventListener('click', function () {
    if (game.state === STATE.TITLE || game.state === STATE.GAME_OVER) startGame();
    else togglePause();
  });
  hud.mute.addEventListener('click', toggleMute);

  // touch: swipe anywhere plus an on-screen pad
  let touchStart = null;
  canvas.addEventListener('touchstart', function (e) {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
    if (game.state === STATE.TITLE || game.state === STATE.GAME_OVER) startGame();
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
    if (game.state === STATE.TITLE || game.state === STATE.GAME_OVER) startGame();
  });

  /* ------------------------------------------------------------------ */
  /* BOOT                                                                */
  /* ------------------------------------------------------------------ */
  loadLevel(true);
  updateHud();
  renderLootRow();
  requestAnimationFrame(frame);

  // exposed for the smoke test / debugging in the console
  window.__game = { game: game, pac: pac, ghosts: ghosts, startGame: startGame, STATE: STATE };
})();
