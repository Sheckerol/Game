import { JOY_KNOB_RADIUS, JOY_RADIUS, PLAYER_HALF, SPEED, TILE, MAP_COLS } from './constants.js';

const renderAndUpdateMethods = {
  _drawCharacterHp(gfx, cx, cy, charRadius, pct, teamColor) {
    const rimRadius = charRadius;
    const separatorRadius = charRadius - 2;
    const hpRadius = charRadius - 5;

    gfx.lineStyle(1.5, teamColor, 1);
    gfx.strokeCircle(cx, cy, rimRadius);

    gfx.lineStyle(1, 0x000000, 1);
    gfx.strokeCircle(cx, cy, separatorRadius);

    gfx.lineStyle(2, 0x222222, 0.85);
    gfx.beginPath();
    gfx.arc(cx, cy, hpRadius, Math.PI, 2 * Math.PI, false);
    gfx.strokePath();

    if (pct > 0) {
      const hpColor = pct > 0.5 ? 0x44cc44 : pct > 0.25 ? 0xffaa00 : 0xcc2200;
      gfx.lineStyle(2, hpColor, 1);
      gfx.beginPath();
      gfx.arc(cx, cy, hpRadius, Math.PI, Math.PI + pct * Math.PI, false);
      gfx.strokePath();
    }
  },

  _updateDummyHp() {
    this.dummyHpGfx.clear();
    if (!this.dummy.alive) return;

    this._drawCharacterHp(
      this.dummyHpGfx,
      this.dummyRect.x,
      this.dummyRect.y,
      this.dummy.halfSize,
      this.dummy.hp / this.dummy.maxHp,
      0xff4444,
    );

    this.dummyLabel.setPosition(this.dummyRect.x, this.dummyRect.y - TILE / 2 - 8);
  },

  _syncHpGraphics() {
    this._drawPlayerHp();
    if (this.enemyMoving && this.dummy.alive) this._updateDummyHp();
  },

  _updateDummyOutline() {
    if (!this.dummy.alive) return;
    this.dummyRect.setStrokeStyle(this._canAttack() ? 2 : 0, 0xffdd00);
  },

  _showFloatingText(x, y, text, color = '#ffffff') {
    const t = this.add
      .text(x, y, text, {
        fontSize: '18px',
        color,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(20);

    if (this.uiCam) this.uiCam.ignore(t);

    this.tweens.add({
      targets: t,
      y: y - 50,
      alpha: 0,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => t.destroy(),
    });
  },

  update(_time, delta) {
    const body = this.player.body;

    this._updateFog(this.player.x, this.player.y, this.playerFog);
    this._tickFog();

    if (this.enemyMoving) {
      const er = Math.floor(this.dummyRect.y / TILE);
      const ec = Math.floor(this.dummyRect.x / TILE);
      if (er !== this._enemyLastTileR || ec !== this._enemyLastTileC) {
        this._enemyLastTileR = er;
        this._enemyLastTileC = ec;
        this._updateEnemyVisibility();
      }
    }

    if (this.inventoryOpen) {
      body.setVelocity(0, 0);
      return;
    }

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

    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown || this.wasd.left.isDown) vx = -SPEED;
    else if (this.cursors.right.isDown || this.wasd.right.isDown) vx = SPEED;

    if (this.cursors.up.isDown || this.wasd.up.isDown) vy = -SPEED;
    else if (this.cursors.down.isDown || this.wasd.down.isDown) vy = SPEED;

    if (this.joy.active) {
      const norm = Math.sqrt(this.joy.dx ** 2 + this.joy.dy ** 2);
      if (norm > JOY_RADIUS * 0.1) {
        vx = (this.joy.dx / JOY_RADIUS) * SPEED;
        vy = (this.joy.dy / JOY_RADIUS) * SPEED;
      } else {
        vx = 0;
        vy = 0;
      }
    }

    if (vx !== 0 && vy !== 0) {
      vx *= 0.707;
      vy *= 0.707;
    }

    if (this.distLeft > 0 && (vx !== 0 || vy !== 0)) {
      const frameSpeed = Math.sqrt(vx * vx + vy * vy);
      const frameDist = frameSpeed * (delta / 1000);
      if (frameDist > this.distLeft) {
        const scale = this.distLeft / frameDist;
        vx *= scale;
        vy *= scale;
      }
      body.setVelocity(vx, vy);
    } else {
      body.setVelocity(0, 0);
    }
  },

  _updateEnemyVisibility() {
    if (!this.dummy.alive) {
      this.enemyMarker.setVisible(false);
      return;
    }
    const r = Math.floor(this.dummyRect.y / TILE);
    const c = Math.floor(this.dummyRect.x / TILE);
    const vis = this.playerFog.visGrid[r]?.[c] === true;
    if (vis && !this._enemyVisible) {
      this.enemyMarker.setVisible(false);
    } else if (!vis && this._enemyVisible) {
      this.enemyMarker.setPosition(this.dummyRect.x, this.dummyRect.y);
      this.enemyMarker.setVisible(true);
    }
    this._enemyVisible = vis;
    if (vis) this._enemySeenThisTurn = true;
    this.dummyRect.setVisible(vis);
    this.dummyLabel.setVisible(vis);
    this.dummyHpGfx.setVisible(vis);
  },

  _drawAttackRange() {
    this.atkRangeGfx.clear();
    if (!this.dummy.alive) return;

    this.atkRangeGfx.lineStyle(1.5, 0xff4444, 0.5);
    this.atkRangeGfx.strokeCircle(this.player.x, this.player.y, this.equippedWeapon.range + PLAYER_HALF);
  },

  _drawRange() {
    this.rangeGfx.clear();
    if (this.turnEnding || this.distLeft <= 0) return;

    const x = this.player.x;
    const y = this.player.y;
    const r = this.distLeft + (TILE - 4) / 2;

    this.rangeGfx.fillStyle(0x4fc3f7, 0.1);
    this.rangeGfx.fillCircle(x, y, r);
    this.rangeGfx.lineStyle(2, 0x4fc3f7, 0.5);
    this.rangeGfx.strokeCircle(x, y, r);
  },

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
  },
};

export default renderAndUpdateMethods;
