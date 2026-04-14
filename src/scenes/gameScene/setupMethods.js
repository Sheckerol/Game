import { generateMap, expandCorridors } from '../../mapGen.js';
import {
  DUMMY_HP,
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

const setupMethods = {
  create() {
    this._setupMap();
    this._setupPlayerAndDummy();
    this._setupTurnAndCombatState();
    this._setupCameraAndUi();
    this._setupControls();
    this._setupFogAndDebug();
    this._buildInventoryPanel();
  },

  _setupMap() {
    this.mapSeed = 469139532;
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

  _setupPlayerAndDummy() {
    this.player = this.add
      .circle(this.playerStart[1] * TILE + TILE / 2, this.playerStart[0] * TILE + TILE / 2, PLAYER_HALF, 0xe94560)
      .setDepth(6);
    this.physics.add.existing(this.player);
    this.player.body.setCircle(PLAYER_HALF);
    this.player.body.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.wallGroup);
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    this.dummy = {
      hp: DUMMY_HP,
      maxHp: DUMMY_HP,
      alive: true,
      halfSize: (TILE - 4) / 2,
      weapon: WEAPONS[1],
      defeatedAtTurn: -1,
    };
    this.dummyRect = this.add
      .circle(this.enemyStart[1] * TILE + TILE / 2, this.enemyStart[0] * TILE + TILE / 2, this.dummy.halfSize, 0xf5a623)
      .setDepth(3)
      .setInteractive();
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

    this.dummyLabel = this.add
      .text(this.dummyRect.x, this.dummyRect.y - TILE / 2 - 4, `DUMMY [${this.dummy.weapon.name}]`, {
        fontSize: '9px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(4);

    this.dummyHpGfx = this.add.graphics().setDepth(4);
    this._updateDummyHp();
  },

  _setupTurnAndCombatState() {
    this.turnCount = 0;
    this.distLeft = MAX_DISTANCE;
    this.effectiveMax = MAX_DISTANCE;
    this.savedMovement = 0;
    this.turnEnding = false;
    this.enemyMoving = false;
    this.braceTriggered = false;
    this.lastX = this.player.x;
    this.lastY = this.player.y;

    this.playerHp = PLAYER_HP;
    this.playerMaxHp = PLAYER_HP;

    this.equippedWeapon = WEAPONS[1];
    this.inventoryOpen = false;

    this.rangeGfx = this.add.graphics().setDepth(1);
    this.atkRangeGfx = this.add.graphics().setDepth(1);
    this._drawRange();
    this._drawAttackRange();
  },

  _setupCameraAndUi() {
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setFollowOffset(0, -160);

    const W = this.scale.width;
    const H = this.scale.height;
    this.W = W;
    this.H = H;

    this.movesText = this.add
      .text(W / 2, 20, this._distLabel(), {
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(10);

    this.weaponText = this.add
      .text(W / 2, 46, this._weaponLabel(), {
        fontSize: '13px',
        color: '#ffdd00',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(10);

    this.add
      .text(50, 72, 'HP', {
        fontSize: '12px',
        color: '#aaffaa',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(10);
    this.playerHpGfx = this.add.graphics().setScrollFactor(0).setDepth(10);
    this._drawPlayerHp();

    this.turnMsg = this.add
      .text(W / 2, H / 2, 'End of Turn!', {
        fontSize: '28px',
        color: '#f5a623',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10)
      .setVisible(false);

    this.endTurnBtn = this.add.circle(W - JOY_MARGIN, H - JOY_MARGIN, 44, 0x2266cc).setScrollFactor(0).setDepth(10).setInteractive();
    this.add
      .text(W - JOY_MARGIN, H - JOY_MARGIN, 'END\nTURN', {
        fontSize: '13px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(11);
    this.endTurnBtn.on('pointerdown', () => {
      this.justAttacked = true;
      this._endTurnManual();
    });

    this.bagBtn = this.add.circle(W / 2, H - JOY_MARGIN, 44, 0x446644).setScrollFactor(0).setDepth(10).setInteractive();
    this.add
      .text(W / 2, H - JOY_MARGIN, 'BAG', {
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(11);
    this.bagBtn.on('pointerdown', () => {
      this.justAttacked = true;
      this.inventoryOpen ? this._closeInventory() : this._openInventory();
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
    this.joyGfx = this.add.graphics().setScrollFactor(0).setDepth(10);
    this._drawJoystick(JOY_MARGIN, this.H - JOY_MARGIN, 0, 0, false);

    this._pinchDist = null;

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

    this.debugMode = 0;
    this.debugGfx = this.add.graphics().setDepth(15);

    const dbgBtn = this.add.circle(30, 105, 20, 0x553311).setScrollFactor(0).setDepth(10).setInteractive();
    this.add
      .text(30, 105, 'DBG', {
        fontSize: '9px',
        color: '#ffcc88',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(11);
    dbgBtn.on('pointerdown', () => this._toggleDebugMode());

    this.input.keyboard.on('keydown-P', () => this._toggleDebugMode());

    this._updateFog(this.player.x, this.player.y, this.playerFog);
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
};

export default setupMethods;
