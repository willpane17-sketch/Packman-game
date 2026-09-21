/* ==========================================================================
   maze.js - the playable maps and tile helpers.
   Every map is the same 28 x 31 arcade grid so the ghost logic, the tunnel
   and the burger's start tile line up; what changes is the layout around
   that skeleton and the theme the renderer paints it with.
   Legend:
     #  wall        .  pellet      o  power pellet
     -  ghost house door           ' ' empty floor
   ========================================================================== */
(function (global) {
  'use strict';

  const COLS = 28;
  const ROWS = 31;

  const MAPS = [
    {
      key: 'tilted',
      name: 'TILTED TOWERS',
      theme: 'city',
      blurb: 'CONCRETE TOWERS, ROADS AND THE RIVER',
      rows: [
      '############################',
      '#............##............#',
      '#.####.#####.##.#####.####.#',
      '#o####.#####.##.#####.####o#',
      '#.####.#####.##.#####.####.#',
      '#..........................#',
      '#.####.##.########.##.####.#',
      '#.####.##.########.##.####.#',
      '#......##....##....##......#',
      '######.##### ## #####.######',
      '######.##### ## #####.######',
      '######.##          ##.######',
      '######.## ###--### ##.######',
      '######.## #      # ##.######',
      '      .   #      #   .      ',
      '######.## #      # ##.######',
      '######.## ######## ##.######',
      '######.##          ##.######',
      '######.## ######## ##.######',
      '######.## ######## ##.######',
      '#............##............#',
      '#.####.#####.##.#####.####.#',
      '#.####.#####.##.#####.####.#',
      '#o..##.......  .......##..o#',
      '###.##.##.########.##.##.###',
      '###.##.##.########.##.##.###',
      '#......##....##....##......#',
      '#.##########.##.##########.#',
      '#.##########.##.##########.#',
      '#..........................#',
      '############################'
      ]
    },
    {
      key: 'divot',
      name: 'DUSTY DIVOT',
      theme: 'crater',
      blurb: 'THE METEOR CRATER AND ITS RESEARCH SITE',
      rows: [
      '############################',
      '#............##............#',
      '#.###.####.#.##.#.####.###.#',
      '#o###.####.#.##.#.####.###o#',
      '#.###.####.#.##.#.####.###.#',
      '#..........................#',
      '#.##.##.##.#.##.#.##.##.##.#',
      '#.##.##.##.#.##.#.##.##.##.#',
      '#..........#.##.#..........#',
      '###.##.##### ## #####.##.###',
      '###.##.##### ## #####.##.###',
      '###.##.##          ##.##.###',
      '###.##.## ###--### ##.##.###',
      '###.##.## #      # ##.##.###',
      '      .   #      #   .      ',
      '###.##.## #      # ##.##.###',
      '###.##.## ######## ##.##.###',
      '###.##.##          ##.##.###',
      '###.##.## ######## ##.##.###',
      '###.##.## ######## ##.##.###',
      '#..........######..........#',
      '#.##.##.##.######.##.##.##.#',
      '#.##.##.##.######.##.##.##.#',
      '#o..........    ..........o#',
      '#.##.##.##.######.##.##.##.#',
      '#.##.##.##.######.##.##.##.#',
      '#..........................#',
      '#.###.####.#.##.#.####.###.#',
      '#.###.####.#.##.#.####.###.#',
      '#............##............#',
      '############################'
      ]
    }
  ];

  const TILE = {
    WALL: 0,
    FLOOR: 1,
    PELLET: 2,
    POWER: 3,
    DOOR: 4
  };

  // Tiles ghosts are not allowed to turn upward on (the classic red zones).
  const NO_UP_TILES = [
    { x: 12, y: 11 }, { x: 15, y: 11 },
    { x: 12, y: 23 }, { x: 15, y: 23 }
  ];

  const HOUSE = {
    doorX: 13.5,      // in tile units
    doorY: 12,
    insideY: 14,
    left: 11,
    right: 16,
    top: 13,
    bottom: 15
  };

  const TUNNEL_ROW = 14;

  // Sanity-check every layout at load time so a typo can never ship silently.
  MAPS.forEach(function (map) {
    if (map.rows.length !== ROWS) {
      throw new Error(map.key + ' must have ' + ROWS + ' rows, found ' + map.rows.length);
    }
    map.rows.forEach(function (row, i) {
      if (row.length !== COLS) {
        throw new Error(map.key + ' row ' + i + ' must be ' + COLS + ' wide, found ' + row.length);
      }
    });
  });

  function get(key) {
    for (let i = 0; i < MAPS.length; i++) {
      if (MAPS[i].key === key) return MAPS[i];
    }
    return MAPS[0];
  }

  function parse(key) {
    const map = get(key);
    const grid = [];
    let pelletCount = 0;
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) {
        const ch = map.rows[y][x];
        let t;
        switch (ch) {
          case '#': t = TILE.WALL; break;
          case '.': t = TILE.PELLET; pelletCount++; break;
          case 'o': t = TILE.POWER; pelletCount++; break;
          case '-': t = TILE.DOOR; break;
          default: t = TILE.FLOOR;
        }
        row.push(t);
      }
      grid.push(row);
    }
    return { grid: grid, pelletCount: pelletCount, map: map };
  }

  global.Maze = {
    COLS: COLS,
    ROWS: ROWS,
    TILE: TILE,
    HOUSE: HOUSE,
    TUNNEL_ROW: TUNNEL_ROW,
    NO_UP_TILES: NO_UP_TILES,
    MAPS: MAPS,
    get: get,
    parse: parse
  };
})(window);
