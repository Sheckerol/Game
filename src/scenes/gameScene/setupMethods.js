import { generateMap, expandCorridors } from '../../mapGen.js';
import {
  DUMMY_HP,
  FOG_COLOR,
  JOY_MARGIN,
  JOY_RADIUS,
  MAP_COLS,
  MAP_ROWS,
  MAX_DISTANCE,
  PLAYER_HALF,
  PLAYER_HP,
  TILE,
  WEAPONS,
  WORLD_H,
  WORLD_W,
} from './constants.js';

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHAR_COLORS = [0xe94560, 0x3b8eff, 0x44cc66, 0xffdd44];
const CHAR_IDS = ['A', 'B', 'C', 'D'];
const CHAR_STARTING_WEAPON_IDX = [0, 1, 2, 2];

const setupMethods = {
  create() {
    this.uiElements = [];
    this._setupMap();
    this._setupPartyAndDummy();
    this._setupTurnAndCombatState();
    this._setupCameraAndUi();
    this._setupControls();
    this._setupFogAndDebug();
    this._buildInventoryPanel();
    this._setupUiCamera();
  },

  _setupMap() {
    this.mapSeed = 2762136374;
    console.log(`[MapSeed] ${this.mapSeed}`);
    const rng = mulberry32(this.mapSeed);
    const { grid, roomGrid, rooms, corridors, playerStart, enemyStart, debugRooms, debugCorridors } = generateMap({ rng });
    this.playerStart = playerStart;
    this.enemyStart = enemyStart;
    this.mapGrid = grid;
    this.roomGrid = roomGrid;
    this.rooms = rooms;
    this.debugRooms = debugRooms;
    this.debugCorridors = debugCorridors;

    expandCorridors(corridors, grid);
    this.expandedCorridors = corridors.map(c => ({ ...c }));
    this.fogBoxes = [...rooms.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h })), ...corridors];
    this.unionFogBoxes = this._computeUnionFogBoxes();
    this.fogBoxes.push(...this.unionFogBoxes);
    this.fogBoxes = this._pruneFullyOverlappedBoxes(this.fogBoxes);

    this.unionRooms = this.unionFogBoxes.map((box, i) => ({
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      cx: Math.floor(box.x + box.w / 2),
      cy: Math.floor(box.y + box.h / 2),
      isUnion: true,
      unionIndex: i,
    }));
    this.rooms = [...rooms, ...this.unionRooms];
    this.allRoomBoxes = [
      ...debugRooms.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
      ...this.unionRooms.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
    ];

    this.wallGroup = this.physics.add.staticGroup();
    const floorGfx = this.add.graphics().setDepth(0);
    const wallGfx = this.add.graphics().setDepth(2);

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

    this.wallRects = this.wallGroup.getChildren().map(w => new Phaser.Geom.Rectangle(w.x - TILE / 2, w.y - TILE / 2, TILE, TILE));
    this._losLine = new Phaser.Geom.Line();
  },

  _setupPartyAndDummy() {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    const startR = this.playerStart[0];
    const startC = this.playerStart[1];
    const tiles = this._findPartySpawnTiles(startR, startC, 4);

    this.chars = tiles.map((t, i) => {
      const sprite = this.add
        .circle(t.c * TILE + TILE / 2, t.r * TILE + TILE / 2, PLAYER_HALF, CHAR_COLORS[i])
        .setDepth(6)
        .setInteractive();
      this.physics.add.existing(sprite);
      sprite.body.setCircle(PLAYER_HALF);
      sprite.body.setCollideWorldBounds(true);
      this.physics.add.collider(sprite, this.wallGroup);

      const weapon = WEAPONS[CHAR_STARTING_WEAPON_IDX[i]];
      const char = {
        id: CHAR_IDS[i],
        color: CHAR_COLORS[i],
        sprite,
        hpGfx: this.add.graphics().setDepth(7),
        hp: PLAYER_HP,
        maxHp: PLAYER_HP,
        inventory: [weapon, null, null],
        invCards: [],
        invCardsByWeapon: new Map(),
        distLeft: MAX_DISTANCE,
        effectiveMax: MAX_DISTANCE,
        savedMovement: 0,
        lastX: sprite.x,
        lastY: sprite.y,
        lastFogTile: { r: -1, c: -1 },
        alive: true,
      };

      sprite.on('pointerdown', () => {
        this.justAttacked = true;
        this._setActiveChar(i);
      });

      return char;
    });

    this.activeIdx = 0;

    for (let i = 0; i < this.chars.length; i++) {
      for (let j = i + 1; j < this.chars.length; j++) {
        this.physics.add.collider(this.chars[i].sprite, this.chars[j].sprite);
      }
    }

    this.dummy = {
      hp: DUMMY_HP,
      maxHp: DUMMY_HP,
      alive: true,
      halfSize: (TILE - 4) / 2,
      weapon: WEAPONS[1],
      defeatedAtTurn: -1,
      turnsSinceSeen: 2,
    };
    this.dummyRect = this.add
      .circle(this.enemyStart[1] * TILE + TILE / 2, this.enemyStart[0] * TILE + TILE / 2, this.dummy.halfSize, 0xf5a623)
      .setDepth(3)
      .setInteractive();
    this.physics.add.existing(this.dummyRect);
    this.dummyRect.body.setCircle(this.dummy.halfSize);
    this.dummyRect.body.pushable = false;
    for (const c of this.chars) this.physics.add.collider(c.sprite, this.dummyRect);
    this.physics.add.collider(this.dummyRect, this.wallGroup);

    this.justAttacked = false;
    this.dummyRect.on('pointerdown', () => {
      this.justAttacked = true;
      this._tryAttack();
    });

    this.dummyLabel = this.add
      .text(this.dummyRect.x, this.dummyRect.y - TILE / 2 - 8, `DUMMY [${this.dummy.weapon.name}]`, {
        fontSize: '9px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(4);

    this.dummyHpGfx = this.add.graphics().setDepth(4);
    this.dummyRangeGfx = this.add.graphics().setDepth(1);
    this._updateDummyHp();

    this.enemyMarker = this.add
      .text(0, 0, '?', {
        fontSize: '18px',
        color: '#f5a623',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(6)
      .setVisible(false);
    this._enemyVisible = false;
    this._enemySeenThisTurn = false;
  },

  _setupTurnAndCombatState() {
    this.turnCount = 0;
    this.turnEnding = false;
    this.enemyMoving = false;
    this.braceTriggered = false;
    this.inventoryOpen = false;

    this.rangeGfx = this.add.graphics().setDepth(1);
    this.atkRangeGfx = this.add.graphics().setDepth(1);
    this._drawRange();
    this._drawAttackRange();
  },

  _setupCameraAndUi() {
    this.cameras.main.startFollow(this.chars[0].sprite, true, 0.1, 0.1);
    this.cameras.main.setFollowOffset(0, -160);
    this.cameras.main.setBackgroundColor(FOG_COLOR);

    const W = this.scale.width;
    const H = this.scale.height;
    this.W = W;
    this.H = H;

    this.movesText = this._addUi(this.add
      .text(W / 2, 20, this._distLabel(), {
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(10));

    this.weaponText = this._addUi(this.add
      .text(W / 2, 46, this._weaponLabel(), {
        fontSize: '13px',
        color: '#ffdd00',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(10));

    this._syncHpGraphics();
    this.events.on('postupdate', this._syncHpGraphics, this);

    this.turnMsg = this._addUi(this.add
      .text(W / 2, H / 2, 'End of Turn!', {
        fontSize: '28px',
        color: '#f5a623',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10)
      .setVisible(false));

    this.endTurnBtn = this._addUi(this.add.circle(W - JOY_MARGIN, H - JOY_MARGIN, 44, 0x2266cc).setScrollFactor(0).setDepth(10).setInteractive());
    this._addUi(this.add
      .text(W - JOY_MARGIN, H - JOY_MARGIN, 'END\nTURN', {
        fontSize: '13px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(11));
    this.endTurnBtn.on('pointerdown', () => {
      this.justAttacked = true;
      this._endTurnManual();
    });

    this.bagBtn = this._addUi(this.add.circle(W / 2, H - JOY_MARGIN, 44, 0x446644).setScrollFactor(0).setDepth(10).setInteractive());
    this._addUi(this.add
      .text(W / 2, H - JOY_MARGIN, 'BAG', {
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(11));
    this.bagBtn.on('pointerdown', () => {
      this.justAttacked = true;
      this.inventoryOpen ? this._closeInventory() : this._openInventory();
    });
  },

  _addUi(obj) {
    this.uiElements.push(obj);
    if (this.uiCam) {
      this.cameras.main.ignore(obj);
    }
    return obj;
  },

  _setupUiCamera() {
    this.uiCam = this.cameras.add(0, 0, this.W, this.H);
    this.uiCam.setScroll(0, 0);
    this.uiElements.forEach(obj => this.cameras.main.ignore(obj));
    this.children.list.forEach(obj => {
      if (!this.uiElements.includes(obj)) {
        this.uiCam.ignore(obj);
      }
    });
  },

  _setupControls() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    this.input.addPointer(1);
    this.joy = { active: false, pointerId: null, baseX: 0, baseY: 0, dx: 0, dy: 0 };
    this.joyGfx = this._addUi(this.add.graphics().setScrollFactor(0).setDepth(10));
    this._drawJoystick(JOY_MARGIN, this.H - JOY_MARGIN, 0, 0, false);

    this._pinchDist = null;

    // Mouse wheel zoom for desktop
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      const zoomDelta = deltaY > 0 ? 0.9 : 1.1;
      const zoom = Phaser.Math.Clamp(this.cameras.main.zoom * zoomDelta, 0.25, 3);
      this.cameras.main.setZoom(zoom);
      this.cameras.main.setFollowOffset(0, -160 / zoom);
    });

    this.input.on('pointerdown', ptr => {
      if (this.justAttacked) {
        this.justAttacked = false;
        return;
      }
      if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
        const p1 = this.input.pointer1;
        const p2 = this.input.pointer2;
        this._pinchDist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        this.joy.active = false;
        this.joy.pointerId = null;
        this.joy.dx = 0;
        this.joy.dy = 0;
        return;
      }
      if (ptr.x < this.scale.width / 2 && !this.joy.active && !this.inventoryOpen) {
        this.joy.active = true;
        this.joy.pointerId = ptr.id;
        this.joy.baseX = ptr.x;
        this.joy.baseY = ptr.y;
        this.joy.dx = 0;
        this.joy.dy = 0;
      }
    });

    this.input.on('pointermove', ptr => {
      if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
        const p1 = this.input.pointer1;
        const p2 = this.input.pointer2;
        const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (this._pinchDist !== null) {
          const zoom = Phaser.Math.Clamp(this.cameras.main.zoom * (dist / this._pinchDist), 0.25, 3);
          this.cameras.main.setZoom(zoom);
          this.cameras.main.setFollowOffset(0, -160 / zoom);
        }
        this._pinchDist = dist;
        return;
      }
      this._pinchDist = null;

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

    this.input.on('pointerup', ptr => {
      if (!this.input.pointer1.isDown || !this.input.pointer2.isDown) this._pinchDist = null;
      if (ptr.id === this.joy.pointerId) {
        this.joy.active = false;
        this.joy.pointerId = null;
        this.joy.dx = 0;
        this.joy.dy = 0;
        this._drawJoystick(JOY_MARGIN, this.scale.height - JOY_MARGIN, 0, 0, false);
      }
    });
  },

  _setupFogAndDebug() {
    this.playerFog = this._makeFogState();
    this.fogGfx = this.add.graphics().setDepth(5);
    this.fogAnimations = new Map();
    this.fogFillAnimations = new Map();

    this.debugMode = 0;
    this.debugGfx = this.add.graphics().setDepth(15);

    const dbgBtn = this._addUi(this.add.circle(30, 105, 20, 0x553311).setScrollFactor(0).setDepth(10).setInteractive());
    this._addUi(this.add
      .text(30, 105, 'DBG', {
        fontSize: '9px',
        color: '#ffcc88',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(11));
    dbgBtn.on('pointerdown', () => this._toggleDebugMode());

    this.input.keyboard.on('keydown-P', () => this._toggleDebugMode());

    this._fogDirty = false;
    for (const c of this.chars) {
      if (c.alive) this._updateFogForChar(c);
    }
    this._redrawFog();
  },

  _toggleDebugMode() {
    this.debugMode = (this.debugMode + 1) % 2;
    if (this.debugMode === 0) this.debugGfx.clear();
    else this._drawDebug();
  },

  _pruneFullyOverlappedBoxes(boxes) {
    const normalized = [];
    const seen = new Set();

    for (const box of boxes) {
      if (!box || box.w <= 0 || box.h <= 0) continue;
      const key = `${box.x},${box.y},${box.w},${box.h}`;
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push(box);
    }

    const keep = [];
    for (let i = 0; i < normalized.length; i++) {
      const a = normalized[i];
      let covered = false;
      for (let j = 0; j < normalized.length; j++) {
        if (i === j) continue;
        if (this._rectContainsRect(a, normalized[j])) {
          covered = true;
          break;
        }
      }
      if (!covered) keep.push(a);
    }

    return keep;
  },

  _rectContainsRect(inner, outer) {
    return (
      inner.x >= outer.x &&
      inner.y >= outer.y &&
      inner.x + inner.w <= outer.x + outer.w &&
      inner.y + inner.h <= outer.y + outer.h
    );
  },

  _findPartySpawnTiles(startR, startC, count) {
    const tiles = [{ r: startR, c: startC }];
    const seen = new Set([`${startR},${startC}`]);
    for (let ring = 1; tiles.length < count && ring < 8; ring++) {
      for (let dr = -ring; dr <= ring && tiles.length < count; dr++) {
        for (let dc = -ring; dc <= ring && tiles.length < count; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const r = startR + dr;
          const c = startC + dc;
          const key = `${r},${c}`;
          if (seen.has(key)) continue;
          if (r < 0 || c < 0 || r >= this.mapGrid.length || c >= this.mapGrid[0].length) continue;
          if (this.mapGrid[r][c] !== 0) continue;
          seen.add(key);
          tiles.push({ r, c });
        }
      }
    }
    while (tiles.length < count) tiles.push({ r: startR, c: startC });
    return tiles;
  },
};

export default setupMethods;
