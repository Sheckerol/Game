/**
 * A* grid-based pathfinding using the mapGrid (0 = walkable, 1 = wall).
 */

class MinHeap {
  constructor() { this._data = []; }

  push(node) {
    this._data.push(node);
    this._bubbleUp(this._data.length - 1);
  }

  pop() {
    const top = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0) {
      this._data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  get size() { return this._data.length; }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._data[i].f >= this._data[parent].f) break;
      [this._data[i], this._data[parent]] = [this._data[parent], this._data[i]];
      i = parent;
    }
  }

  _sinkDown(i) {
    const n = this._data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this._data[l].f < this._data[smallest].f) smallest = l;
      if (r < n && this._data[r].f < this._data[smallest].f) smallest = r;
      if (smallest === i) break;
      [this._data[i], this._data[smallest]] = [this._data[smallest], this._data[i]];
      i = smallest;
    }
  }
}

const DIRS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],       // cardinal
  [-1, -1], [-1, 1], [1, -1], [1, 1],      // diagonal
];

/**
 * Find a path from (startR, startC) to (goalR, goalC) on the grid.
 * Returns an array of {r, c} tile positions (excluding the start), or null if no path.
 *
 * @param {number[][]} grid - 2D array where 0 = walkable, 1 = wall
 * @param {number} startR
 * @param {number} startC
 * @param {number} goalR
 * @param {number} goalC
 * @param {number} [maxRange=0] - Stop when within this many tiles of the goal (0 = reach goal exactly)
 */
export function findPath(grid, startR, startC, goalR, goalC, maxRange = 0) {
  const rows = grid.length;
  const cols = grid[0].length;

  if (startR === goalR && startC === goalC) return [];

  const key = (r, c) => r * cols + c;
  const gScore = new Map();
  const cameFrom = new Map();
  const open = new MinHeap();

  const startKey = key(startR, startC);
  gScore.set(startKey, 0);
  open.push({ r: startR, c: startC, f: heuristic(startR, startC, goalR, goalC) });

  while (open.size > 0) {
    const cur = open.pop();
    const curKey = key(cur.r, cur.c);
    const curG = gScore.get(curKey);

    // If within desired range of goal, reconstruct path
    if (maxRange > 0) {
      const dr = Math.abs(cur.r - goalR);
      const dc = Math.abs(cur.c - goalC);
      if (Math.max(dr, dc) <= maxRange && !(cur.r === startR && cur.c === startC)) {
        return reconstruct(cameFrom, curKey, startKey, cols);
      }
    } else if (cur.r === goalR && cur.c === goalC) {
      return reconstruct(cameFrom, curKey, startKey, cols);
    }

    for (const [dr, dc] of DIRS) {
      const nr = cur.r + dr;
      const nc = cur.c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (grid[nr][nc] !== 0) continue;

      // For diagonal moves, both adjacent cardinal tiles must be walkable
      if (dr !== 0 && dc !== 0) {
        if (grid[cur.r + dr][cur.c] !== 0 || grid[cur.r][cur.c + dc] !== 0) continue;
      }

      const moveCost = (dr !== 0 && dc !== 0) ? 1.414 : 1;
      const tentG = curG + moveCost;
      const nKey = key(nr, nc);

      if (!gScore.has(nKey) || tentG < gScore.get(nKey)) {
        gScore.set(nKey, tentG);
        cameFrom.set(nKey, curKey);
        const h = heuristic(nr, nc, goalR, goalC);
        open.push({ r: nr, c: nc, f: tentG + h });
      }
    }
  }

  return null; // no path found
}

function heuristic(r1, c1, r2, c2) {
  // Octile distance — consistent with diagonal movement cost
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  return Math.max(dr, dc) + 0.414 * Math.min(dr, dc);
}

function reconstruct(cameFrom, goalKey, startKey, cols) {
  const path = [];
  let current = goalKey;
  while (current !== startKey) {
    const r = Math.floor(current / cols);
    const c = current % cols;
    path.push({ r, c });
    current = cameFrom.get(current);
  }
  path.reverse();
  return path;
}
