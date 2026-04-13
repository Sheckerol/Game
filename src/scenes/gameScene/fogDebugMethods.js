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
    for (const box of this.fogBoxes) {
      if (tileR >= box.y && tileR < box.y + box.h && tileC >= box.x && tileC < box.x + box.w) {
        this._revealBox(box, visGrid);
      }
    }
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

    this.debugGfx.fillStyle(0x00ff00, 0.25);
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (this.playerFog.visGrid[r][c]) {
          this.debugGfx.fillRect(c * TILE + 1, r * TILE + 1, TILE - 2, TILE - 2);
        }
      }
    }

    this.debugGfx.lineStyle(2, 0xffffff, 1);
    this.debugGfx.strokeRect(tileC * TILE, tileR * TILE, TILE, TILE);

    if (this.debugMode === 1) {
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
      return;
    }

    const whiteRoomCandidates = this._collectWhiteRoomCandidates();
    for (const candidate of whiteRoomCandidates) {
      const roomColor = candidate.flagged ? 0xffff00 : 0xff8800;
      this.debugGfx.lineStyle(2, roomColor, 0.85);
      this.debugGfx.strokeRect(
        candidate.room.x * TILE,
        candidate.room.y * TILE,
        candidate.room.w * TILE,
        candidate.room.h * TILE
      );
    }

    this.debugGfx.lineStyle(2, 0x00ffff, 0.85);
    for (const s of this.debugCorridors) {
      if (s.dir === 'h') this.debugGfx.strokeRect(s.x * TILE, s.y * TILE, s.w * TILE, s.h * TILE);
    }

    this.debugGfx.lineStyle(2, 0xff44ff, 0.85);
    for (const s of this.debugCorridors) {
      if (s.dir === 'v') this.debugGfx.strokeRect(s.x * TILE, s.y * TILE, s.w * TILE, s.h * TILE);
    }

    // Highlight parallel corridors that are side-by-side (touching) in white.
    this.debugGfx.lineStyle(2, 0xffffff, 1);
    for (const corridor of this._findSideBySideCorridors(this.expandedCorridors ?? this.debugCorridors)) {
      this.debugGfx.strokeRect(corridor.x * TILE, corridor.y * TILE, corridor.w * TILE, corridor.h * TILE);
    }

    this.debugGfx.fillStyle(0x00ff66, 0.35);
    this.debugGfx.lineStyle(2, 0x00ff66, 1);
    const highlights = this._findWhiteRoomCauseHighlights(whiteRoomCandidates);
    for (const highlight of highlights) {
      if (highlight.overlap) {
        this.debugGfx.fillRect(
          highlight.overlap.x * TILE + 1,
          highlight.overlap.y * TILE + 1,
          highlight.overlap.w * TILE - 2,
          highlight.overlap.h * TILE - 2
        );
        this.debugGfx.strokeRect(
          highlight.overlap.x * TILE,
          highlight.overlap.y * TILE,
          highlight.overlap.w * TILE,
          highlight.overlap.h * TILE
        );
      }
      this.debugGfx.strokeRect(
        highlight.corridor.x * TILE,
        highlight.corridor.y * TILE,
        highlight.corridor.w * TILE,
        highlight.corridor.h * TILE
      );
    }

    const whiteUnionKeys = new Set();
    for (const highlight of highlights) {
      for (const unionRect of this._buildUnionRectsFromOverlap(highlight.room, highlight.corridor)) {
        whiteUnionKeys.add(`${unionRect.x},${unionRect.y},${unionRect.w},${unionRect.h}`);
      }
    }
    for (const unionRect of this._computeCorridorUnionFogBoxes()) {
      whiteUnionKeys.add(`${unionRect.x},${unionRect.y},${unionRect.w},${unionRect.h}`);
    }
    const unionPalette = [0xffffff, 0xff66aa, 0x66ddff, 0xffdd66, 0x99ff99, 0xcc99ff];
    let unionColorIdx = 0;
    for (const key of whiteUnionKeys) {
      const [x, y, w, h] = key.split(',').map(Number);
      this.debugGfx.lineStyle(2, unionPalette[unionColorIdx % unionPalette.length], 0.95);
      this.debugGfx.strokeRect(x * TILE, y * TILE, w * TILE, h * TILE);
      unionColorIdx++;
    }
  },

  _findWhiteRoomCauseHighlights(whiteRooms) {
    const highlights = [];
    for (const whiteRoom of whiteRooms) {
      let bestHCorridor = null;
      let bestHScore = 0;
      let bestVCorridor = null;
      let bestVScore = 0;

      for (const corridor of this.debugCorridors) {
        const touchScore = this._parallelTouchOverlapScore(whiteRoom.room, corridor);
        let score = touchScore * 1000;
        for (const tile of whiteRoom.triggerTiles) {
          if (this._rectContainsTile(corridor, tile.r, tile.c)) score++;
        }
        if (corridor.dir === 'h' && score > bestHScore) {
          bestHScore = score;
          bestHCorridor = corridor;
        }
        if (corridor.dir === 'v' && score > bestVScore) {
          bestVScore = score;
          bestVCorridor = corridor;
        }
      }

      if (bestHCorridor && bestHScore > 0) {
        highlights.push({
          room: whiteRoom.room,
          corridor: bestHCorridor,
          overlap: this._rectIntersection(whiteRoom.room, bestHCorridor),
        });
      }

      if (bestVCorridor && bestVScore > 0 && bestVCorridor !== bestHCorridor) {
        highlights.push({
          room: whiteRoom.room,
          corridor: bestVCorridor,
          overlap: this._rectIntersection(whiteRoom.room, bestVCorridor),
        });
      }
    }
    return highlights;
  },

  _collectWhiteRoomCandidates() {
    const g = this.mapGrid;
    const flr = (r, c) => r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS && g[r][c] === 0;
    const candidates = [];

    for (const rm of this.debugRooms) {
      const { x: rx, y: ry, w: rw, h: rh } = rm;
      const TL_l = flr(ry, rx - 1);
      const TL_t = flr(ry - 1, rx);
      const TR_t = flr(ry - 1, rx + rw - 1);
      const TR_r = flr(ry, rx + rw);
      const BL_l = flr(ry + rh - 1, rx - 1);
      const BL_b = flr(ry + rh, rx);
      const BR_r = flr(ry + rh - 1, rx + rw);
      const BR_b = flr(ry + rh, rx + rw - 1);

      const cornerHit = (TL_l && TL_t) || (TR_t && TR_r) || (BL_l && BL_b) || (BR_r && BR_b);
      const sideHit = (TL_l && BL_l) || (TL_t && TR_t) || (TR_r && BR_r) || (BL_b && BR_b);
      const parallelTouchHit = this.debugCorridors.some(c => this._parallelTouchOverlapScore(rm, c) > 0);
      const flagged = cornerHit || sideHit || parallelTouchHit;

      const triggerTiles = [];
      if (flagged) {
        if (TL_l) triggerTiles.push({ r: ry, c: rx - 1 });
        if (TL_t) triggerTiles.push({ r: ry - 1, c: rx });
        if (TR_t) triggerTiles.push({ r: ry - 1, c: rx + rw - 1 });
        if (TR_r) triggerTiles.push({ r: ry, c: rx + rw });
        if (BL_l) triggerTiles.push({ r: ry + rh - 1, c: rx - 1 });
        if (BL_b) triggerTiles.push({ r: ry + rh, c: rx });
        if (BR_r) triggerTiles.push({ r: ry + rh - 1, c: rx + rw });
        if (BR_b) triggerTiles.push({ r: ry + rh, c: rx + rw - 1 });
      }

      candidates.push({ room: rm, flagged, triggerTiles });
    }

    return candidates;
  },

  _computeUnionFogBoxes() {
    const whiteRoomCandidates = this._collectWhiteRoomCandidates().filter(c => c.flagged);
    const highlights = this._findWhiteRoomCauseHighlights(whiteRoomCandidates);
    const boxes = [];
    const keys = new Set();

    for (const highlight of highlights) {
      for (const unionRect of this._buildUnionRectsFromOverlap(highlight.room, highlight.corridor)) {
        if (unionRect.w <= 0 || unionRect.h <= 0) continue;
        const key = `${unionRect.x},${unionRect.y},${unionRect.w},${unionRect.h}`;
        if (keys.has(key)) continue;
        keys.add(key);
        boxes.push(unionRect);
      }
    }

    for (const unionRect of this._computeCorridorUnionFogBoxes()) {
      if (unionRect.w <= 0 || unionRect.h <= 0) continue;
      const key = `${unionRect.x},${unionRect.y},${unionRect.w},${unionRect.h}`;
      if (keys.has(key)) continue;
      keys.add(key);
      boxes.push(unionRect);
    }

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

  _findSideBySideCorridors(corridors) {
    const keys = new Set();
    for (let i = 0; i < corridors.length; i++) {
      for (let j = i + 1; j < corridors.length; j++) {
        const a = corridors[i];
        const b = corridors[j];
        if (a.dir !== b.dir) continue;
        if (this._rectIntersection(a, b)) continue; // overlapping is not side-by-side
        const touchBand = this._corridorOverlapOrTouchBand(a, b);
        if (!touchBand) continue;
        keys.add(`${a.x},${a.y},${a.w},${a.h}`);
        keys.add(`${b.x},${b.y},${b.w},${b.h}`);
      }
    }

    return Array.from(keys, key => {
      const [x, y, w, h] = key.split(',').map(Number);
      return { x, y, w, h };
    });
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

  _rectContainsTile(rect, row, col) {
    return col >= rect.x && col < rect.x + rect.w && row >= rect.y && row < rect.y + rect.h;
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
        const overlapsBandY = otherRoom.y < bandY1 && otherRoom.y + otherRoom.h > bandY0;
        if (!overlapsCorridorX || !overlapsBandY) continue;
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
      const overlapsBandX = otherRoom.x < bandX1 && otherRoom.x + otherRoom.w > bandX0;
      const overlapsCorridorY = otherRoom.y < corridor.y + corridor.h && otherRoom.y + otherRoom.h > corridor.y;
      if (!overlapsBandX || !overlapsCorridorY) continue;
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
        const overlapsBandX = otherRoom.x < bandX1 && otherRoom.x + otherRoom.w > bandX0;
        const overlapsCorridorY = otherRoom.y < corridor.y + corridor.h && otherRoom.y + otherRoom.h > corridor.y;
        if (!overlapsBandX || !overlapsCorridorY) continue;
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
      const overlapsBandY = otherRoom.y < bandY1 && otherRoom.y + otherRoom.h > bandY0;
      const overlapsCorridorX = otherRoom.x < corridor.x + corridor.w && otherRoom.x + otherRoom.w > corridor.x;
      if (!overlapsBandY || !overlapsCorridorX) continue;
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

  _parallelTouchOverlapScore(room, corridor) {
    const overlapLen = corridor.dir === 'h'
      ? this._segmentOverlap(room.x, room.x + room.w, corridor.x, corridor.x + corridor.w)
      : this._segmentOverlap(room.y, room.y + room.h, corridor.y, corridor.y + corridor.h);
    if (overlapLen <= 0) return 0;

    if (corridor.dir === 'h') {
      const touchesTop = corridor.y + corridor.h === room.y;
      const touchesBottom = corridor.y === room.y + room.h;
      return (touchesTop || touchesBottom) ? overlapLen : 0;
    }

    const touchesLeft = corridor.x + corridor.w === room.x;
    const touchesRight = corridor.x === room.x + room.w;
    return (touchesLeft || touchesRight) ? overlapLen : 0;
  },

  _segmentOverlap(a0, a1, b0, b1) {
    return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
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
};

export default fogDebugMethods;
