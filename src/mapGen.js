export const MAP_COLS = 50;
export const MAP_ROWS = 70;

/**
 * Generate a dungeon map.
 * @param {{ rng: () => number }} opts  rng() must return a value in [0, 1)
 * @returns {{ grid, roomGrid, rooms, corridors, playerStart, enemyStart,
 *             debugRooms, debugCorridors }}
 */
export function generateMap({ rng }) {
  const rows = MAP_ROWS, cols = MAP_COLS;
  const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;

  const grid     = Array.from({ length: rows }, () => new Array(cols).fill(1));
  const roomGrid = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  const corridors = [];

  // Carve a 2-tile-wide horizontal run (stays inside border)
  const carveH = (y, x1, x2) => {
    const [xa, xb] = x1 <= x2 ? [x1, x2] : [x2, x1];
    for (let x = xa; x <= xb; x++) {
      if (y   >= 1 && y   < rows - 1 && x >= 1 && x < cols - 1) grid[y][x]     = 0;
      if (y+1 >= 1 && y+1 < rows - 1 && x >= 1 && x < cols - 1) grid[y+1][x]   = 0;
    }
    corridors.push({ x: xa, y: y, w: xb - xa + 1, h: 2, dir: 'h' });
  };

  // Carve a 2-tile-wide vertical run (stays inside border)
  const carveV = (x, y1, y2) => {
    const [ya, yb] = y1 <= y2 ? [y1, y2] : [y2, y1];
    for (let y = ya; y <= yb; y++) {
      if (y >= 1 && y < rows - 1 && x   >= 1 && x   < cols - 1) grid[y][x]   = 0;
      if (y >= 1 && y < rows - 1 && x+1 >= 1 && x+1 < cols - 1) grid[y][x+1] = 0;
    }
    corridors.push({ x: x, y: ya, w: 2, h: yb - ya + 1, dir: 'v' });
  };

  // Place rooms
  const MIN_R = 5, MAX_R = 12, ATTEMPTS = 300;
  const rooms = [];

  for (let i = 0; i < ATTEMPTS; i++) {
    const w = randInt(MIN_R, MAX_R);
    const h = randInt(MIN_R, MAX_R);
    const x = randInt(1, cols - w - 2);
    const y = randInt(1, rows - h - 2);

    if (rooms.some(r =>
      x < r.x + r.w + 2 && x + w + 2 > r.x &&
      y < r.y + r.h + 2 && y + h + 2 > r.y
    )) continue;

    const roomIdx = rooms.length;
    for (let ry = y; ry < y + h; ry++)
      for (let rx = x; rx < x + w; rx++) {
        grid[ry][rx] = 0;
        roomGrid[ry][rx] = roomIdx;
      }

    rooms.push({ x, y, w, h,
      cx: Math.floor(x + w / 2),
      cy: Math.floor(y + h / 2) });
  }

  // Connect each room to the nearest already-connected room (greedy MST)
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i];
    let nearest = rooms[0], minD = Infinity;
    for (let j = 0; j < i; j++) {
      const d = Math.abs(a.cx - rooms[j].cx) + Math.abs(a.cy - rooms[j].cy);
      if (d < minD) { minD = d; nearest = rooms[j]; }
    }

    if (rng() < 0.5) {
      // H first, V second
      const vCol    = a.cx < nearest.cx ? nearest.cx - 1 : nearest.cx;
      const vRowEnd = nearest.cy < a.cy  ? a.cy + 1       : a.cy;
      carveH(a.cy, a.cx, nearest.cx);
      carveV(vCol, vRowEnd, nearest.cy);
    } else {
      // V first, H second
      const vCol    = nearest.cx < a.cx  ? a.cx - 1       : a.cx;
      const vRowEnd = nearest.cy > a.cy  ? nearest.cy + 1 : nearest.cy;
      carveV(vCol, a.cy, vRowEnd);
      carveH(nearest.cy, a.cx, nearest.cx);
    }
  }

  const playerStart = [rooms[0].cy, rooms[0].cx];
  let enemyStart = [rooms[rooms.length - 1].cy, rooms[rooms.length - 1].cx];
  let maxDist = -1;
  for (const r of rooms) {
    const d = Math.abs(r.cy - rooms[0].cy) + Math.abs(r.cx - rooms[0].cx);
    if (d > maxDist) { maxDist = d; enemyStart = [r.cy, r.cx]; }
  }

  const debugRooms     = rooms.map(r => ({ ...r }));
  const debugCorridors = corridors.map(c => ({ ...c }));

  return { grid, roomGrid, rooms, corridors, playerStart, enemyStart,
           debugRooms, debugCorridors };
}

/**
 * Expand each corridor segment outward along its axis as far as both lanes
 * remain open floor.  Mutates corridor objects in place.
 * @param {Array} corridors  Array of corridor rects (from generateMap)
 * @param {number[][]} grid  The tile grid (0 = floor, 1 = wall)
 */
export function expandCorridors(corridors, grid) {
  for (const seg of corridors) {
    if (seg.dir === 'h') {
      while (seg.x > 0
             && grid[seg.y    ][seg.x - 1] === 0
             && grid[seg.y + 1][seg.x - 1] === 0) { seg.x--; seg.w++; }
      let xEnd = seg.x + seg.w;
      while (xEnd < MAP_COLS
             && grid[seg.y    ][xEnd] === 0
             && grid[seg.y + 1][xEnd] === 0) { seg.w++; xEnd++; }
    } else {
      while (seg.y > 0
             && grid[seg.y - 1][seg.x    ] === 0
             && grid[seg.y - 1][seg.x + 1] === 0) { seg.y--; seg.h++; }
      let yEnd = seg.y + seg.h;
      while (yEnd < MAP_ROWS
             && grid[yEnd][seg.x    ] === 0
             && grid[yEnd][seg.x + 1] === 0) { seg.h++; yEnd++; }
    }
  }
}
