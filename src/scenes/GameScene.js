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
  { name: 'Dagger', range: 40,  damage: 15, cost: 30 },
  { name: 'Sword',  range: 80,  damage: 10, cost: 50 },
  { name: 'Spear',  range: 130, damage: 7,  cost: 40 },
];

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
const JOY_RADIUS      = 50;
const JOY_KNOB_RADIUS = 22;
const JOY_MARGIN      = 80;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    // --- Draw map ---
    // Depth order: floor (0) → range circles (1) → walls (2) → entities (3) → HP/labels (4) → UI (10) → inventory (25)
    this.wallGroup = this.physics.add.staticGroup();
    const floorGfx = this.add.graphics().setDepth(0);
    const wallGfx  = this.add.graphics().setDepth(2);

    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        const x = col * TILE;
        const y = row * TILE;
        if (MAP[row][col] === 1) {
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

    // --- Player ---
    const startCol = Math.floor(MAP_COLS / 2);
    const startRow = Math.floor(MAP_ROWS / 2);
    this.player = this.add.rectangle(
      startCol * TILE + TILE / 2,
      startRow * TILE + TILE / 2,
      TILE - 4, TILE - 4, 0xe94560
    ).setDepth(3);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.wallGroup);
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    // --- Training dummy ---
    this.dummy = { hp: DUMMY_HP, maxHp: DUMMY_HP, alive: true, halfSize: (TILE - 4) / 2 };
    this.dummyRect = this.add.rectangle(
      13 * TILE + TILE / 2,
      12 * TILE + TILE / 2,
      TILE - 4, TILE - 4, 0xf5a623
    ).setDepth(3).setInteractive();
    this.physics.add.existing(this.dummyRect, true);
    this.physics.add.collider(this.player, this.dummyRect);

    this.justAttacked = false;
    this.dummyRect.on('pointerdown', () => {
      this.justAttacked = true;
      this._tryAttack();
    });

    this.add.text(
      this.dummyRect.x, this.dummyRect.y - TILE / 2 - 4,
      'DUMMY', { fontSize: '9px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 }
    ).setOrigin(0.5, 1).setDepth(4);

    this.dummyHpGfx = this.add.graphics().setDepth(4);
    this._updateDummyHp();

    // --- Turn state ---
    this.distLeft      = MAX_DISTANCE;
    this.effectiveMax  = MAX_DISTANCE;
    this.savedMovement = 0;
    this.turnEnding    = false;
    this.lastX         = this.player.x;
    this.lastY         = this.player.y;

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

    // --- Build inventory panel (hidden) ---
    this._buildInventoryPanel();
  }

  // ---------------------------------------------------------------

  _distLabel() {
    return `Move: ${Math.ceil(this.distLeft)} / ${this.effectiveMax}`;
  }

  _weaponLabel() {
    const w = this.equippedWeapon;
    return `${w.name}  Dmg:${w.damage}  Rng:${w.range}  Cost:${w.cost}`;
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
    this.time.delayedCall(1000, () => {
      this.turnMsg.setVisible(false);
      const bonus        = this.savedMovement;
      this.savedMovement = 0;
      this.effectiveMax  = MAX_DISTANCE + bonus;
      this.distLeft      = this.effectiveMax;
      this.turnEnding    = false;
      this.turnMsg.setText('End of Turn!');
      this.movesText.setText(this._distLabel());
      this._drawRange();
    });
  }

  // ---------------------------------------------------------------

  _canAttack() {
    if (!this.dummy.alive || this.turnEnding || this.inventoryOpen) return false;
    if (this.distLeft < this.equippedWeapon.cost) return false;
    const centerDist = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, this.dummyRect.x, this.dummyRect.y
    );
    return centerDist - PLAYER_HALF - this.dummy.halfSize <= this.equippedWeapon.range;
  }

  _tryAttack() {
    if (!this._canAttack()) return;

    const weapon = this.equippedWeapon;

    this.distLeft = Math.max(0, this.distLeft - weapon.cost);
    this.movesText.setText(this._distLabel());
    this._drawRange();

    // Roll d20
    const roll = Phaser.Math.Between(1, 20);
    let damage   = weapon.damage;
    let dmgLabel = `-${damage}`;
    let dmgColor = '#ff4444';

    if (roll === 20) {
      damage   = weapon.damage * 2;
      dmgLabel = `CRIT! -${damage}`;
      dmgColor = '#ffdd00';
    } else if (roll === 1) {
      damage   = Math.floor(weapon.damage / 2);
      dmgLabel = `WEAK -${damage}`;
      dmgColor = '#aaaaaa';
    }

    this._showFloatingText(this.dummyRect.x, this.dummyRect.y - 28, `Roll: ${roll}`, '#ffffff');
    this._showFloatingText(this.dummyRect.x, this.dummyRect.y + 8, dmgLabel, dmgColor);

    this.dummy.hp = Math.max(0, this.dummy.hp - damage);
    this._updateDummyHp();

    if (this.dummy.hp <= 0) {
      this.dummy.alive = false;
      this.dummyRect.setFillStyle(0x555555).setStrokeStyle(0).setDepth(2);
      this.dummyRect.body.enable = false;
      this._showFloatingText(this.dummyRect.x, this.dummyRect.y - 54, 'Defeated!', '#ffffff');
      this._drawAttackRange();
    }

    if (this.distLeft <= 0) this._endTurn();
  }

  // ---------------------------------------------------------------

  _buildInventoryPanel() {
    const cx = 240, cy = 430;
    const panelW = 380, panelH = 360;
    const SF = 0, D = 25; // scrollFactor, depth

    // Darkened overlay — blocks touches behind the panel
    const overlay = this.add.rectangle(240, 400, 480, 800, 0x000000, 0.65)
      .setScrollFactor(SF).setDepth(D).setInteractive();

    // Panel background
    const bg = this.add.rectangle(cx, cy, panelW, panelH, 0x1a1a2e)
      .setStrokeStyle(2, 0x4fc3f7).setScrollFactor(SF).setDepth(D);

    // Title
    const title = this.add.text(cx, cy - panelH / 2 + 26, 'INVENTORY', {
      fontSize: '20px', color: '#4fc3f7',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(SF).setDepth(D);

    this.invElements = [overlay, bg, title];
    this.invRows = []; // { rowBg, nameText, weapon }

    WEAPONS.forEach((weapon, i) => {
      const rowY = cy - panelH / 2 + 90 + i * 76;

      const rowBg = this.add.rectangle(cx, rowY, panelW - 24, 64, 0x2a2a4a)
        .setStrokeStyle(1, 0x444466)
        .setScrollFactor(SF).setDepth(D).setInteractive();

      rowBg.on('pointerdown', () => {
        this.justAttacked = true;
        this._closeInventory();
        this._equipWeapon(weapon);
      });

      const nameText = this.add.text(cx - panelW / 2 + 24, rowY, weapon.name, {
        fontSize: '17px', color: '#ffffff',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0, 0.5).setScrollFactor(SF).setDepth(D);

      const statsText = this.add.text(cx + panelW / 2 - 20, rowY,
        `Rng:${weapon.range}   Dmg:${weapon.damage}   Cost:${weapon.cost}`, {
          fontSize: '12px', color: '#aaaacc',
        }).setOrigin(1, 0.5).setScrollFactor(SF).setDepth(D);

      this.invElements.push(rowBg, nameText, statsText);
      this.invRows.push({ rowBg, nameText, weapon });
    });

    // Close button
    const closeBtn = this.add.text(cx, cy + panelH / 2 - 26, '[ CLOSE ]', {
      fontSize: '16px', color: '#ff6666',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(SF).setDepth(D).setInteractive();

    closeBtn.on('pointerdown', () => {
      this.justAttacked = true;
      this._closeInventory();
    });

    this.invElements.push(closeBtn);

    // Hide all by default
    this.invElements.forEach(el => el.setVisible(false));
  }

  _openInventory() {
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
    this.invRows.forEach(({ rowBg, nameText, weapon }) => {
      const equipped = weapon === this.equippedWeapon;
      rowBg.setFillStyle(equipped ? 0x334488 : 0x2a2a4a);
      rowBg.setStrokeStyle(equipped ? 2 : 1, equipped ? 0x4fc3f7 : 0x444466);
      nameText.setColor(equipped ? '#ffdd00' : '#ffffff');
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
