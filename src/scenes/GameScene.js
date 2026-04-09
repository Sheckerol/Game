// Tile size in pixels
const TILE = 32;

// Movement budget per turn (pixels)
const MAX_DISTANCE = 160;

// Player speed in pixels/second
const SPEED = 160;

// Combat
const DUMMY_HP    = 50;
const PLAYER_HALF = (TILE - 4) / 2;  // half-size of the player body

// Weapons
const WEAPONS = [
  { name: 'Dagger', range: 40,  damage: 15, cost: 30, abilities: [{ type: 'crit_range', value: 4 }] },
  { name: 'Sword',  range: 80,  damage: 10, cost: 50, abilities: [{ type: 'block',      value: 3 }] },
  { name: 'Spear',  range: 130, damage: 7,  cost: 40, abilities: [{ type: 'brace',      value: 1 }] },
];

// Player
const PLAYER_HP = 100;

// Enemy AI
const ENEMY_MOVE = 100;

// Map dimensions
const MAP_COLS = 50;
const MAP_ROWS = 70;
const WORLD_W  = MAP_COLS * TILE;
const WORLD_H  = MAP_ROWS * TILE;

// Virtual joystick config
const JOY_RADIUS      = 50;
const JOY_KNOB_RADIUS = 22;
const JOY_MARGIN      = 80;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    // --- Generate map ---
    // Depth order: floor (0) → range circles (1) → walls (2) → entities (3) → HP/labels (4) → UI (10) → inventory (25)
    const { grid, roomGrid, rooms, playerStart, enemyStart } = this._generateMap();
    this.mapGrid  = grid;
    this.roomGrid = roomGrid;
    this.rooms    = rooms;

    this.wallGroup = this.physics.add.staticGroup();
    const floorGfx = this.add.graphics().setDepth(0);
    const wallGfx  = this.add.graphics().setDepth(2);

    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        const x = col * TILE;
        const y = row * TILE;
        if (grid[row][col] === 1) {
          wallGfx.fillStyle(0x3d405b, 1);
          wallGfx.fillRect(x, y, TILE, TILE);
          wallGfx.lineStyle(1, 0x2b2d42, 1);
          wallGfx.strokeRect(x, y, TILE, TILE);

          const wall = this.add.rectangle(x + TILE / 2, y + TILE / 2, TILE, TILE);
          this.physics.add.existing(wall, true);
          this.wallGroup.add(wall);
        } else {
          const shade = (row + col) % 2 === 0 ? 0x16213e : 0x0f3460;
          floorGfx.fillStyle(shade, 1);
          floorGfx.fillRect(x, y, TILE, TILE);
        }
      }
    }

    // Pre-build wall rect list for line-of-sight checks
    this.wallRects = this.wallGroup.getChildren().map(w =>
      new Phaser.Geom.Rectangle(w.x - TILE / 2, w.y - TILE / 2, TILE, TILE)
    );
    this._losLine = new Phaser.Geom.Line();
    this.player = this.add.circle(
      playerStart[1] * TILE + TILE / 2,
      playerStart[0] * TILE + TILE / 2,
      PLAYER_HALF, 0xe94560
    ).setDepth(6); // above fog (5)
    this.physics.add.existing(this.player);
    this.player.body.setCircle(PLAYER_HALF);
    this.player.body.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.wallGroup);
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    // --- Training dummy ---
    this.dummy = { hp: DUMMY_HP, maxHp: DUMMY_HP, alive: true, halfSize: (TILE - 4) / 2, weapon: WEAPONS[1], defeatedAtTurn: -1 };
    this.dummyRect = this.add.circle(
      enemyStart[1] * TILE + TILE / 2,
      enemyStart[0] * TILE + TILE / 2,
      this.dummy.halfSize, 0xf5a623
    ).setDepth(3).setInteractive();
    this.physics.add.existing(this.dummyRect);
    this.dummyRect.body.setCircle(this.dummy.halfSize);
    this.dummyRect.body.pushable = false;
    this.physics.add.collider(this.player, this.dummyRect);
    this.physics.add.collider(this.dummyRect, this.wallGroup);

    this.justAttacked = false;
    this.dummyRect.on('pointerdown', () => {
      this.justAttacked = true;
      this._tryAttack();
    });

    this.dummyLabel = this.add.text(
      this.dummyRect.x, this.dummyRect.y - TILE / 2 - 4,
      `DUMMY [${this.dummy.weapon.name}]`,
      { fontSize: '9px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 }
    ).setOrigin(0.5, 1).setDepth(4);

    this.dummyHpGfx = this.add.graphics().setDepth(4);
    this._updateDummyHp();

    // --- Turn state ---
    this.turnCount      = 0;
    this.distLeft       = MAX_DISTANCE;
    this.effectiveMax   = MAX_DISTANCE;
    this.savedMovement  = 0;
    this.turnEnding     = false;
    this.enemyMoving    = false;
    this.braceTriggered = false;
    this.lastX          = this.player.x;
    this.lastY          = this.player.y;

    // --- Player HP ---
    this.playerHp    = PLAYER_HP;
    this.playerMaxHp = PLAYER_HP;

    // --- Equipped weapon (default: Sword) ---
    this.equippedWeapon = WEAPONS[1];
    this.inventoryOpen  = false;

    // --- Range indicators ---
    this.rangeGfx    = this.add.graphics().setDepth(1);
    this.atkRangeGfx = this.add.graphics().setDepth(1);
    this._drawRange();
    this._drawAttackRange();

    // --- Camera ---
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setFollowOffset(0, -160);

    // --- UI: move counter ---
    this.movesText = this.add.text(240, 20, this._distLabel(), {
      fontSize: '18px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(10);

    // --- UI: equipped weapon label ---
    this.weaponText = this.add.text(240, 46, this._weaponLabel(), {
      fontSize: '13px', color: '#ffdd00',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(10);

    // --- UI: player HP bar ---
    this.add.text(50, 72, 'HP', {
      fontSize: '12px', color: '#aaffaa', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(10);
    this.playerHpGfx = this.add.graphics().setScrollFactor(0).setDepth(10);
    this._drawPlayerHp();

    // --- UI: end of turn message ---
    this.turnMsg = this.add.text(240, 400, 'End of Turn!', {
      fontSize: '28px', color: '#f5a623',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10).setVisible(false);

    // --- End Turn button (bottom-right) ---
    this.endTurnBtn = this.add.circle(400, 720, 44, 0x2266cc)
      .setScrollFactor(0).setDepth(10).setInteractive();
    this.add.text(400, 720, 'END\nTURN', {
      fontSize: '13px', color: '#ffffff', stroke: '#000000',
      strokeThickness: 2, align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(11);
    this.endTurnBtn.on('pointerdown', () => {
      this.justAttacked = true;
      this._endTurnManual();
    });

    // --- Bag button (bottom-center) ---
    this.bagBtn = this.add.circle(240, 720, 44, 0x446644)
      .setScrollFactor(0).setDepth(10).setInteractive();
    this.add.text(240, 720, 'BAG', {
      fontSize: '16px', color: '#ffffff', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(11);
    this.bagBtn.on('pointerdown', () => {
      this.justAttacked = true;
      this.inventoryOpen ? this._closeInventory() : this._openInventory();
    });

    // --- Keyboard ---
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = {
      up:    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:  this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:  this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // --- Virtual joystick ---
    this.joy = { active: false, pointerId: null, baseX: 0, baseY: 0, dx: 0, dy: 0 };
    this.joyGfx = this.add.graphics().setScrollFactor(0).setDepth(10);
    this._drawJoystick(JOY_MARGIN, 800 - JOY_MARGIN, 0, 0, false);

    this.input.on('pointerdown', (ptr) => {
      if (this.justAttacked) { this.justAttacked = false; return; }
      if (ptr.x < 240 && !this.joy.active && !this.inventoryOpen) {
        this.joy.active = true;
        this.joy.pointerId = ptr.id;
        this.joy.baseX = ptr.x;
        this.joy.baseY = ptr.y;
        this.joy.dx = 0;
        this.joy.dy = 0;
      }
    });

    this.input.on('pointermove', (ptr) => {
      if (this.joy.active && ptr.id === this.joy.pointerId) {
        let dx = ptr.x - this.joy.baseX;
        let dy = ptr.y - this.joy.baseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > JOY_RADIUS) {
          dx = (dx / dist) * JOY_RADIUS;
          dy = (dy / dist) * JOY_RADIUS;
        }
        this.joy.dx = dx;
        this.joy.dy = dy;
        this._drawJoystick(this.joy.baseX, this.joy.baseY, dx, dy, true);
      }
    });

    this.input.on('pointerup', (ptr) => {
      if (ptr.id === this.joy.pointerId) {
        this.joy.active = false;
        this.joy.pointerId = null;
        this.joy.dx = 0;
        this.joy.dy = 0;
        this._drawJoystick(JOY_MARGIN, 800 - JOY_MARGIN, 0, 0, false);
      }
    });

    // --- Fog of war ---
    this.fogGrid     = Array.from({ length: MAP_ROWS }, () => new Array(MAP_COLS).fill(false));
    this.lastFogTile = { r: -1, c: -1 };
    this.fogGfx      = this.add.graphics().setDepth(5);
    this._updateFog();

    // --- Build inventory panel (hidden) ---
    this._buildInventoryPanel();
  }

  // ---------------------------------------------------------------

  _generateMap() {
    const rows = MAP_ROWS, cols = MAP_COLS;
    const rng  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    // Start with all walls; roomGrid tracks which room each floor tile belongs to (-1 = corridor/wall)
    const grid     = Array.from({ length: rows }, () => new Array(cols).fill(1));
    const roomGrid = Array.from({ length: rows }, () => new Array(cols).fill(-1));

    // Carve a 2-tile-wide horizontal run (stays inside border)
    const carveH = (y, x1, x2) => {
      const [xa, xb] = x1 <= x2 ? [x1, x2] : [x2, x1];
      for (let x = xa; x <= xb; x++) {
        if (y   >= 1 && y   < rows-1 && x >= 1 && x < cols-1) grid[y][x]   = 0;
        if (y+1 >= 1 && y+1 < rows-1 && x >= 1 && x < cols-1) grid[y+1][x] = 0;
      }
    };

    // Carve a 2-tile-wide vertical run (stays inside border)
    const carveV = (x, y1, y2) => {
      const [ya, yb] = y1 <= y2 ? [y1, y2] : [y2, y1];
      for (let y = ya; y <= yb; y++) {
        if (y >= 1 && y < rows-1 && x   >= 1 && x   < cols-1) grid[y][x]   = 0;
        if (y >= 1 && y < rows-1 && x+1 >= 1 && x+1 < cols-1) grid[y][x+1] = 0;
      }
    };

    // Place rooms
    const MIN_R = 5, MAX_R = 12, ATTEMPTS = 300;
    const rooms = [];

    for (let i = 0; i < ATTEMPTS; i++) {
      const w = rng(MIN_R, MAX_R);
      const h = rng(MIN_R, MAX_R);
      const x = rng(1, cols - w - 2);
      const y = rng(1, rows - h - 2);

      // Reject if overlaps any existing room (2-tile padding)
      if (rooms.some(r =>
        x < r.x + r.w + 2 && x + w + 2 > r.x &&
        y < r.y + r.h + 2 && y + h + 2 > r.y
      )) continue;

      // Carve room floor and mark roomGrid
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
      // L-shaped corridor — randomly pick which leg goes first
      if (Math.random() < 0.5) {
        carveH(a.cy,      a.cx, nearest.cx);
        carveV(nearest.cx, a.cy, nearest.cy);
      } else {
        carveV(a.cx,      a.cy, nearest.cy);
        carveH(nearest.cy, a.cx, nearest.cx);
      }
    }

    // Player spawns in first room; dummy in the room farthest away
    const playerStart = [rooms[0].cy, rooms[0].cx];
    let enemyStart = [rooms[rooms.length - 1].cy, rooms[rooms.length - 1].cx];
    let maxDist = -1;
    for (const r of rooms) {
      const d = Math.abs(r.cy - rooms[0].cy) + Math.abs(r.cx - rooms[0].cx);
      if (d > maxDist) { maxDist = d; enemyStart = [r.cy, r.cx]; }
    }

    return { grid, roomGrid, rooms, playerStart, enemyStart };
  }

  // ---------------------------------------------------------------
  // Fog of war

  _updateFog() {
    const tileR = Math.floor(this.player.y / TILE);
    const tileC = Math.floor(this.player.x / TILE);
    if (tileR === this.lastFogTile.r && tileC === this.lastFogTile.c) return;
    this.lastFogTile = { r: tileR, c: tileC };
    this._revealFromPosition(tileR, tileC);
    this._redrawFog();
  }

  _revealFromPosition(pr, pc) {
    const roomIdx = this.roomGrid[pr]?.[pc];
    if (roomIdx >= 0) {
      this._revealRoom(roomIdx);
    } else if (this.mapGrid[pr]?.[pc] === 0) {
      this._revealCorridor(pr, pc);
    }
  }

  // Reveal all tiles in the room + surrounding wall border.
  // Corridors adjacent to the room are always visible at their entry tile (covered by
  // the wall border). A full corridor reveal only fires when the player is aligned
  // with the corridor axis — i.e. within 1 tile perpendicular to the corridor direction.
  _revealRoom(roomIdx) {
    const room = this.rooms[roomIdx];
    const pr = Math.floor(this.player.y / TILE);
    const pc = Math.floor(this.player.x / TILE);

    // Room floor tiles
    for (let r = room.y; r < room.y + room.h; r++)
      for (let c = room.x; c < room.x + room.w; c++)
        this.fogGrid[r][c] = true;

    // Wall border: only tiles orthogonally adjacent to border floor tiles
    // (no diagonal corners — you can't see around a corner)
    for (let r = room.y; r < room.y + room.h; r++) {
      for (let c = room.x; c < room.x + room.w; c++) {
        const onBorder = r === room.y || r === room.y + room.h - 1
                      || c === room.x || c === room.x + room.w - 1;
        if (!onBorder) continue;
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const wr = r + dr, wc = c + dc;
          if (wr >= 0 && wr < MAP_ROWS && wc >= 0 && wc < MAP_COLS
              && this.roomGrid[wr][wc] < 0)
            this.fogGrid[wr][wc] = true;
        }
      }
    }

    // Full corridor reveal only when player is lined up with the corridor
    const visited = new Set();
    for (let r = room.y; r < room.y + room.h; r++) {
      for (let c = room.x; c < room.x + room.w; c++) {
        const onBorder = r === room.y || r === room.y + room.h - 1
                      || c === room.x || c === room.x + room.w - 1;
        if (!onBorder) continue;
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nr = r + dr, nc = c + dc;
          const key = `${nr},${nc}`;
          if (nr >= 0 && nr < MAP_ROWS && nc >= 0 && nc < MAP_COLS
              && this.mapGrid[nr][nc] === 0 && this.roomGrid[nr][nc] < 0
              && !visited.has(key)) {
            visited.add(key);
            // Vertical corridor (dr!=0): player column must be within 1 of corridor column
            // Horizontal corridor (dc!=0): player row must be within 1 of corridor row
            const aligned = dr !== 0 ? Math.abs(pc - nc) <= 1
                                     : Math.abs(pr - nr) <= 1;
            if (aligned) this._revealCorridor(nr, nc);
          }
        }
      }
    }
  }

  // In a corridor: reveal the tile, cast rays in 4 directions,
  // reveal corridor tiles + 1 tile to each side.
  // When hitting a room, reveal the slice aligned with the corridor axis
  // (±1 tile either side of the corridor column/row, full depth of the room).
  _revealCorridor(pr, pc) {
    this.fogGrid[pr][pc] = true;

    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      let r = pr + dr, c = pc + dc;
      while (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS && this.mapGrid[r][c] === 0) {
        this.fogGrid[r][c] = true;

        // 1 tile to each side (perpendicular)
        for (const [sr, sc] of [[r + dc, c + dr], [r - dc, c - dr]]) {
          if (sr >= 0 && sr < MAP_ROWS && sc >= 0 && sc < MAP_COLS)
            this.fogGrid[sr][sc] = true;
        }

        // Hit a room: reveal the slice aligned with the corridor
        // Vertical ray (dr!=0): corridor column is c (dc==0 so c is constant) → filter by column
        // Horizontal ray (dc!=0): corridor row is r (dr==0 so r is constant) → filter by row
        if (this.roomGrid[r][c] >= 0) {
          const hitRoom = this.rooms[this.roomGrid[r][c]];
          for (let rr = hitRoom.y - 1; rr <= hitRoom.y + hitRoom.h; rr++) {
            for (let rc = hitRoom.x - 1; rc <= hitRoom.x + hitRoom.w; rc++) {
              if (rr < 0 || rr >= MAP_ROWS || rc < 0 || rc >= MAP_COLS) continue;
              const inSlice = dr !== 0 ? Math.abs(rc - c) <= 1
                                       : Math.abs(rr - r) <= 1;
              if (inSlice) this.fogGrid[rr][rc] = true;
            }
          }
          break;
        }
        r += dr;
        c += dc;
      }
      // Reveal the wall tile that stopped the ray (so corridor end walls are visible)
      if (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS && this.mapGrid[r][c] === 1)
        this.fogGrid[r][c] = true;
    }
  }

  _redrawFog() {
    this.fogGfx.clear();
    this.fogGfx.fillStyle(0x000000, 1);
    for (let r = 0; r < MAP_ROWS; r++)
      for (let c = 0; c < MAP_COLS; c++)
        if (!this.fogGrid[r][c])
          this.fogGfx.fillRect(c * TILE, r * TILE, TILE, TILE);
  }

  // ---------------------------------------------------------------

  _distLabel() {
    return `Move: ${Math.ceil(this.distLeft)} / ${this.effectiveMax}`;
  }

  _weaponLabel() {
    const w   = this.equippedWeapon;
    const abl = this._abilityLabel(w);
    return `${w.name}  Dmg:${w.damage}  Rng:${w.range}  Cost:${w.cost}${abl ? '  \u25c6 ' + abl : ''}`;
  }

  _abilityLabel(weapon) {
    return (weapon.abilities ?? []).map(a => {
      if (a.type === 'block')      return `Block ${a.value}`;
      if (a.type === 'crit_range') return `Crit +${a.value}`;
      if (a.type === 'brace')      return 'Brace';
      return a.type;
    }).join('  ');
  }

  _getAbility(type) {
    return this.equippedWeapon.abilities?.find(a => a.type === type) ?? null;
  }

  // Returns { roll, damage, label, color } using equipped weapon + crit_range ability
  _rollAttack() {
    const weapon  = this.equippedWeapon;
    const crit    = this._getAbility('crit_range');
    const critAt  = crit ? 21 - crit.value : 20;
    const roll    = Phaser.Math.Between(1, 20);
    let damage    = weapon.damage;
    let label     = `-${damage}`;
    let color     = '#ff4444';

    if (roll >= critAt) {
      damage = weapon.damage * 2; label = `CRIT! -${damage}`; color = '#ffdd00';
    } else if (roll === 1) {
      damage = Math.floor(weapon.damage / 2); label = `WEAK -${damage}`; color = '#aaaaaa';
    }
    return { roll, damage, label, color };
  }

  // Roll using the enemy's weapon (respects its abilities e.g. crit_range)
  _rollEnemyAttack() {
    const weapon = this.dummy.weapon;
    const crit   = weapon.abilities?.find(a => a.type === 'crit_range');
    const critAt = crit ? 21 - crit.value : 20;
    const roll   = Phaser.Math.Between(1, 20);
    let damage   = weapon.damage;
    let label    = `-${damage}`;
    let color    = '#ff4444';

    if (roll >= critAt) {
      damage = weapon.damage * 2; label = `CRIT! -${damage}`; color = '#ffdd00';
    } else if (roll === 1) {
      damage = Math.floor(weapon.damage / 2); label = `WEAK -${damage}`; color = '#aaaaaa';
    }
    return { roll, damage, label, color };
  }

  // Pure range + line-of-sight check — no turn/cost guards
  _playerInAttackRange() {
    const d = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, this.dummyRect.x, this.dummyRect.y
    );
    if (d - PLAYER_HALF - this.dummy.halfSize > this.equippedWeapon.range) return false;
    return this._hasLineOfSight(this.player.x, this.player.y, this.dummyRect.x, this.dummyRect.y);
  }

  _hasLineOfSight(x1, y1, x2, y2) {
    this._losLine.setTo(x1, y1, x2, y2);
    return !this.wallRects.some(r =>
      Phaser.Geom.Intersects.LineToRectangle(this._losLine, r)
    );
  }

  // ---------------------------------------------------------------

  _endTurnManual() {
    if (this.turnEnding) return;
    const save = Math.min(Math.floor(this.distLeft / 2), MAX_DISTANCE / 2);
    this.savedMovement = save;
    const msg = save > 0 ? `End of Turn!\n+${save} saved` : 'End of Turn!';
    this.turnMsg.setText(msg);
    this._endTurn();
  }

  _endTurn() {
    this.turnEnding = true;
    this.player.body.setVelocity(0, 0);
    this._drawRange();
    this.turnMsg.setVisible(true);
    this.time.delayedCall(800, () => {
      this.turnMsg.setVisible(false);
      this._startEnemyTurn();
    });
  }

  _startEnemyTurn() {
    if (!this.dummy.alive) { this._startPlayerTurn(); return; }

    const brace      = this._getAbility('brace');
    const wasInRange = this._playerInAttackRange();

    const dx   = this.player.x - this.dummyRect.x;
    const dy   = this.player.y - this.dummyRect.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const gap     = dist - this.dummy.halfSize - PLAYER_HALF - 2;
    const moveAmt = Math.min(ENEMY_MOVE, Math.max(0, gap));

    const afterMove = () => {
      // Brace: trigger free attack if enemy just entered the player's range
      if (brace && !this.braceTriggered && !wasInRange && this._playerInAttackRange()) {
        this.braceTriggered = true;
        this._doBraceAttack();
      }
      if (this.dummy.alive) this._enemyAttackPhase();
      else this.time.delayedCall(400, () => this._startPlayerTurn());
    };

    if (moveAmt > 1) {
      const ENEMY_SPEED = 150;
      this.enemyMoving  = true;
      this.dummyRect.body.setVelocity(
        (dx / dist) * ENEMY_SPEED,
        (dy / dist) * ENEMY_SPEED
      );
      this.time.delayedCall(Math.round(moveAmt / ENEMY_SPEED * 1000), () => {
        this.enemyMoving = false;
        this.dummyRect.body.setVelocity(0, 0);
        afterMove();
      });
    } else {
      afterMove();
    }
  }

  _enemyAttackPhase() {
    const enemyWeapon = this.dummy.weapon;
    const centerDist  = Phaser.Math.Distance.Between(
      this.dummyRect.x, this.dummyRect.y, this.player.x, this.player.y
    );
    if (centerDist - this.dummy.halfSize - PLAYER_HALF <= enemyWeapon.range &&
        this._hasLineOfSight(this.dummyRect.x, this.dummyRect.y, this.player.x, this.player.y)) {
      const { roll, damage: rawDamage, label, color } = this._rollEnemyAttack();

      // Apply player's block ability
      let damage = rawDamage;
      const block = this._getAbility('block');
      if (block && block.value > 0) {
        const absorbed = Math.min(damage, block.value);
        damage -= absorbed;
        this._showFloatingText(this.player.x, this.player.y - 48, `BLOCK ${absorbed}`, '#4fc3f7');
      }

      this._showFloatingText(this.player.x, this.player.y - 28, `Enemy: ${roll}`, '#ffaaaa');
      this._showFloatingText(this.player.x, this.player.y + 8, label, color);

      this.playerHp = Math.max(0, this.playerHp - damage);
      this._drawPlayerHp();

      if (this.playerHp <= 0) {
        this.time.delayedCall(1000, () => this._gameOver());
        return;
      }
    }

    this.time.delayedCall(500, () => this._startPlayerTurn());
  }

  _startPlayerTurn() {
    this.turnCount++;

    if (!this.dummy.alive && this.turnCount - this.dummy.defeatedAtTurn >= 3) {
      this._resurrectDummy();
    }

    const bonus         = this.savedMovement;
    this.savedMovement  = 0;
    this.braceTriggered = false;
    this.effectiveMax   = MAX_DISTANCE + bonus;
    this.distLeft       = this.effectiveMax;
    this.turnEnding     = false;
    this.turnMsg.setText('End of Turn!');
    this.movesText.setText(this._distLabel());
    this._drawRange();
    this._drawAttackRange();
    this._updateDummyOutline();
  }

  _resurrectDummy() {
    this.dummy.hp    = this.dummy.maxHp;
    this.dummy.alive = true;
    this.dummyRect.setFillStyle(0xf5a623).setStrokeStyle(0).setDepth(3);
    this.dummyRect.body.setEnable(true);
    this._updateDummyHp();
    this._showFloatingText(this.dummyRect.x, this.dummyRect.y - 40, 'RESURRECT!', '#ff88ff');
  }

  _drawPlayerHp() {
    this.playerHpGfx.clear();
    const barW = 160, barH = 10;
    const bx = 68, by = 67;

    this.playerHpGfx.fillStyle(0x333333, 1);
    this.playerHpGfx.fillRect(bx, by, barW, barH);

    const pct   = this.playerHp / this.playerMaxHp;
    const color = pct > 0.5 ? 0x44cc44 : pct > 0.25 ? 0xffaa00 : 0xcc2200;
    this.playerHpGfx.fillStyle(color, 1);
    this.playerHpGfx.fillRect(bx, by, barW * pct, barH);

    this.playerHpGfx.lineStyle(1, 0x888888, 0.8);
    this.playerHpGfx.strokeRect(bx, by, barW, barH);
  }

  _gameOver() {
    this.turnEnding = true;
    this.add.rectangle(240, 400, 480, 800, 0x000000, 0.7)
      .setScrollFactor(0).setDepth(40);
    this.add.text(240, 380, 'GAME OVER', {
      fontSize: '44px', color: '#ff2222',
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(41);
    this.add.text(240, 440, 'Refresh to restart', {
      fontSize: '18px', color: '#aaaaaa',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(41);
  }

  // ---------------------------------------------------------------

  _canAttack() {
    if (!this.dummy.alive || this.turnEnding || this.inventoryOpen) return false;
    if (this.distLeft < this.equippedWeapon.cost) return false;
    return this._playerInAttackRange();
  }

  _tryAttack() {
    if (!this._canAttack()) return;

    this.distLeft = Math.max(0, this.distLeft - this.equippedWeapon.cost);
    this.movesText.setText(this._distLabel());
    this._drawRange();

    const { roll, damage, label, color } = this._rollAttack();
    this._showFloatingText(this.dummyRect.x, this.dummyRect.y - 28, `Roll: ${roll}`, '#ffffff');
    this._showFloatingText(this.dummyRect.x, this.dummyRect.y + 8, label, color);
    this._applyDamageToDummy(damage);

    if (this.distLeft <= 0) this._endTurn();
  }

  // Free attack triggered by Brace when enemy enters range
  _doBraceAttack() {
    this._showFloatingText(this.player.x, this.player.y - 52, 'BRACE!', '#88ffff');
    const { roll, damage, label, color } = this._rollAttack();
    this._showFloatingText(this.dummyRect.x, this.dummyRect.y - 28, `Roll: ${roll}`, '#ffffff');
    this._showFloatingText(this.dummyRect.x, this.dummyRect.y + 8, label, color);
    this._applyDamageToDummy(damage);
  }

  _applyDamageToDummy(rawDamage) {
    // Apply dummy's block ability
    let damage = rawDamage;
    const block = this.dummy.weapon?.abilities?.find(a => a.type === 'block');
    if (block && block.value > 0) {
      const absorbed = Math.min(damage, block.value);
      damage -= absorbed;
      this._showFloatingText(this.dummyRect.x, this.dummyRect.y - 48, `BLOCK ${absorbed}`, '#4fc3f7');
    }

    this.dummy.hp = Math.max(0, this.dummy.hp - damage);
    this._updateDummyHp();
    if (this.dummy.hp <= 0) {
      this.dummy.alive         = false;
      this.dummy.defeatedAtTurn = this.turnCount;
      this.dummyRect.setFillStyle(0x555555).setStrokeStyle(0).setDepth(2);
      this.dummyRect.body.setEnable(false);
      this._showFloatingText(this.dummyRect.x, this.dummyRect.y - 54, 'Defeated!', '#ffffff');
      this._drawAttackRange();
    }
  }

  // ---------------------------------------------------------------

  _buildInventoryPanel() {
    const cx = 240;
    const panelW = 380, panelH = 460;
    const panelTop = 170; // screen top of panel (400 - panelH/2)
    const cardW = panelW - 40, cardH = 58;
    const SF = 0, D = 25;

    // Slot screen positions: index 0 = equipped, 1+ = bag
    this.invSlotX  = cx;
    this.invSlotYs = [panelTop + 90, panelTop + 190, panelTop + 260];

    // Which weapon is in each slot (slot 0 is always the equipped weapon)
    this.invSlotWeapons = [
      this.equippedWeapon,
      ...WEAPONS.filter(w => w !== this.equippedWeapon),
    ];

    // --- Static elements ---
    const overlay = this.add.rectangle(cx, 400, 480, 800, 0x000000, 0.65)
      .setScrollFactor(SF).setDepth(D).setInteractive();

    const panelBg = this.add.rectangle(cx, 400, panelW, panelH, 0x1a1a2e)
      .setStrokeStyle(2, 0x4fc3f7).setScrollFactor(SF).setDepth(D);

    const title = this.add.text(cx, panelTop + 26, 'INVENTORY', {
      fontSize: '20px', color: '#4fc3f7', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(SF).setDepth(D);

    const equippedLabel = this.add.text(cx - cardW / 2, panelTop + 66, 'EQUIPPED', {
      fontSize: '11px', color: '#888888',
    }).setOrigin(0, 0.5).setScrollFactor(SF).setDepth(D);

    const divGfx = this.add.graphics().setScrollFactor(SF).setDepth(D);
    divGfx.lineStyle(1, 0x333355, 1);
    divGfx.lineBetween(cx - cardW / 2, panelTop + 150, cx + cardW / 2, panelTop + 150);

    const bagLabel = this.add.text(cx - cardW / 2, panelTop + 163, 'BAG', {
      fontSize: '11px', color: '#888888',
    }).setOrigin(0, 0.5).setScrollFactor(SF).setDepth(D);

    // Slot backgrounds (drop-zone visuals)
    this.invSlotBgs = this.invSlotYs.map((sy, i) =>
      this.add.rectangle(cx, sy, cardW, cardH, 0x111122)
        .setStrokeStyle(1, i === 0 ? 0x4fc3f7 : 0x333355)
        .setScrollFactor(SF).setDepth(D)
    );

    const closeBtn = this.add.text(cx, panelTop + panelH - 30, '[ CLOSE ]', {
      fontSize: '16px', color: '#ff6666', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(SF).setDepth(D).setInteractive();
    closeBtn.on('pointerdown', () => { this.justAttacked = true; this._closeInventory(); });

    // --- Draggable weapon cards ---
    this.invCards = [];
    this.invCardsByWeapon = new Map();

    WEAPONS.forEach(weapon => {
      const si = this.invSlotWeapons.indexOf(weapon);
      const sx = cx;
      const sy = si >= 0 ? this.invSlotYs[si] : -200;

      const cardBg = this.add.rectangle(sx, sy, cardW, cardH, 0x2a2a4a)
        .setStrokeStyle(1, 0x4466aa).setScrollFactor(SF).setDepth(D + 1)
        .setInteractive();

      const nameText = this.add.text(sx - cardW / 2 + 12, sy - 10, weapon.name, {
        fontSize: '15px', color: '#ffffff', stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0, 0.5).setScrollFactor(SF).setDepth(D + 2);

      const statsText = this.add.text(sx + cardW / 2 - 10, sy + 10,
        `Rng:${weapon.range}  Dmg:${weapon.damage}  Cost:${weapon.cost}`, {
          fontSize: '11px', color: '#aaaacc',
        }).setOrigin(1, 0.5).setScrollFactor(SF).setDepth(D + 2);

      const abilityText = this.add.text(sx - cardW / 2 + 12, sy + 10,
        this._abilityLabel(weapon), {
          fontSize: '11px', color: '#ffdd88',
        }).setOrigin(0, 0.5).setScrollFactor(SF).setDepth(D + 2);

      const card = { bg: cardBg, nameText, statsText, abilityText, weapon };
      this.invCards.push(card);
      this.invCardsByWeapon.set(weapon, card);

      cardBg.on('pointerdown', (ptr) => {
        this.justAttacked = true;
        this._startCardDrag(card, ptr);
      });
    });

    this.invElements = [
      overlay, panelBg, title, equippedLabel, divGfx, bagLabel,
      ...this.invSlotBgs, closeBtn,
      ...this.invCards.flatMap(c => [c.bg, c.nameText, c.statsText, c.abilityText]),
    ];

    // Drag state
    this.dragCard     = null;
    this.dragFromSlot = -1;

    // Pointer listeners for drag (added once)
    this.input.on('pointermove', (ptr) => {
      if (this.dragCard && this.inventoryOpen) this._updateCardDrag(ptr);
    });
    this.input.on('pointerup', (ptr) => {
      if (this.dragCard && this.inventoryOpen) this._endCardDrag(ptr);
    });

    this.invElements.forEach(el => el.setVisible(false));
  }

  _startCardDrag(card) {
    this.dragCard     = card;
    this.dragFromSlot = this.invSlotWeapons.indexOf(card.weapon);
    card.bg.setDepth(30);
    card.nameText.setDepth(31);
    card.statsText.setDepth(31);
    card.abilityText.setDepth(31);
  }

  _updateCardDrag(ptr) {
    const card  = this.dragCard;
    const cardW = 340;
    card.bg.setPosition(ptr.x, ptr.y);
    card.nameText.setPosition(ptr.x - cardW / 2 + 12, ptr.y - 10);
    card.statsText.setPosition(ptr.x + cardW / 2 - 10, ptr.y + 10);
    card.abilityText.setPosition(ptr.x - cardW / 2 + 12, ptr.y + 10);
  }

  _endCardDrag(ptr) {
    const card     = this.dragCard;
    this.dragCard  = null;
    const cardW    = 340, cardH = 58;

    const targetSlot = this.invSlotYs.findIndex(sy =>
      Math.abs(ptr.x - this.invSlotX) < cardW / 2 &&
      Math.abs(ptr.y - sy) < cardH / 2
    );

    if (targetSlot >= 0 && targetSlot !== this.dragFromSlot) {
      const from     = this.dragFromSlot;
      const weaponA  = this.invSlotWeapons[from];
      const weaponB  = this.invSlotWeapons[targetSlot];

      this.invSlotWeapons[targetSlot] = weaponA;
      this.invSlotWeapons[from]       = weaponB ?? null;

      this._moveCardToSlot(this.invCardsByWeapon.get(weaponA), targetSlot);
      if (weaponB) this._moveCardToSlot(this.invCardsByWeapon.get(weaponB), from);

      // Slot 0 is always equipped
      if (this.invSlotWeapons[0] !== this.equippedWeapon) {
        this._equipWeapon(this.invSlotWeapons[0]);
      }
    } else {
      this._moveCardToSlot(card, this.dragFromSlot);
    }

    this._refreshInvHighlights();
  }

  _moveCardToSlot(card, slotIdx) {
    const sx = this.invSlotX, sy = this.invSlotYs[slotIdx];
    const cardW = 340;
    card.bg.setPosition(sx, sy).setDepth(26);
    card.nameText.setPosition(sx - cardW / 2 + 12, sy - 10).setDepth(27);
    card.statsText.setPosition(sx + cardW / 2 - 10, sy + 10).setDepth(27);
    card.abilityText.setPosition(sx - cardW / 2 + 12, sy + 10).setDepth(27);
  }

  _openInventory() {
    // Keep slot 0 in sync with equippedWeapon
    const ei = this.invSlotWeapons.indexOf(this.equippedWeapon);
    if (ei > 0) {
      const displaced              = this.invSlotWeapons[0];
      this.invSlotWeapons[0]       = this.equippedWeapon;
      this.invSlotWeapons[ei]      = displaced;
      this._moveCardToSlot(this.invCardsByWeapon.get(this.equippedWeapon), 0);
      if (displaced) this._moveCardToSlot(this.invCardsByWeapon.get(displaced), ei);
    }
    this._refreshInvHighlights();
    this.invElements.forEach(el => el.setVisible(true));
    this.inventoryOpen = true;
  }

  _closeInventory() {
    this.invElements.forEach(el => el.setVisible(false));
    this.inventoryOpen = false;
  }

  _equipWeapon(weapon) {
    this.equippedWeapon = weapon;
    this.weaponText.setText(this._weaponLabel());
    this._drawAttackRange();
    this._updateDummyOutline();
  }

  _refreshInvHighlights() {
    this.invCards.forEach(card => {
      const equipped = card.weapon === this.equippedWeapon;
      card.bg.setFillStyle(equipped ? 0x334488 : 0x2a2a4a);
      card.bg.setStrokeStyle(equipped ? 2 : 1, equipped ? 0x4fc3f7 : 0x4466aa);
      card.nameText.setColor(equipped ? '#ffdd00' : '#ffffff');
    });
  }

  // ---------------------------------------------------------------

  _updateDummyHp() {
    this.dummyHpGfx.clear();
    if (!this.dummy.alive) return;

    const barW = TILE;
    const barH = 5;
    const bx   = this.dummyRect.x - barW / 2;
    const by   = this.dummyRect.y - TILE / 2 - 7;

    this.dummyHpGfx.fillStyle(0x333333, 1);
    this.dummyHpGfx.fillRect(bx, by, barW, barH);

    const pct   = this.dummy.hp / this.dummy.maxHp;
    const color = pct > 0.5 ? 0x44cc44 : pct > 0.25 ? 0xffaa00 : 0xcc2200;
    this.dummyHpGfx.fillStyle(color, 1);
    this.dummyHpGfx.fillRect(bx, by, barW * pct, barH);

    this.dummyLabel.setPosition(this.dummyRect.x, this.dummyRect.y - TILE / 2 - 4);
  }

  _updateDummyOutline() {
    if (!this.dummy.alive) return;
    this.dummyRect.setStrokeStyle(this._canAttack() ? 2 : 0, 0xffdd00);
  }

  _showFloatingText(x, y, text, color = '#ffffff') {
    const t = this.add.text(x, y, text, {
      fontSize: '18px', color,
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20);

    this.tweens.add({
      targets: t,
      y: y - 50,
      alpha: 0,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => t.destroy(),
    });
  }

  // ---------------------------------------------------------------

  update(_time, delta) {
    const body = this.player.body;

    // Update fog whenever player tile changes
    this._updateFog();

    // Keep dummy label/HP bar tracking the dummy during its movement
    if (this.enemyMoving) {
      this.dummyLabel.setPosition(this.dummyRect.x, this.dummyRect.y - TILE / 2 - 4);
      this._updateDummyHp();
    }

    // Block movement while inventory is open
    if (this.inventoryOpen) {
      body.setVelocity(0, 0);
      return;
    }

    // Track actual distance traveled
    if (!this.turnEnding) {
      const dx = this.player.x - this.lastX;
      const dy = this.player.y - this.lastY;
      const actualDist = Math.sqrt(dx * dx + dy * dy);
      if (actualDist > 0) {
        this.distLeft = Math.max(0, this.distLeft - actualDist);
        this.movesText.setText(this._distLabel());
        this._drawRange();
        this._drawAttackRange();
        this._updateDummyOutline();
        if (this.distLeft <= 0) this._endTurn();
      }
    }
    this.lastX = this.player.x;
    this.lastY = this.player.y;

    if (this.turnEnding) {
      body.setVelocity(0, 0);
      return;
    }

    // Read input direction
    let vx = 0, vy = 0;

    if (this.cursors.left.isDown  || this.wasd.left.isDown)  vx = -SPEED;
    else if (this.cursors.right.isDown || this.wasd.right.isDown) vx =  SPEED;
    if (this.cursors.up.isDown    || this.wasd.up.isDown)    vy = -SPEED;
    else if (this.cursors.down.isDown  || this.wasd.down.isDown)  vy =  SPEED;

    // Joystick overrides keyboard
    if (this.joy.active) {
      const norm = Math.sqrt(this.joy.dx ** 2 + this.joy.dy ** 2);
      if (norm > JOY_RADIUS * 0.1) {
        vx = (this.joy.dx / JOY_RADIUS) * SPEED;
        vy = (this.joy.dy / JOY_RADIUS) * SPEED;
      } else {
        vx = 0; vy = 0;
      }
    }

    // Normalize diagonal
    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

    if (this.distLeft > 0 && (vx !== 0 || vy !== 0)) {
      const frameSpeed = Math.sqrt(vx * vx + vy * vy);
      const frameDist  = frameSpeed * (delta / 1000);
      if (frameDist > this.distLeft) {
        const scale = this.distLeft / frameDist;
        vx *= scale;
        vy *= scale;
      }
      body.setVelocity(vx, vy);
    } else {
      body.setVelocity(0, 0);
    }
  }

  // ---------------------------------------------------------------

  _drawAttackRange() {
    this.atkRangeGfx.clear();
    if (!this.dummy.alive) return;

    this.atkRangeGfx.lineStyle(1.5, 0xff4444, 0.5);
    this.atkRangeGfx.strokeCircle(
      this.player.x, this.player.y,
      this.equippedWeapon.range + PLAYER_HALF
    );
  }

  // ---------------------------------------------------------------

  _drawRange() {
    this.rangeGfx.clear();
    if (this.turnEnding || this.distLeft <= 0) return;

    const x = this.player.x;
    const y = this.player.y;
    const r = this.distLeft + (TILE - 4) / 2;

    this.rangeGfx.fillStyle(0x4fc3f7, 0.10);
    this.rangeGfx.fillCircle(x, y, r);
    this.rangeGfx.lineStyle(2, 0x4fc3f7, 0.5);
    this.rangeGfx.strokeCircle(x, y, r);
  }

  // ---------------------------------------------------------------

  _drawJoystick(bx, by, dx, dy, active) {
    this.joyGfx.clear();
    this.joyGfx.lineStyle(2, 0xffffff, active ? 0.5 : 0.2);
    this.joyGfx.strokeCircle(bx, by, JOY_RADIUS);
    this.joyGfx.fillStyle(0xffffff, active ? 0.1 : 0.05);
    this.joyGfx.fillCircle(bx, by, JOY_RADIUS);
    this.joyGfx.fillStyle(0xe94560, active ? 0.9 : 0.3);
    this.joyGfx.fillCircle(bx + dx, by + dy, JOY_KNOB_RADIUS);
    this.joyGfx.lineStyle(2, 0xffffff, active ? 0.6 : 0.2);
    this.joyGfx.strokeCircle(bx + dx, by + dy, JOY_KNOB_RADIUS);
  }
}
