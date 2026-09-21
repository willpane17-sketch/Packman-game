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

  function drawDoorTile(ctx, x, y, ts, crater) {
    ctx.fillStyle = crater ? '#6b4e33' : '#2f3238';
    ctx.fillRect(x, y, ts, ts);
    const g = ctx.createLinearGradient(x, y, x, y + ts);
    g.addColorStop(0, '#ffb0d8');
    g.addColorStop(1, '#e0559f');
    ctx.fillStyle = g;
    ctx.fillRect(x, y + ts * 0.35, ts, ts * 0.3);
  }


  /* ------------------------------------------------------------------ */
  /* DUSTY DIVOT                                                         */
  /* The meteor crater: scorched dirt thrown outwards in streaks, raised */
  /* earth banks for walls, and the research site at the centre.         */
  /* ------------------------------------------------------------------ */

  const CENTER = { x: 13.5, y: 15 };

  function craterPolar(gx, gy) {
    const dx = gx + 0.5 - CENTER.x;
    const dy = (gy + 0.5 - CENTER.y) * 1.08;      // the crater is a touch oval
    return { r: Math.sqrt(dx * dx + dy * dy), a: Math.atan2(dy, dx) };
  }

  /** How far out of the crater a tile is: 0 at the centre, 1 past the rim. */
  function craterDepth(gx, gy) {
    const p = craterPolar(gx, gy);
    // a ragged rim, so the crater does not read as a circle
    const rim = 13.2 + Math.sin(p.a * 7) * 1.4 + Math.sin(p.a * 3 + 1.2) * 1.9;
    return Math.min(1, p.r / rim);
  }

  function isFacility(gx, gy) {
    return Math.abs(gx - CENTER.x) <= 5.5 && Math.abs(gy - CENTER.y) <= 4.5;
  }

  const DIRT = ['#2b1d12', '#332417', '#241811', '#3a2a1a', '#1f1610'];

  function drawCraterFloorTile(ctx, grid, x, y, ts, gx, gy) {
    const depth = craterDepth(gx, gy);
    const p = craterPolar(gx, gy);

    // Base dirt: paler and dustier in the middle where the ground is churned,
    // darker and wetter towards the rim.
    const base = depth < 0.35 ? '#3d2c1b' : DIRT[Math.floor(hash(gx, gy, 5) * DIRT.length)];
    ctx.fillStyle = base;
    ctx.fillRect(x, y, ts, ts);

    // Radial blast streaks thrown out from the impact.
    const streak = Math.sin(p.a * 26) * 0.5 + 0.5;
    if (streak > 0.58) {
      ctx.fillStyle = 'rgba(0,0,0,' + (0.10 + 0.26 * (streak - 0.58) / 0.42) + ')';
      ctx.fillRect(x, y, ts, ts);
    } else if (streak < 0.24) {
      ctx.fillStyle = 'rgba(200,158,105,' + (0.10 + 0.16 * (0.24 - streak) / 0.24) + ')';
      ctx.fillRect(x, y, ts, ts);
    }
    // a scoured line running straight out from the impact point
    const spoke = Math.abs(Math.sin(p.a * 13));
    if (spoke > 0.93 && p.r > 2) {
      ctx.fillStyle = 'rgba(214,176,124,0.16)';
      ctx.fillRect(x, y, ts, ts);
    }

    // Dust and gravel.
    for (let i = 0; i < 2; i++) {
      const r1 = hash(gx, gy, 30 + i), r2 = hash(gx, gy, 40 + i);
      ctx.fillStyle = r1 > 0.5 ? 'rgba(255,225,180,0.16)' : 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + Math.floor(r1 * (ts - 3)), y + Math.floor(r2 * (ts - 3)), 2, 2);
    }

    // Concrete pads under the research site.
    if (isFacility(gx, gy)) {
      ctx.fillStyle = 'rgba(180,186,192,0.12)';
      ctx.fillRect(x, y, ts, ts);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x, y, ts, 1);
    }

    // The odd meteor fragment, still glowing.
    if (hash(gx, gy, 61) > 0.965) {
      const cx = x + ts * 0.5, cy = y + ts * 0.55;
      ctx.fillStyle = 'rgba(120,200,255,0.30)';
      ctx.beginPath(); ctx.arc(cx, cy, ts * 0.30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3b4652';
      ctx.fillRect(cx - ts * 0.16, cy - ts * 0.14, ts * 0.32, ts * 0.26);
      ctx.fillStyle = '#9fe4ff';
      ctx.fillRect(cx - ts * 0.06, cy - ts * 0.06, ts * 0.12, ts * 0.10);
    }
  }

  function drawCraterWallTile(ctx, grid, x, y, ts, gx, gy) {
    const up = isWall(grid, gx, gy - 1);
    const down = isWall(grid, gx, gy + 1);
    const left = isWall(grid, gx - 1, gy);
    const right = isWall(grid, gx + 1, gy);

    if (isFacility(gx, gy)) {
      // research buildings: pale prefab panels with lit windows
      const shades = ['#d3d8dc', '#c2c8ce', '#e0e4e7', '#b4bbc2'];
      ctx.fillStyle = shades[Math.floor(hash(gx, gy, 9) * shades.length)];
      ctx.fillRect(x, y, ts, ts);
      if (hash(gx, gy, 14) > 0.45) {
        ctx.fillStyle = hash(gx, gy, 15) > 0.55 ? 'rgba(120,205,255,0.85)' : 'rgba(58,70,84,0.85)';
        ctx.fillRect(x + Math.floor(ts * 0.22), y + Math.floor(ts * 0.26),
          Math.max(3, Math.floor(ts * 0.3)), Math.max(3, Math.floor(ts * 0.3)));
      }
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      if (!up) ctx.fillRect(x, y, ts, 2);
      if (!left) ctx.fillRect(x, y, 2, ts);
      ctx.fillStyle = 'rgba(20,30,40,0.45)';
      if (!down) ctx.fillRect(x, y + ts - 2, ts, 2);
      if (!right) ctx.fillRect(x + ts - 2, y, 2, ts);
      return;
    }

    // raised banks of earth thrown up by the impact
    const tones = ['#a97c4e', '#9a6f45', '#b98a58', '#8d6440'];
    ctx.fillStyle = tones[Math.floor(hash(gx, gy, 7) * tones.length)];
    ctx.fillRect(x, y, ts, ts);

    // rocks and roots
    for (let i = 0; i < 2; i++) {
      const r1 = hash(gx, gy, 70 + i), r2 = hash(gx, gy, 80 + i);
      if (r1 > 0.55) {
        ctx.fillStyle = r2 > 0.5 ? '#c79c69' : '#6b4a2c';
        ctx.fillRect(x + Math.floor(r1 * (ts - 4)), y + Math.floor(r2 * (ts - 4)), 3, 2);
      }
    }

    // sunlit crest and shadowed foot, so the banks read as raised ground
    ctx.fillStyle = 'rgba(255,232,190,0.55)';
    if (!up) ctx.fillRect(x, y, ts, 2);
    if (!left) ctx.fillRect(x, y, 2, ts);
    ctx.fillStyle = 'rgba(20,10,4,0.62)';
    if (!down) ctx.fillRect(x, y + ts - 2, ts, 2);
    if (!right) ctx.fillRect(x + ts - 2, y, 2, ts);

    // grass clinging on outside the blast radius
    // only the banks out past the rim keep their grass
    if (craterDepth(gx, gy) > 1.08) {
      ctx.fillStyle = 'rgba(84,134,56,0.6)';
      ctx.fillRect(x, y, ts, Math.max(2, ts * 0.26));
      ctx.fillStyle = 'rgba(64,108,42,0.5)';
      ctx.fillRect(x + ts * 0.5, y, 2, Math.max(2, ts * 0.4));
    }
  }

  /**
   * Build the static board image.
   * @param {string} theme 'city' (Tilted Towers) or 'crater' (Dusty Divot)
   * @returns {HTMLCanvasElement}
   */
  function buildBoard(grid, ts, theme) {
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
        const crater = theme === 'crater';
        if (tile === T.WALL) {
          if (isBorder(gx, gy)) {
            // the landscape the map sits in, around the outer ring
            if (!crater && gx >= Maze.COLS - 1) drawRiverTile(ctx, x, y, ts, gx, gy);
            else drawGrassTile(ctx, x, y, ts, gx, gy);
          } else if (crater) {
            drawCraterWallTile(ctx, grid, x, y, ts, gx, gy);
          } else {
            drawBuildingTile(ctx, grid, x, y, ts, gx, gy);
          }
        } else if (tile === T.DOOR) {
          drawDoorTile(ctx, x, y, ts, crater);
        } else if (crater) {
          drawCraterFloorTile(ctx, grid, x, y, ts, gx, gy);
        } else {
          drawRoadTile(ctx, grid, x, y, ts, gx, gy);
        }
      }
    }

    // the tunnel mouths open onto the landscape, so blend them out
    const mouths = [0, (Maze.COLS - 1) * ts];
    mouths.forEach(function (mx) {
      if (theme === 'crater') {
        drawCraterFloorTile(ctx, grid, mx, Maze.TUNNEL_ROW * ts, ts,
          mx ? Maze.COLS - 1 : 0, Maze.TUNNEL_ROW);
      } else {
        ctx.fillStyle = '#2f3238';
        ctx.fillRect(mx, Maze.TUNNEL_ROW * ts, ts, ts);
      }
    });

    return c;
  }

  global.Renderer = { buildBoard: buildBoard };
})(window);
