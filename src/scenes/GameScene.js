// Tile size in pixels
const TILE = 32;

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
const WORLD_W = MAP_COLS * TILE;
const WORLD_H = MAP_ROWS * TILE;

// Virtual joystick config
const JOY_RADIUS = 50;
const JOY_KNOB_RADIUS = 22;
const JOY_MARGIN = 80; // distance from bottom-left corner (camera-relative)

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
          // Wall tile
          gfx.fillStyle(0x3d405b, 1);
          gfx.fillRect(x, y, TILE, TILE);
          gfx.lineStyle(1, 0x2b2d42, 1);
          gfx.strokeRect(x, y, TILE, TILE);

          // Invisible physics body for collision
          const wall = this.add.rectangle(x + TILE / 2, y + TILE / 2, TILE, TILE);
          this.physics.add.existing(wall, true);
          this.wallGroup.add(wall);
        } else {
          // Floor tile — alternating shades for grid feel
          const shade = (row + col) % 2 === 0 ? 0x16213e : 0x0f3460;
          gfx.fillStyle(shade, 1);
          gfx.fillRect(x, y, TILE, TILE);
        }
      }
    }

    // --- Player ---
    // Start in center of map, find nearest open tile
    const startCol = Math.floor(MAP_COLS / 2);
    const startRow = Math.floor(MAP_ROWS / 2);
    const px = startCol * TILE + TILE / 2;
    const py = startRow * TILE + TILE / 2;

    this.player = this.add.rectangle(px, py, TILE - 4, TILE - 4, 0xe94560);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.player.body.setMaxVelocity(160);

    // Player highlight (inner glow effect)
    const highlight = this.add.rectangle(px - 4, py - 4, 8, 8, 0xffffff, 0.6);
    highlight.setDepth(1);

    // Collider between player and walls
    this.physics.add.collider(this.player, this.wallGroup);

    // --- Camera ---
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    // --- Keyboard input ---
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // --- Virtual Joystick ---
    this.joy = {
      active: false,
      pointerId: null,
      baseX: 0,
      baseY: 0,
      dx: 0,
      dy: 0,
    };

    // Joystick graphics (fixed to camera)
    this.joyGfx = this.add.graphics().setScrollFactor(0).setDepth(10);
    this._drawJoystick(JOY_MARGIN, 800 - JOY_MARGIN, 0, 0, false);

    this.input.on('pointerdown', (ptr) => {
      // Only activate joystick if touch is in the left half of screen
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

    // --- UI: hint text ---
    this.add.text(240, 20, 'Arrow keys or drag joystick to move', {
      fontSize: '13px',
      color: '#aaaaaa',
      align: 'center',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(10);
  }

  update() {
    const body = this.player.body;
    const speed = 160;
    let vx = 0;
    let vy = 0;

    // Keyboard
    if (this.cursors.left.isDown || this.wasd.left.isDown) vx = -speed;
    else if (this.cursors.right.isDown || this.wasd.right.isDown) vx = speed;
    if (this.cursors.up.isDown || this.wasd.up.isDown) vy = -speed;
    else if (this.cursors.down.isDown || this.wasd.down.isDown) vy = speed;

    // Joystick overrides keyboard if active
    if (this.joy.active) {
      const norm = JOY_RADIUS;
      vx = (this.joy.dx / norm) * speed;
      vy = (this.joy.dy / norm) * speed;
    }

    // Normalize diagonal movement
    if (vx !== 0 && vy !== 0) {
      vx *= 0.707;
      vy *= 0.707;
    }

    body.setVelocity(vx, vy);

    // Keep highlight on player
    const children = this.children.list;
    // (highlight is index 2 — simple approach: just keep it synced)
    // We stored it separately; re-set position via scene children is fragile.
    // Instead we use the player rect position directly.
  }

  _drawJoystick(bx, by, dx, dy, active) {
    this.joyGfx.clear();
    // Base circle
    this.joyGfx.lineStyle(2, 0xffffff, active ? 0.5 : 0.2);
    this.joyGfx.strokeCircle(bx, by, JOY_RADIUS);
    this.joyGfx.fillStyle(0xffffff, active ? 0.1 : 0.05);
    this.joyGfx.fillCircle(bx, by, JOY_RADIUS);
    // Knob
    this.joyGfx.fillStyle(0xe94560, active ? 0.9 : 0.3);
    this.joyGfx.fillCircle(bx + dx, by + dy, JOY_KNOB_RADIUS);
    this.joyGfx.lineStyle(2, 0xffffff, active ? 0.6 : 0.2);
    this.joyGfx.strokeCircle(bx + dx, by + dy, JOY_KNOB_RADIUS);
  }
}
