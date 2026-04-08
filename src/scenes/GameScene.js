// Tile size in pixels
const TILE = 32;

// Movement budget per turn (pixels)
const MAX_DISTANCE = 160;

// Player speed in pixels/second
const SPEED = 160;

// Map layout: 1 = wall, 0 = floor
// 20 columns x 25 rows
const MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,1,1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,1],
  [1,0,0,1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1],
  [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1],
  [1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const MAP_COLS = MAP[0].length;
const MAP_ROWS = MAP.length;
const WORLD_W  = MAP_COLS * TILE;
const WORLD_H  = MAP_ROWS * TILE;

// Virtual joystick config
const JOY_RADIUS     = 50;
const JOY_KNOB_RADIUS = 22;
const JOY_MARGIN     = 80;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    // --- Draw map ---
    this.wallGroup = this.physics.add.staticGroup();
    const gfx = this.add.graphics();

    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        const x = col * TILE;
        const y = row * TILE;
        if (MAP[row][col] === 1) {
          gfx.fillStyle(0x3d405b, 1);
          gfx.fillRect(x, y, TILE, TILE);
          gfx.lineStyle(1, 0x2b2d42, 1);
          gfx.strokeRect(x, y, TILE, TILE);

          const wall = this.add.rectangle(x + TILE / 2, y + TILE / 2, TILE, TILE);
          this.physics.add.existing(wall, true);
          this.wallGroup.add(wall);
        } else {
          const shade = (row + col) % 2 === 0 ? 0x16213e : 0x0f3460;
          gfx.fillStyle(shade, 1);
          gfx.fillRect(x, y, TILE, TILE);
        }
      }
    }

    // --- Player ---
    const startCol = Math.floor(MAP_COLS / 2);
    const startRow = Math.floor(MAP_ROWS / 2);
    this.player = this.add.rectangle(
      startCol * TILE + TILE / 2,
      startRow * TILE + TILE / 2,
      TILE - 4, TILE - 4, 0xe94560
    );
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.wallGroup);
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    // --- Turn state ---
    this.distLeft   = MAX_DISTANCE;
    this.turnEnding = false;
    this.lastX = this.player.x;
    this.lastY = this.player.y;

    // --- Range indicator (drawn below player in world space) ---
    this.rangeGfx = this.add.graphics().setDepth(0);
    this._drawRange();

    // --- Camera ---
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setFollowOffset(0, -160);

    // --- UI ---
    this.movesText = this.add.text(240, 20, this._distLabel(), {
      fontSize: '18px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(10);

    this.turnMsg = this.add.text(240, 400, 'End of Turn!', {
      fontSize: '28px',
      color: '#f5a623',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10).setVisible(false);

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
      if (ptr.x < 240 && !this.joy.active) {
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
  }

  // ---------------------------------------------------------------

  _distLabel() {
    return `Move: ${Math.ceil(this.distLeft)} / ${MAX_DISTANCE}`;
  }

  _endTurn() {
    this.turnEnding = true;
    this.player.body.setVelocity(0, 0);
    this._drawRange(); // hide range while turn is ending
    this.turnMsg.setVisible(true);
    this.time.delayedCall(1000, () => {
      this.turnMsg.setVisible(false);
      this.distLeft   = MAX_DISTANCE;
      this.turnEnding = false;
      this.movesText.setText(this._distLabel());
      this._drawRange(); // restore full range circle
    });
  }

  // ---------------------------------------------------------------

  update(_time, delta) {
    const body = this.player.body;

    // --- Track actual distance traveled (post-physics position from last frame) ---
    // This means walls blocking movement don't eat the budget.
    if (!this.turnEnding) {
      const dx = this.player.x - this.lastX;
      const dy = this.player.y - this.lastY;
      const actualDist = Math.sqrt(dx * dx + dy * dy);
      if (actualDist > 0) {
        this.distLeft = Math.max(0, this.distLeft - actualDist);
        this.movesText.setText(this._distLabel());
        this._drawRange();
        if (this.distLeft <= 0) {
          this._endTurn();
        }
      }
    }
    this.lastX = this.player.x;
    this.lastY = this.player.y;

    if (this.turnEnding) {
      body.setVelocity(0, 0);
      return;
    }

    // --- Read input direction ---
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
      // Scale velocity on the final frame so we don't overshoot the budget
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

  _drawRange() {
    this.rangeGfx.clear();
    if (this.turnEnding || this.distLeft <= 0) return;

    const x = this.player.x;
    const y = this.player.y;
    const r = this.distLeft;

    // Soft filled area
    this.rangeGfx.fillStyle(0x4fc3f7, 0.10);
    this.rangeGfx.fillCircle(x, y, r);

    // Ring outline
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
