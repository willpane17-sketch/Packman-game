/* ==========================================================================
   render.js - paints the Tilted Towers board.
   The static parts of the map (buildings, roads, grass, river) are rendered
   once into an offscreen canvas; the game loop only redraws the pick-ups
   and the characters on top of it.
   ========================================================================== */
(function (global) {
  'use strict';

  const T = Maze.TILE;

  /**
   * Deterministic pseudo-random, so the map looks identical every run.
   * Math.imul and unsigned shifts matter here: with a plain `*` the
   * intermediate leaves int32 range and the result never exceeds 0.5, which
   * silently switches off every detail gated above that.
   */
  function hash(x, y, salt) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)
      ^ Math.imul(salt | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
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

  const ROOFS = ['#a8aeb6', '#b96a4e', '#4e8f8a', '#c9b48a', '#98a0aa', '#8a6250', '#d6dbe0'];

  /**
   * Group the wall tiles into buildings and give each one a single roof
   * colour. Colouring tile by tile leaves one building looking like a patchy
   * quilt; a building is a building.
   */
  function roofColors(grid) {
    const label = [];
    for (let y = 0; y < Maze.ROWS; y++) label.push(new Array(Maze.COLS).fill(null));
    let next = 0;
    for (let y = 0; y < Maze.ROWS; y++) {
      for (let x = 0; x < Maze.COLS; x++) {
        if (label[y][x] !== null) continue;
        if (grid[y][x] !== T.WALL || isBorder(x, y)) continue;
        const color = ROOFS[Math.floor(hash(x, y, 77) * ROOFS.length) % ROOFS.length];
        const stack = [[x, y]];
        label[y][x] = color;
        while (stack.length) {
          const cur = stack.pop();
          [[1,0],[-1,0],[0,1],[0,-1]].forEach(function (d) {
            const nx = cur[0] + d[0], ny = cur[1] + d[1];
            if (nx < 0 || ny < 0 || nx >= Maze.COLS || ny >= Maze.ROWS) return;
            if (label[ny][nx] !== null) return;
            if (grid[ny][nx] !== T.WALL || isBorder(nx, ny)) return;
            label[ny][nx] = color;
            stack.push([nx, ny]);
          });
        }
        next++;
      }
    }
    return label;
  }

  function drawBuildingTile(ctx, grid, x, y, ts, gx, gy, roof) {
    const base = hash(gx, gy, 7);
    // Tilted Towers is not all grey concrete: terracotta, teal and sand
    // roofs break the block up the way the real POI does.
    ctx.fillStyle = roof || '#a8aeb6';
    ctx.fillRect(x, y, ts, ts);

    // concrete speckle
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(x + Math.floor(base * (ts - 3)), y + Math.floor(hash(gx, gy, 8) * (ts - 3)), 2, 2);

    // windows - only on tiles that are "inside" a building mass so the
    // silhouette of the block stays readable
    if (hash(gx, gy, 11) > 0.3) {
      const lit = hash(gx, gy, 12) > 0.55;
      ctx.fillStyle = lit ? 'rgba(255,214,120,0.95)' : 'rgba(96,150,190,0.85)';
      const w = Math.max(3, Math.floor(ts * 0.28));
      const h = Math.max(3, Math.floor(ts * 0.34));
      ctx.fillRect(x + Math.floor(ts * 0.18), y + Math.floor(ts * 0.22), w, h);
      if (ts >= 14 && hash(gx, gy, 13) > 0.5) {
        ctx.fillRect(x + Math.floor(ts * 0.56), y + Math.floor(ts * 0.22), w, h);
      }
    }

    // rooftop clutter: water tanks, vents, dishes, the odd roof garden
    const prop = hash(gx, gy, 31);
    if (prop > 0.93) {                       // water tank
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x + ts * 0.3 + 2, y + ts * 0.3 + 2, ts * 0.4, ts * 0.4);
      ctx.fillStyle = '#7d5a3a';
      ctx.fillRect(x + ts * 0.3, y + ts * 0.3, ts * 0.4, ts * 0.4);
      ctx.fillStyle = '#a8794f';
      ctx.fillRect(x + ts * 0.3, y + ts * 0.3, ts * 0.4, ts * 0.14);
    } else if (prop > 0.87) {                // roof garden
      ctx.fillStyle = '#4d7f35';
      ctx.fillRect(x + ts * 0.22, y + ts * 0.25, ts * 0.55, ts * 0.45);
      ctx.fillStyle = '#69a047';
      ctx.fillRect(x + ts * 0.3, y + ts * 0.32, ts * 0.2, ts * 0.2);
    } else if (prop > 0.82) {                // satellite dish
      ctx.fillStyle = 'rgba(235,238,242,0.95)';
      ctx.beginPath();
      ctx.arc(x + ts * 0.5, y + ts * 0.5, ts * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(80,88,96,0.9)';
      ctx.fillRect(x + ts * 0.47, y + ts * 0.3, 2, ts * 0.25);
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
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(x, y, ts, ts);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
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
    ctx.fillStyle = 'rgba(248,236,170,0.28)';
    if (horiz && !vert) ctx.fillRect(x + ts * 0.15, y + ts / 2, ts * 0.7, 1.5);
    if (vert && !horiz) ctx.fillRect(x + ts / 2, y + ts * 0.15, 1.5, ts * 0.7);

    // painted street markings
    const paint = hash(gx, gy, 45);
    if (paint > 0.955 && horiz && !vert) {          // zebra crossing
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 4; i++) ctx.fillRect(x + 2 + i * ts * 0.25, y + 3, ts * 0.12, ts - 6);
    } else if (paint > 0.93 && vert && !horiz) {    // lane arrow
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x + ts * 0.46, y + ts * 0.35, 2, ts * 0.3);
      ctx.fillRect(x + ts * 0.38, y + ts * 0.42, ts * 0.22, 2);
    }

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

  const DIRT = ['#3a2717', '#43301c', '#33220f', '#4a361f', '#2d1e11'];

  function drawCraterFloorTile(ctx, grid, x, y, ts, gx, gy) {
    const depth = craterDepth(gx, gy);
    const p = craterPolar(gx, gy);

    // Base dirt: paler and dustier in the middle where the ground is churned,
    // darker and wetter towards the rim.
    const base = depth < 0.35 ? '#584022' : DIRT[Math.floor(hash(gx, gy, 5) * DIRT.length)];
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

    // Concrete pads under the research site, with site clutter on them.
    if (isFacility(gx, gy)) {
      ctx.fillStyle = 'rgba(186,192,198,0.16)';
      ctx.fillRect(x, y, ts, ts);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x, y, ts, 1);
      const kit = hash(gx, gy, 52);
      if (kit > 0.93) {                         // barrels
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x + ts * 0.3 + 2, y + ts * 0.32 + 2, ts * 0.3, ts * 0.36);
        ctx.fillStyle = '#c8a12c';
        ctx.fillRect(x + ts * 0.3, y + ts * 0.32, ts * 0.3, ts * 0.36);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(x + ts * 0.3, y + ts * 0.4, ts * 0.3, 1.5);
      } else if (kit > 0.86) {                  // survey marker
        ctx.fillStyle = '#e8532e';
        ctx.fillRect(x + ts * 0.45, y + ts * 0.28, 2, ts * 0.42);
        ctx.fillStyle = '#ffd447';
        ctx.fillRect(x + ts * 0.45, y + ts * 0.28, ts * 0.22, ts * 0.14);
      }
    }

    // The odd meteor fragment, still glowing.
    if (hash(gx, gy, 61) > 0.94) {
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
    const tones = ['#c08d55', '#ad7d4a', '#cf9a5f', '#9c7044'];
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

    const roofs = theme === 'crater' ? null : roofColors(grid);

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
            drawBuildingTile(ctx, grid, x, y, ts, gx, gy, roofs[gy][gx]);
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
