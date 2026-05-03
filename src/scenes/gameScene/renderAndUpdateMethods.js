import { JOY_KNOB_RADIUS, JOY_RADIUS, PLAYER_HALF, SPEED, TILE } from './constants.js';

const renderAndUpdateMethods = {
  _drawCharacterHp(gfx, cx, cy, charRadius, pct, teamColor) {
    const rimRadius = charRadius - 0.75;
    const separatorRadius = charRadius - 2;
    const hpRadius = charRadius - 3.5;

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
    this.dummyRangeGfx.clear();
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

    this.dummyRangeGfx.lineStyle(1.5, 0xff8844, 0.35);
    this.dummyRangeGfx.strokeCircle(this.dummyRect.x, this.dummyRect.y, this.dummy.weapon.range + this.dummy.halfSize);
  },

  _syncHpGraphics() {
    if (!this.chars) return;
    const active = this._activeChar();
    for (const c of this.chars) {
      c.hpGfx.clear();
      if (!c.alive) continue;
      this._drawCharacterHp(c.hpGfx, c.sprite.x, c.sprite.y, PLAYER_HALF, c.hp / c.maxHp, 0x3b8eff);
      if (c === active) {
        c.hpGfx.lineStyle(2, 0xffffff, 0.9);
        c.hpGfx.strokeCircle(c.sprite.x, c.sprite.y, PLAYER_HALF + 2);
      }
    }
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

  _playSlashEffect(ax, ay, tx, ty) {
    const dx = tx - ax;
    const dy = ty - ay;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.0001) return;
    const ux = dx / dist;
    const uy = dy / dist;
    const startX = ax + ux * 6;
    const startY = ay + uy * 6;
    const endX = tx - ux * 6;
    const endY = ty - uy * 6;

    const g = this.add.graphics().setDepth(19);
    g.lineStyle(4, 0xffffff, 0.85);
    g.beginPath();
    g.moveTo(startX, startY);
    g.lineTo(endX, endY);
    g.strokePath();
    g.lineStyle(2, 0xffeeaa, 0.95);
    g.beginPath();
    g.moveTo(startX, startY);
    g.lineTo(endX, endY);
    g.strokePath();

    if (this.uiCam) this.uiCam.ignore(g);

    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 180,
      ease: 'Linear',
      onComplete: () => g.destroy(),
    });
  },

  _playHitReaction(target) {
    if (!target) return;
    const baseX = target.x;
    const originalFill = target.fillColor;
    if (typeof target.setFillStyle === 'function') {
      target.setFillStyle(0xffffff);
      this.time.delayedCall(80, () => {
        if (target.active && typeof target.setFillStyle === 'function') {
          target.setFillStyle(originalFill);
        }
      });
    }
    this.tweens.add({
      targets: target,
      x: baseX + 4,
      duration: 40,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        if (target.body && typeof target.body.reset === 'function') {
          target.body.reset(target.x, target.y);
        }
      },
      onComplete: () => {
        target.x = baseX;
        if (target.body && typeof target.body.reset === 'function') {
          target.body.reset(baseX, target.y);
        }
      },
    });
  },

  _updateFogForChar(char) {
    const tileR = Math.floor(char.sprite.y / TILE);
    const tileC = Math.floor(char.sprite.x / TILE);
    if (tileR === char.lastFogTile.r && tileC === char.lastFogTile.c) return;
    char.lastFogTile = { r: tileR, c: tileC };
    this._updateFog(char.sprite.x, char.sprite.y, this.playerFog);
  },

  update(_time, delta) {
    const active = this._activeChar();
    const body = active.sprite.body;

    for (const c of this.chars) {
      if (c.alive) this._updateFogForChar(c);
    }
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

    if (this.inventoryOpen || this.attackAnimating) {
      body.setVelocity(0, 0);
      return;
    }

    if (!this.turnEnding) {
      const dx = active.sprite.x - active.lastX;
      const dy = active.sprite.y - active.lastY;
      const actualDist = Math.sqrt(dx * dx + dy * dy);
      if (actualDist > 0) {
        active.distLeft = Math.max(0, active.distLeft - actualDist);
        this.movesText.setText(this._distLabel());
        this._drawRange();
        this._drawAttackRange();
        this._updateDummyOutline();
      }
    }

    active.lastX = active.sprite.x;
    active.lastY = active.sprite.y;

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

    if (active.distLeft > 0 && (vx !== 0 || vy !== 0)) {
      const frameSpeed = Math.sqrt(vx * vx + vy * vy);
      const frameDist = frameSpeed * (delta / 1000);
      if (frameDist > active.distLeft) {
        const scale = active.distLeft / frameDist;
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
    this.dummyRangeGfx.setVisible(vis);
  },

  _drawAttackRange() {
    this.atkRangeGfx.clear();
    if (!this.dummy.alive) return;
    const active = this._activeChar();
    if (!active || !active.alive) return;
    const w = active.inventory[0];
    if (!w) return;

    this.atkRangeGfx.lineStyle(1.5, 0xff4444, 0.5);
    this.atkRangeGfx.strokeCircle(active.sprite.x, active.sprite.y, w.range + PLAYER_HALF);
  },

  _drawRange() {
    this.rangeGfx.clear();
    if (this.turnEnding) return;
    const active = this._activeChar();
    if (!active || !active.alive || active.distLeft <= 0) return;

    const x = active.sprite.x;
    const y = active.sprite.y;
    const r = active.distLeft + (TILE - 4) / 2;

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
