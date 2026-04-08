// Tile size in pixels
const TILE = 32;

// Moves allowed per turn
const MAX_MOVES = 4;

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

// Virtual joystick config
const JOY_RADIUS = 50;
const JOY_KNOB_RADIUS = 22;
const JOY_MARGIN = 80;

// Hold-to-repeat timing (ms)
const REPEAT_INITIAL = 300; // delay before first repeat
const REPEAT_RATE    = 180; // interval between repeats after that

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    // --- Draw map (visual only — collision checked via MAP array) ---
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
        } else {
          const shade = (row + col) % 2 === 0 ? 0x16213e : 0x0f3460;
          gfx.fillStyle(shade, 1);
          gfx.fillRect(x, y, TILE, TILE);
        }
      }
    }

    // --- Player ---
    this.tileX = Math.floor(MAP_COLS / 2);
    this.tileY = Math.floor(MAP_ROWS / 2);
    this.player = this.add.rectangle(
      this.tileX * TILE + TILE / 2,
      this.tileY * TILE + TILE / 2,
      TILE - 4, TILE - 4, 0xe94560
    );

    // --- Turn state ---
    this.movesLeft  = MAX_MOVES;
    this.moving     = false; // true while tween is playing
    this.turnEnding = false; // true during the end-of-turn pause

    // --- Camera ---
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setFollowOffset(0, -160);

    // --- UI ---
    this.movesText = this.add.text(240, 20, this._movesLabel(), {
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

    // Hold-to-repeat tracking
    this.moveDir     = { x: 0, y: 0 };
    this.moveHeld    = 0;
    this.repeatCount = 0;

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

  _movesLabel() {
    return `Moves: ${this.movesLeft} / ${MAX_MOVES}`;
  }

  tryMove(dx, dy) {
    if (this.moving || this.turnEnding || this.movesLeft <= 0) return;

    const nx = this.tileX + dx;
    const ny = this.tileY + dy;

    // Map bounds + wall check
    if (nx < 0 || nx >= MAP_COLS || ny < 0 || ny >= MAP_ROWS) return;
    if (MAP[ny][nx] === 1) return;

    this.tileX = nx;
    this.tileY = ny;
    this.movesLeft--;
    this.movesText.setText(this._movesLabel());
    this.moving = true;

    this.tweens.add({
      targets: this.player,
      x: nx * TILE + TILE / 2,
      y: ny * TILE + TILE / 2,
      duration: 110,
      ease: 'Power2',
      onComplete: () => {
        this.moving = false;
        if (this.movesLeft === 0) this._endTurn();
      },
    });
  }

  _endTurn() {
    this.turnEnding = true;
    this.turnMsg.setVisible(true);
    this.time.delayedCall(1000, () => {
      this.turnMsg.setVisible(false);
      this.movesLeft = MAX_MOVES;
      this.movesText.setText(this._movesLabel());
      this.turnEnding = false;
    });
  }

  // ---------------------------------------------------------------

  update(_time, delta) {
    // Read cardinal direction from keyboard or joystick
    let dx = 0, dy = 0;

    if (this.cursors.left.isDown  || this.wasd.left.isDown)  dx = -1;
    else if (this.cursors.right.isDown || this.wasd.right.isDown) dx =  1;

    if (dx === 0) {
      if (this.cursors.up.isDown   || this.wasd.up.isDown)   dy = -1;
      else if (this.cursors.down.isDown  || this.wasd.down.isDown)  dy =  1;
    }

    // Joystick: snap to dominant axis
    if (this.joy.active) {
      const ax = Math.abs(this.joy.dx), ay = Math.abs(this.joy.dy);
      const threshold = JOY_RADIUS * 0.35;
      if (ax > threshold || ay > threshold) {
        if (ax >= ay) { dx = this.joy.dx > 0 ? 1 : -1; dy = 0; }
        else          { dy = this.joy.dy > 0 ? 1 : -1; dx = 0; }
      } else {
        dx = 0; dy = 0;
      }
    }

    // Hold-to-repeat: move immediately on direction change, then repeat after delays
    const sameDir = dx === this.moveDir.x && dy === this.moveDir.y;

    if (dx !== 0 || dy !== 0) {
      if (!sameDir) {
        this.moveDir     = { x: dx, y: dy };
        this.moveHeld    = 0;
        this.repeatCount = 0;
        this.tryMove(dx, dy);
      } else {
        this.moveHeld += delta;
        const newCount = this.moveHeld < REPEAT_INITIAL
          ? 0
          : Math.floor((this.moveHeld - REPEAT_INITIAL) / REPEAT_RATE) + 1;
        if (newCount > this.repeatCount) {
          this.repeatCount = newCount;
          this.tryMove(dx, dy);
        }
      }
    } else if (this.moveDir.x !== 0 || this.moveDir.y !== 0) {
      this.moveDir     = { x: 0, y: 0 };
      this.moveHeld    = 0;
      this.repeatCount = 0;
    }
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
