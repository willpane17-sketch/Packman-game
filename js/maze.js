/* ==========================================================================
   maze.js - Tilted Towers maze layout + tile helpers
   Classic 28 x 31 arcade layout, re-skinned as a city block.
   Legend:
     #  wall (building)
     .  pellet (gold coin)
     o  power pellet (shield potion)
     -  ghost house door
     ' ' empty floor
   ========================================================================== */
(function (global) {
  'use strict';

  const MAZE_STRING = [
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
  ];

  const COLS = 28;
  const ROWS = 31;

  // Sanity-check the layout at load time so a typo can never ship silently.
  if (MAZE_STRING.length !== ROWS) {
    throw new Error('Maze must have ' + ROWS + ' rows, found ' + MAZE_STRING.length);
  }
  MAZE_STRING.forEach(function (row, i) {
    if (row.length !== COLS) {
      throw new Error('Maze row ' + i + ' must be ' + COLS + ' wide, found ' + row.length);
    }
  });

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

  function parse() {
    const grid = [];
    let pelletCount = 0;
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) {
        const ch = MAZE_STRING[y][x];
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
    return { grid: grid, pelletCount: pelletCount };
  }

  global.Maze = {
    COLS: COLS,
    ROWS: ROWS,
    TILE: TILE,
    HOUSE: HOUSE,
    TUNNEL_ROW: TUNNEL_ROW,
    NO_UP_TILES: NO_UP_TILES,
    parse: parse,
    raw: MAZE_STRING
  };
})(window);
