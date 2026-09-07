/* ==========================================================================
   render.js - paints the Tilted Towers board.
   The static parts of the map (buildings, roads, grass, river) are rendered
   once into an offscreen canvas; the game loop only redraws the pick-ups
   and the characters on top of it.
   ========================================================================== */
(function (global) {
  'use strict';

  const T = Maze.TILE;

  // Deterministic pseudo-random so the city looks identical every run.
  function hash(x, y, salt) {
    let h = x * 374761393 + y * 668265263 + (salt || 0) * 2246822519;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }

  function isWall(grid, x, y) {
    if (x < 0 || x >= Maze.COLS || y < 0 || y >= Maze.ROWS) return true;
    return grid[y][x] === T.WALL;
  }

  function isBorder(x, y) {
    return x === 0 || x === Maze.COLS - 1 || y === 0 || y === Maze.ROWS - 1;
  }

  function drawGrassTile(ctx, x, y, ts, gx, gy) {
    const g = ctx.createLinearGradient(x, y, x, y + ts);
    g.addColorStop(0, '#4e7d34');
    g.addColorStop(1, '#3d6529');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, ts, ts);
    // scattered tufts
    for (let i = 0; i < 3; i++) {
      const r = hash(gx, gy, i + 1);
      const r2 = hash(gx, gy, i + 9);
      ctx.fillStyle = r > 0.5 ? '#5b8f3c' : '#376022';
      ctx.fillRect(x + Math.floor(r * (ts - 2)), y + Math.floor(r2 * (ts - 2)), 2, 2);
    }
    // an occasional tree
    if (hash(gx, gy, 42) > 0.78) {
      const cx = x + ts / 2;
      const cy = y + ts / 2;
      ctx.fillStyle = '#2c4f1d';
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3f7029';
      ctx.beginPath();
      ctx.arc(cx - ts * 0.07, cy - ts * 0.07, ts * 0.26, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRiverTile(ctx, x, y, ts, gx, gy) {
    const g = ctx.createLinearGradient(x, y, x + ts, y + ts);
    g.addColorStop(0, '#2f7fa8');
    g.addColorStop(1, '#215f80');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, ts, ts);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    const off = Math.floor(hash(gx, gy, 3) * (ts - 4));
    ctx.fillRect(x + 2, y + off, ts - 6, 1);
  }

  function drawBuildingTile(ctx, grid, x, y, ts, gx, gy) {
    const base = hash(gx, gy, 7);
    const shades = ['#8b9199', '#7b818a', '#949aa2', '#6d737c'];
    const wall = shades[Math.floor(base * shades.length) % shades.length];
    ctx.fillStyle = wall;
    ctx.fillRect(x, y, ts, ts);

    // concrete speckle
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(x + Math.floor(base * (ts - 3)), y + Math.floor(hash(gx, gy, 8) * (ts - 3)), 2, 2);

    // windows - only on tiles that are "inside" a building mass so the
    // silhouette of the block stays readable
    if (hash(gx, gy, 11) > 0.35) {
      const lit = hash(gx, gy, 12) > 0.72;
      ctx.fillStyle = lit ? 'rgba(255,208,110,0.9)' : 'rgba(30,36,46,0.9)';
      const w = Math.max(3, Math.floor(ts * 0.28));
      const h = Math.max(3, Math.floor(ts * 0.34));
      ctx.fillRect(x + Math.floor(ts * 0.18), y + Math.floor(ts * 0.22), w, h);
      if (ts >= 14 && hash(gx, gy, 13) > 0.5) {
        ctx.fillRect(x + Math.floor(ts * 0.56), y + Math.floor(ts * 0.22), w, h);
      }
    }

    // roof / shadow edges depending on neighbours
    const up = isWall(grid, gx, gy - 1);
    const down = isWall(grid, gx, gy + 1);
    const left = isWall(grid, gx - 1, gy);
    const right = isWall(grid, gx + 1, gy);
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    if (!up) ctx.fillRect(x, y, ts, 2);
    if (!left) ctx.fillRect(x, y, 2, ts);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    if (!down) ctx.fillRect(x, y + ts - 2, ts, 2);
    if (!right) ctx.fillRect(x + ts - 2, y, 2, ts);
  }

  function drawRoadTile(ctx, grid, x, y, ts, gx, gy) {
    ctx.fillStyle = '#2f3238';
    ctx.fillRect(x, y, ts, ts);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, y, ts, 1);
    // kerbs where the road meets a building
    ctx.fillStyle = 'rgba(210,214,220,0.18)';
    if (isWall(grid, gx, gy - 1)) ctx.fillRect(x, y, ts, 1);
    if (isWall(grid, gx, gy + 1)) ctx.fillRect(x, y + ts - 1, ts, 1);
    if (isWall(grid, gx - 1, gy)) ctx.fillRect(x, y, 1, ts);
    if (isWall(grid, gx + 1, gy)) ctx.fillRect(x + ts - 1, y, 1, ts);

    // faint lane markings down long straight corridors
    const horiz = !isWall(grid, gx - 1, gy) && !isWall(grid, gx + 1, gy);
    const vert = !isWall(grid, gx, gy - 1) && !isWall(grid, gx, gy + 1);
    ctx.fillStyle = 'rgba(240,230,180,0.14)';
    if (horiz && !vert) ctx.fillRect(x + ts * 0.15, y + ts / 2, ts * 0.7, 1);
    if (vert && !horiz) ctx.fillRect(x + ts / 2, y + ts * 0.15, 1, ts * 0.7);

    // scattered kerb / manhole detail
    if (hash(gx, gy, 21) > 0.94) {
      ctx.fillStyle = 'rgba(120,124,132,0.5)';
      ctx.fillRect(x + ts * 0.3, y + ts * 0.35, ts * 0.4, ts * 0.3);
    }
  }

  function drawDoorTile(ctx, x, y, ts) {
    ctx.fillStyle = '#2f3238';
    ctx.fillRect(x, y, ts, ts);
    const g = ctx.createLinearGradient(x, y, x, y + ts);
    g.addColorStop(0, '#ffb0d8');
    g.addColorStop(1, '#e0559f');
    ctx.fillStyle = g;
    ctx.fillRect(x, y + ts * 0.35, ts, ts * 0.3);
  }

  /**
   * Build the static board image.
   * @returns {HTMLCanvasElement}
   */
  function buildBoard(grid, ts) {
    const c = document.createElement('canvas');
    c.width = Maze.COLS * ts;
    c.height = Maze.ROWS * ts;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    for (let gy = 0; gy < Maze.ROWS; gy++) {
      for (let gx = 0; gx < Maze.COLS; gx++) {
        const x = gx * ts;
        const y = gy * ts;
        const tile = grid[gy][gx];
        if (tile === T.WALL) {
          if (isBorder(gx, gy)) {
            // dress the outer ring as the landscape around the city
            if (gx >= Maze.COLS - 1) drawRiverTile(ctx, x, y, ts, gx, gy);
            else drawGrassTile(ctx, x, y, ts, gx, gy);
          } else {
            drawBuildingTile(ctx, grid, x, y, ts, gx, gy);
          }
        } else if (tile === T.DOOR) {
          drawDoorTile(ctx, x, y, ts);
        } else {
          drawRoadTile(ctx, grid, x, y, ts, gx, gy);
        }
      }
    }

    // the tunnel mouths open onto grass, so blend them out
    ctx.fillStyle = '#2f3238';
    ctx.fillRect(0, Maze.TUNNEL_ROW * ts, ts, ts);
    ctx.fillRect((Maze.COLS - 1) * ts, Maze.TUNNEL_ROW * ts, ts, ts);

    return c;
  }

  global.Renderer = { buildBoard: buildBoard };
})(window);
