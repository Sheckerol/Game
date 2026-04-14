import { MAP_ROWS, MAP_COLS, TILE } from './constants.js';

const fogDebugMethods = {
  _makeFogState() {
    return {
      visGrid: Array.from({ length: MAP_ROWS }, () => new Array(MAP_COLS).fill(false)),
      fogGrid: Array.from({ length: MAP_ROWS }, () => new Array(MAP_COLS).fill(false)),
      lastTile: { r: -1, c: -1 },
    };
  },

  _updateFog(px, py, fogState) {
    const tileR = Math.floor(py / TILE);
    const tileC = Math.floor(px / TILE);
    if (tileR === fogState.lastTile.r && tileC === fogState.lastTile.c) return;
    fogState.lastTile = { r: tileR, c: tileC };

    this._revealBoxesAt(tileR, tileC, fogState.visGrid);

    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (fogState.visGrid[r][c]) fogState.fogGrid[r][c] = true;
      }
    }

    this._redrawFog();
  },

  _revealBoxesAt(tileR, tileC, visGrid) {
    // Phase 1: collect every box that directly contains the player tile.
    const direct = this.fogBoxes.filter(b =>
      tileR >= b.y && tileR < b.y + b.h &&
      tileC >= b.x && tileC < b.x + b.w
    );
    if (!direct.length) return;

    // Phase 2: one-level cascade — also reveal any box that overlaps a
    // directly-triggered box.  This ensures that, e.g., standing in the
    // upper part of a room also reveals a corridor that passes through the
    // room's lower rows, so the corridor's extension past the room edge
    // becomes visible without needing a special union zone.
    const toReveal = new Set(direct);
    for (const box of this.fogBoxes) {
      if (toReveal.has(box)) continue;
      if (direct.some(d => this._rectIntersection(d, box))) toReveal.add(box);
    }

    for (const box of toReveal) this._revealBox(box, visGrid);
  },

  _revealBox(box, visGrid) {
    const r0 = Math.max(0, box.y - 1);
    const r1 = Math.min(MAP_ROWS - 1, box.y + box.h);
    const c0 = Math.max(0, box.x - 1);
    const c1 = Math.min(MAP_COLS - 1, box.x + box.w);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        visGrid[r][c] = true;
      }
    }
  },

  _redrawFog() {
    const fogStates = [this.playerFog];
    this.fogGfx.clear();

    this.fogGfx.fillStyle(0x000000, 0.65);
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const seen = fogStates.some(fs => fs.fogGrid[r][c]);
        const vis = fogStates.some(fs => fs.visGrid[r][c]);
        if (seen && !vis) this.fogGfx.fillRect(c * TILE, r * TILE, TILE, TILE);
      }
    }

    this.fogGfx.fillStyle(0x000000, 1);
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (!fogStates.some(fs => fs.fogGrid[r][c])) {
          this.fogGfx.fillRect(c * TILE, r * TILE, TILE, TILE);
        }
      }
    }

    this._drawDebug();
  },

  _drawDebug() {
    this.debugGfx.clear();
    if (this.debugMode === 0) return;

    const tileR = Math.floor(this.player.y / TILE);
    const tileC = Math.floor(this.player.x / TILE);

    this.debugGfx.lineStyle(2, 0xffffff, 1);
    this.debugGfx.strokeRect(tileC * TILE, tileR * TILE, TILE, TILE);

    const BOX_COLORS = [
      0xff4444, 0xffff44, 0x44ff44, 0x44ffff,
      0x4444ff, 0xff44ff, 0xff8844, 0x44ff88,
      0x88ff44, 0xff4488, 0x8844ff, 0x44ffdd,
    ];
    for (let i = 0; i < this.fogBoxes.length; i++) {
      const box = this.fogBoxes[i];
      const color = BOX_COLORS[i % BOX_COLORS.length];
      const inBox = tileR >= box.y && tileR < box.y + box.h && tileC >= box.x && tileC < box.x + box.w;
      this.debugGfx.lineStyle(inBox ? 3 : 1, color, inBox ? 1.0 : 0.5);
      this.debugGfx.strokeRect(box.x * TILE, box.y * TILE, box.w * TILE, box.h * TILE);
    }
  },

  _computeUnionFogBoxes() {
    const boxes = [];
    const keys = new Set();
    const add = (rect) => {
      if (!rect || rect.w <= 0 || rect.h <= 0) return;
      const key = `${rect.x},${rect.y},${rect.w},${rect.h}`;
      if (keys.has(key)) return;
      keys.add(key);
      boxes.push(rect);
    };

    // Case 1: room-corridor overlap — direct geometric check replaces heuristic
    for (const room of this.debugRooms)
      for (const corridor of (this.expandedCorridors ?? this.debugCorridors))
        if (this._rectIntersection(room, corridor))
          for (const r of this._buildUnionRectsFromOverlap(room, corridor)) add(r);

    // Case 2: parallel corridor pairs with bounding-box overlap (existing)
    for (const r of this._computeCorridorUnionFogBoxes()) add(r);

    // Case 3: corridor adjacent to room with no wall between them
    for (const r of this._computeAdjacentRoomCorridorBoxes()) add(r);

    // Case 4: stepped parallel corridors (touching boundary, no bounding-box overlap)
    for (const r of this._computeSteppedCorridorUnionBoxes()) add(r);

    return boxes;
  },

  _computeCorridorUnionFogBoxes() {
    const corridors = this.expandedCorridors ?? this.debugCorridors;
    const boxes = [];
    const keys = new Set();

    for (let i = 0; i < corridors.length; i++) {
      for (let j = i + 1; j < corridors.length; j++) {
        const a = corridors[i];
        const b = corridors[j];
        if (a.dir !== b.dir) continue; // only parallel corridors
        const overlap = this._rectIntersection(a, b);
        if (!overlap) continue;

        for (const rect of this._buildCorridorUnionRectsFromOverlap(a, b, overlap)) {
          if (!rect || rect.w <= 0 || rect.h <= 0) continue;
          const key = `${rect.x},${rect.y},${rect.w},${rect.h}`;
          if (keys.has(key)) continue;
          keys.add(key);
          boxes.push(rect);
        }
      }
    }

    return boxes;
  },

  _corridorOverlapOrTouchBand(a, b) {
    const overlap = this._rectIntersection(a, b);
    if (overlap) return overlap;
    if (a.dir !== b.dir) return null;

    if (a.dir === 'h') {
      const x0 = Math.max(a.x, b.x);
      const x1 = Math.min(a.x + a.w, b.x + b.w);
      if (x1 <= x0) return null;
      if (a.y + a.h === b.y) return { x: x0, y: b.y, w: x1 - x0, h: 1 };
      if (b.y + b.h === a.y) return { x: x0, y: a.y, w: x1 - x0, h: 1 };
      return null;
    }

    const y0 = Math.max(a.y, b.y);
    const y1 = Math.min(a.y + a.h, b.y + b.h);
    if (y1 <= y0) return null;
    if (a.x + a.w === b.x) return { x: b.x, y: y0, w: 1, h: y1 - y0 };
    if (b.x + b.w === a.x) return { x: a.x, y: y0, w: 1, h: y1 - y0 };
    return null;
  },

  _buildParallelCorridorUnionRect(a, b, overlap) {
    if (a.dir === 'h') {
      const y0 = overlap.y;
      const y1 = overlap.y + overlap.h;
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x + a.w, b.x + b.w);
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    if (a.dir === 'v') {
      const x0 = overlap.x;
      const x1 = overlap.x + overlap.w;
      const y0 = Math.min(a.y, b.y);
      const y1 = Math.max(a.y + a.h, b.y + b.h);
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    return null;
  },

  _rectIntersection(a, b) {
    const x0 = Math.max(a.x, b.x);
    const y0 = Math.max(a.y, b.y);
    const x1 = Math.min(a.x + a.w, b.x + b.w);
    const y1 = Math.min(a.y + a.h, b.y + b.h);
    if (x1 <= x0 || y1 <= y0) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  },

  _buildUnionRectsFromOverlap(room, corridor) {
    const overlap = this._rectIntersection(room, corridor);
    const parallel = this._buildParallelUnionRect(room, corridor);
    const perpendicular = this._buildPerpendicularUnionRect(room, corridor, overlap);
    return perpendicular ? [parallel, perpendicular] : [parallel];
  },

  _buildParallelUnionRect(room, corridor) {
    const roomBoxes = this._getRoomBoxesForUnion();
    if (corridor.dir === 'h') {
      const y0 = Math.max(room.y, corridor.y);
      const y1 = Math.min(room.y + room.h, corridor.y + corridor.h);
      const bandY0 = y1 > y0 ? y0 : corridor.y;
      const bandY1 = y1 > y0 ? y1 : corridor.y + corridor.h;
      let x0 = Math.min(room.x, corridor.x);
      let x1 = Math.max(room.x + room.w, corridor.x + corridor.w);

      for (const otherRoom of roomBoxes) {
        const overlapsCorridorX = otherRoom.x < corridor.x + corridor.w && otherRoom.x + otherRoom.w > corridor.x;
        // Must *fully cover* the band height — overlapping is not enough, it would include
        // tiles where the other room doesn't reach and those tiles may be walls.
        const coversBandY = otherRoom.y <= bandY0 && otherRoom.y + otherRoom.h >= bandY1;
        if (!overlapsCorridorX || !coversBandY) continue;
        x0 = Math.min(x0, otherRoom.x);
        x1 = Math.max(x1, otherRoom.x + otherRoom.w);
      }
      return { x: x0, y: bandY0, w: x1 - x0, h: bandY1 - bandY0 };
    }

    const x0 = Math.max(room.x, corridor.x);
    const x1 = Math.min(room.x + room.w, corridor.x + corridor.w);
    const bandX0 = x1 > x0 ? x0 : corridor.x;
    const bandX1 = x1 > x0 ? x1 : corridor.x + corridor.w;
    let y0 = Math.min(room.y, corridor.y);
    let y1 = Math.max(room.y + room.h, corridor.y + corridor.h);

    for (const otherRoom of roomBoxes) {
      // Must fully cover the band width
      const coversBandX = otherRoom.x <= bandX0 && otherRoom.x + otherRoom.w >= bandX1;
      const overlapsCorridorY = otherRoom.y < corridor.y + corridor.h && otherRoom.y + otherRoom.h > corridor.y;
      if (!coversBandX || !overlapsCorridorY) continue;
      y0 = Math.min(y0, otherRoom.y);
      y1 = Math.max(y1, otherRoom.y + otherRoom.h);
    }
    return { x: bandX0, y: y0, w: bandX1 - bandX0, h: y1 - y0 };
  },

  _buildPerpendicularUnionRect(room, corridor, overlap) {
    if (!overlap) return null;
    const roomBoxes = this._getRoomBoxesForUnion();

    if (corridor.dir === 'h') {
      const bandX0 = overlap.x;
      const bandX1 = overlap.x + overlap.w;
      let y0 = Math.min(room.y, corridor.y);
      let y1 = Math.max(room.y + room.h, corridor.y + corridor.h);

      for (const otherRoom of roomBoxes) {
        // Must fully cover the band width so no wall tiles are included
        const coversBandX = otherRoom.x <= bandX0 && otherRoom.x + otherRoom.w >= bandX1;
        const overlapsCorridorY = otherRoom.y < corridor.y + corridor.h && otherRoom.y + otherRoom.h > corridor.y;
        if (!coversBandX || !overlapsCorridorY) continue;
        y0 = Math.min(y0, otherRoom.y);
        y1 = Math.max(y1, otherRoom.y + otherRoom.h);
      }
      return { x: bandX0, y: y0, w: bandX1 - bandX0, h: y1 - y0 };
    }

    const bandY0 = overlap.y;
    const bandY1 = overlap.y + overlap.h;
    let x0 = Math.min(room.x, corridor.x);
    let x1 = Math.max(room.x + room.w, corridor.x + corridor.w);

    for (const otherRoom of roomBoxes) {
      // Must fully cover the band height
      const coversBandY = otherRoom.y <= bandY0 && otherRoom.y + otherRoom.h >= bandY1;
      const overlapsCorridorX = otherRoom.x < corridor.x + corridor.w && otherRoom.x + otherRoom.w > corridor.x;
      if (!coversBandY || !overlapsCorridorX) continue;
      x0 = Math.min(x0, otherRoom.x);
      x1 = Math.max(x1, otherRoom.x + otherRoom.w);
    }
    return { x: x0, y: bandY0, w: x1 - x0, h: bandY1 - bandY0 };
  },

  _buildCorridorUnionRectsFromOverlap(a, b, overlap) {
    const parallel = this._buildParallelCorridorUnionRect(a, b, overlap);
    const perpendicular = this._buildPerpendicularCorridorUnionRect(a, b, overlap);
    return perpendicular ? [parallel, perpendicular] : [parallel];
  },

  _buildPerpendicularCorridorUnionRect(a, b, overlap) {
    if (a.dir === 'h') {
      const x0 = overlap.x;
      const x1 = overlap.x + overlap.w;
      const y0 = Math.min(a.y, b.y);
      const y1 = Math.max(a.y + a.h, b.y + b.h);
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    if (a.dir === 'v') {
      const y0 = overlap.y;
      const y1 = overlap.y + overlap.h;
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x + a.w, b.x + b.w);
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    return null;
  },

  _getRoomBoxesForUnion() {
    return this.allRoomBoxes ?? this.debugRooms;
  },

  // Case 3: corridor directly adjacent to a room with no wall tile between them.
  // _rectIntersection returns null (no overlap), so Case 1 misses this.
  _computeAdjacentRoomCorridorBoxes() {
    const corridors = this.expandedCorridors ?? this.debugCorridors;
    const boxes = [];

    for (const room of this.debugRooms) {
      for (const corridor of corridors) {
        if (this._rectIntersection(room, corridor)) continue; // handled by Case 1

        if (corridor.dir === 'h') {
          const xOverlap0 = Math.max(room.x, corridor.x);
          const xOverlap1 = Math.min(room.x + room.w, corridor.x + corridor.w);
          if (xOverlap1 <= xOverlap0) continue;

          const adjacentBelow = corridor.y === room.y + room.h;
          const adjacentAbove = room.y === corridor.y + corridor.h;
          if (!adjacentBelow && !adjacentAbove) continue;

          boxes.push({
            x: xOverlap0,
            y: Math.min(room.y, corridor.y),
            w: xOverlap1 - xOverlap0,
            h: room.h + corridor.h,
          });
        } else {
          const yOverlap0 = Math.max(room.y, corridor.y);
          const yOverlap1 = Math.min(room.y + room.h, corridor.y + corridor.h);
          if (yOverlap1 <= yOverlap0) continue;

          const adjacentRight = corridor.x === room.x + room.w;
          const adjacentLeft  = room.x === corridor.x + corridor.w;
          if (!adjacentRight && !adjacentLeft) continue;

          boxes.push({
            x: Math.min(room.x, corridor.x),
            y: yOverlap0,
            w: room.w + corridor.w,
            h: yOverlap1 - yOverlap0,
          });
        }
      }
    }

    return boxes;
  },

  // Case 4: two same-direction corridors that are stepped — they touch at a
  // boundary edge with overlapping cross-axis ranges but no bounding-box
  // intersection.  _corridorOverlapOrTouchBand detects the touch; we turn it
  // into a union zone spanning the full extent of both corridors in the band.
  _computeSteppedCorridorUnionBoxes() {
    const corridors = this.expandedCorridors ?? this.debugCorridors;
    const boxes = [];

    for (let i = 0; i < corridors.length; i++) {
      for (let j = i + 1; j < corridors.length; j++) {
        const a = corridors[i];
        const b = corridors[j];
        if (a.dir !== b.dir) continue;
        if (this._rectIntersection(a, b)) continue; // handled by Case 2

        const band = this._corridorOverlapOrTouchBand(a, b);
        if (!band) continue;

        if (a.dir === 'h') {
          boxes.push({
            x: band.x,
            y: Math.min(a.y, b.y),
            w: band.w,
            h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y),
          });
        } else {
          boxes.push({
            x: Math.min(a.x, b.x),
            y: band.y,
            w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x),
            h: band.h,
          });
        }
      }
    }

    return boxes;
  },
};

export default fogDebugMethods;
