import {
  ENEMY_MOVE,
  MAX_DISTANCE,
  PLAYER_HALF,
  TILE,
} from './constants.js';
import { findPath } from './pathfinding.js';

const combatMethods = {
  _distLabel() {
    return `Move: ${Math.ceil(this.distLeft)} / ${this.effectiveMax}`;
  },

  _weaponLabel() {
    const w = this.equippedWeapon;
    const abl = this._abilityLabel(w);
    return `${w.name}  Dmg:${w.damage}  Rng:${w.range}  Cost:${w.cost}${abl ? '  ◆ ' + abl : ''}`;
  },

  _abilityLabel(weapon) {
    return (weapon.abilities ?? [])
      .map(a => {
        if (a.type === 'block') return `Block ${a.value}`;
        if (a.type === 'crit_range') return `Crit +${a.value}`;
        if (a.type === 'brace') return 'Brace';
        return a.type;
      })
      .join('  ');
  },

  _getAbility(type) {
    return this.equippedWeapon.abilities?.find(a => a.type === type) ?? null;
  },

  _rollAttackWith(weapon) {
    const crit = weapon.abilities?.find(a => a.type === 'crit_range');
    const critAt = crit ? 20 - crit.value : 20;
    const roll = Phaser.Math.Between(1, 20);
    let damage = weapon.damage;
    let label = `-${damage}`;
    let color = '#ff4444';

    if (roll >= critAt) {
      damage = weapon.damage * 2;
      label = `CRIT! -${damage}`;
      color = '#ffdd00';
    } else if (roll === 1) {
      damage = Math.max(1, Math.floor(weapon.damage / 2));
      label = `WEAK -${damage}`;
      color = '#aaaaaa';
    }

    return { roll, damage, label, color };
  },

  _resolveAttack(attackerWeapon, defenderWeapon, defenderX, defenderY) {
    const { roll, damage: rawDamage, label, color } = this._rollAttackWith(attackerWeapon);

    let damage = rawDamage;
    const block = defenderWeapon?.abilities?.find(a => a.type === 'block');
    if (block && block.value > 0) {
      const absorbed = Math.min(damage - 1, block.value);
      damage -= absorbed;
      this._showFloatingText(defenderX, defenderY - 48, `BLOCK ${absorbed}`, '#4fc3f7');
    }

    this._showFloatingText(defenderX, defenderY - 28, `Roll: ${roll}`, '#ffffff');
    this._showFloatingText(defenderX, defenderY + 8, label, color);

    return { damage };
  },

  _playerInAttackRange() {
    const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.dummyRect.x, this.dummyRect.y);
    if (d - PLAYER_HALF - this.dummy.halfSize > this.equippedWeapon.range) return false;
    return this._hasLineOfSight(this.player.x, this.player.y, this.dummyRect.x, this.dummyRect.y);
  },

  _hasLineOfSight(x1, y1, x2, y2) {
    this._losLine.setTo(x1, y1, x2, y2);
    return !this.wallRects.some(r => Phaser.Geom.Intersects.LineToRectangle(this._losLine, r));
  },

  _endTurnManual() {
    if (this.turnEnding) return;
    const save = Math.min(Math.floor(this.distLeft / 2), MAX_DISTANCE / 2);
    this.savedMovement = save;
    const msg = save > 0 ? `End of Turn!\n+${save} saved` : 'End of Turn!';
    this.turnMsg.setText(msg);
    this._endTurn();
  },

  _endTurn() {
    this.turnEnding = true;
    this.player.body.setVelocity(0, 0);

    this._resetFogVisibility();
    this._updateEnemyVisibility();
    this._drawRange();
    this.turnMsg.setVisible(true);
    this.time.delayedCall(800, () => {
      this.turnMsg.setVisible(false);
      this._startEnemyTurn();
    });
  },

  _startEnemyTurn() {
    if (!this.dummy.alive) {
      this._startPlayerTurn();
      return;
    }

    // Track visibility — reset if seen at any point during the player's turn
    if (this._enemySeenThisTurn) {
      this.dummy.turnsSinceSeen = 0;
    } else {
      this.dummy.turnsSinceSeen++;
    }

    // If enemy hasn't seen the player for 2+ turns, skip movement
    if (this.dummy.turnsSinceSeen >= 2) {
      this._enemyAttackPhase();
      return;
    }

    const brace = this._getAbility('brace');
    const wasInRange = this._playerInAttackRange();

    this._enemyBudget = ENEMY_MOVE;

    const afterMove = () => {
      if (brace && !this.braceTriggered && !wasInRange && this._playerInAttackRange()) {
        this.braceTriggered = true;
        this._doBraceAttack();
      }
      if (this.dummy.alive) this._enemyAttackPhase();
      else this.time.delayedCall(400, () => this._startPlayerTurn());
    };

    // Already in attack range — skip movement
    const enemyWeapon = this.dummy.weapon;
    const centerDist = Phaser.Math.Distance.Between(this.dummyRect.x, this.dummyRect.y, this.player.x, this.player.y);
    if (
      centerDist - this.dummy.halfSize - PLAYER_HALF <= enemyWeapon.range &&
      this._hasLineOfSight(this.dummyRect.x, this.dummyRect.y, this.player.x, this.player.y)
    ) {
      afterMove();
      return;
    }

    // Pathfind toward the player
    const enemyR = Math.floor(this.dummyRect.y / TILE);
    const enemyC = Math.floor(this.dummyRect.x / TILE);
    const playerR = Math.floor(this.player.y / TILE);
    const playerC = Math.floor(this.player.x / TILE);

    // Calculate range in tiles (weapon range / tile size, at least 1)
    const weaponRangeTiles = Math.max(1, Math.floor(this.dummy.weapon.range / TILE));
    const path = findPath(this.mapGrid, enemyR, enemyC, playerR, playerC, weaponRangeTiles);

    if (!path || path.length === 0) {
      afterMove();
      return;
    }

    // Trim path to movement budget
    // Steps are {r, c} tile coords; convert to {x, y} pixel targets
    let prevX = this.dummyRect.x;
    let prevY = this.dummyRect.y;
    const waypoints = [];
    for (const step of path) {
      const tx = step.c * TILE + TILE / 2;
      const ty = step.r * TILE + TILE / 2;
      const dx = tx - prevX;
      const dy = ty - prevY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > this._enemyBudget) {
        // Partial step — use remaining budget
        if (this._enemyBudget > 1) {
          const frac = this._enemyBudget / dist;
          waypoints.push({ x: prevX + dx * frac, y: prevY + dy * frac });
        }
        this._enemyBudget = 0;
        break;
      }
      this._enemyBudget -= dist;
      waypoints.push({ x: tx, y: ty });
      prevX = tx;
      prevY = ty;
    }

    if (waypoints.length === 0) {
      afterMove();
      return;
    }

    this._animateEnemyPath(waypoints, afterMove);
  },

  _animateEnemyPath(waypoints, onComplete) {
    const ENEMY_SPEED = 150;
    this.enemyMoving = true;
    this._enemyLastTileR = Math.floor(this.dummyRect.y / TILE);
    this._enemyLastTileC = Math.floor(this.dummyRect.x / TILE);

    let i = 0;
    const moveNext = () => {
      if (i >= waypoints.length || !this.dummy.alive) {
        this.enemyMoving = false;
        onComplete();
        return;
      }

      const wp = waypoints[i];
      const dx = wp.x - this.dummyRect.x;
      const dy = wp.y - this.dummyRect.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const duration = Math.max(1, Math.round((dist / ENEMY_SPEED) * 1000));

      this.tweens.add({
        targets: this.dummyRect,
        x: wp.x,
        y: wp.y,
        duration,
        ease: 'Linear',
        onUpdate: () => {
          this.dummyRect.body.reset(this.dummyRect.x, this.dummyRect.y);
        },
        onComplete: () => {
          i++;
          moveNext();
        },
      });
    };

    moveNext();
  },

  _enemyAttackPhase() {
    const enemyWeapon = this.dummy.weapon;
    const scaledCost = (ENEMY_MOVE / MAX_DISTANCE) * enemyWeapon.cost;

    const tryAttack = () => {
      if (!this.dummy.alive || this._enemyBudget < scaledCost) {
        this.time.delayedCall(500, () => this._startPlayerTurn());
        return;
      }

      const centerDist = Phaser.Math.Distance.Between(this.dummyRect.x, this.dummyRect.y, this.player.x, this.player.y);
      if (
        centerDist - this.dummy.halfSize - PLAYER_HALF > enemyWeapon.range ||
        !this._hasLineOfSight(this.dummyRect.x, this.dummyRect.y, this.player.x, this.player.y)
      ) {
        this.time.delayedCall(500, () => this._startPlayerTurn());
        return;
      }

      this._enemyBudget -= scaledCost;
      const { damage } = this._resolveAttack(this.dummy.weapon, this.equippedWeapon, this.player.x, this.player.y);

      this.playerHp = Math.max(0, this.playerHp - damage);
      this._drawPlayerHp();

      if (this.playerHp <= 0) {
        this.time.delayedCall(1000, () => this._gameOver());
        return;
      }

      // Try another attack after a short delay
      this.time.delayedCall(500, tryAttack);
    };

    tryAttack();
  },

  _startPlayerTurn() {
    this._enemySeenThisTurn = false;
    this.turnCount++;

    if (!this.dummy.alive && this.turnCount - this.dummy.defeatedAtTurn >= 3) {
      this._resurrectDummy();
    }

    const bonus = this.savedMovement;
    this.savedMovement = 0;
    this.braceTriggered = false;
    this.effectiveMax = MAX_DISTANCE + bonus;
    this.distLeft = this.effectiveMax;
    this.turnEnding = false;
    this.turnMsg.setText('End of Turn!');
    this.movesText.setText(this._distLabel());
    this._drawRange();
    this._drawAttackRange();
    this._updateDummyOutline();
  },

  _resurrectDummy() {
    this.dummy.hp = this.dummy.maxHp;
    this.dummy.alive = true;
    this.dummy.turnsSinceSeen = 2;
    this.dummyRect.setFillStyle(0xf5a623).setStrokeStyle(0).setDepth(3);
    this.dummyRect.body.setEnable(true);
    this._updateDummyHp();
    this._updateEnemyVisibility();
  },

  _drawPlayerHp() {
    this.playerHpGfx.clear();
    const barW = 160;
    const barH = 10;
    const bx = 68;
    const by = 67;

    this.playerHpGfx.fillStyle(0x333333, 1);
    this.playerHpGfx.fillRect(bx, by, barW, barH);

    const pct = this.playerHp / this.playerMaxHp;
    const color = pct > 0.5 ? 0x44cc44 : pct > 0.25 ? 0xffaa00 : 0xcc2200;
    this.playerHpGfx.fillStyle(color, 1);
    this.playerHpGfx.fillRect(bx, by, barW * pct, barH);

    this.playerHpGfx.lineStyle(1, 0x888888, 0.8);
    this.playerHpGfx.strokeRect(bx, by, barW, barH);
  },

  _gameOver() {
    this.turnEnding = true;
    const W = this.W;
    const H = this.H;
    this._addUi(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setScrollFactor(0).setDepth(40));
    this._addUi(this.add
      .text(W / 2, H / 2 - 40, 'GAME OVER', {
        fontSize: '44px',
        color: '#ff2222',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(41));
    this._addUi(this.add
      .text(W / 2, H / 2 + 30, 'Refresh to restart', {
        fontSize: '18px',
        color: '#aaaaaa',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(41));
  },

  _canAttack() {
    if (!this.dummy.alive || this.turnEnding || this.inventoryOpen) return false;
    if (this.distLeft < this.equippedWeapon.cost) return false;
    return this._playerInAttackRange();
  },

  _tryAttack() {
    if (!this._canAttack()) return;

    this.distLeft = Math.max(0, this.distLeft - this.equippedWeapon.cost);
    this.movesText.setText(this._distLabel());
    this._drawRange();

    const { damage } = this._resolveAttack(this.equippedWeapon, this.dummy.weapon, this.dummyRect.x, this.dummyRect.y);
    this._applyDamageToDummy(damage);

    if (this.distLeft <= 0) this._endTurn();
  },

  _doBraceAttack() {
    this._showFloatingText(this.player.x, this.player.y - 52, 'BRACE!', '#88ffff');
    const { damage } = this._resolveAttack(this.equippedWeapon, this.dummy.weapon, this.dummyRect.x, this.dummyRect.y);
    this._applyDamageToDummy(damage);
  },

  _applyDamageToDummy(damage) {
    this.dummy.hp = Math.max(0, this.dummy.hp - damage);
    this._updateDummyHp();
    if (this.dummy.hp <= 0) {
      this.dummy.alive = false;
      this.dummy.defeatedAtTurn = this.turnCount;
      this.dummyRect.setFillStyle(0x555555).setStrokeStyle(0).setDepth(2);
      this.dummyRect.body.setEnable(false);
      this._showFloatingText(this.dummyRect.x, this.dummyRect.y - 54, 'Defeated!', '#ffffff');
      this._drawAttackRange();
    }
  },
};

export default combatMethods;
