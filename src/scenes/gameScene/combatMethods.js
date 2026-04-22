import {
  ENEMY_MOVE,
  MAX_DISTANCE,
  PLAYER_HALF,
  TILE,
} from './constants.js';
import { findPath } from './pathfinding.js';

const combatMethods = {
  _activeChar() {
    return this.chars[this.activeIdx];
  },

  _applyActiveDepth() {
    for (let i = 0; i < this.chars.length; i++) {
      const c = this.chars[i];
      if (!c.alive) continue;
      const isActive = i === this.activeIdx;
      c.sprite.setDepth(isActive ? 8 : 6);
      c.hpGfx.setDepth(isActive ? 9 : 7);
    }
  },

  _setActiveChar(idx) {
    if (idx === this.activeIdx) return;
    const next = this.chars[idx];
    if (!next || !next.alive) return;
    if (this.inventoryOpen && this.dragCard) return;

    if (this.inventoryOpen) this._closeInventory();

    this.activeIdx = idx;
    const zoom = this.cameras.main.zoom || 1;
    this.cameras.main.startFollow(next.sprite, true, 0.1, 0.1);
    this.cameras.main.setFollowOffset(0, -160 / zoom);

    this.movesText.setText(this._distLabel());
    this.weaponText.setText(this._weaponLabel());
    this._drawRange();
    this._drawAttackRange();
    this._updateDummyOutline();
    this._refreshCharSelector();
    this._applyActiveDepth();
  },

  _distLabel() {
    const c = this._activeChar();
    return `[${c.id}] Move: ${Math.ceil(c.distLeft)} / ${c.effectiveMax}`;
  },

  _weaponLabel() {
    const w = this._activeChar().inventory[0];
    if (!w) return `[${this._activeChar().id}] (no weapon)`;
    const abl = this._abilityLabel(w);
    return `[${this._activeChar().id}] ${w.name}  Dmg:${w.damage}  Rng:${w.range}  Cost:${w.cost}${abl ? '  \u25c6 ' + abl : ''}`;
  },

  _abilityLabel(weapon) {
    return (weapon.abilities ?? [])
      .map(a => {
        if (a.type === 'block') return `Block ${a.value}`;
        if (a.type === 'crit_range') return `Crit +${a.value}`;
        if (a.type === 'brace') return 'Brace';
        if (a.type === 'regen') return `Regen +${a.value}`;
        return a.type;
      })
      .join('  ');
  },

  _isSupportWeapon(weapon) {
    return !!weapon?.abilities?.some(a => a.type === 'regen');
  },

  _getAbility(type) {
    const w = this._activeChar().inventory[0];
    return w?.abilities?.find(a => a.type === type) ?? null;
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

  _charInAttackRange(char, weapon) {
    if (!weapon) return false;
    const d = Phaser.Math.Distance.Between(char.sprite.x, char.sprite.y, this.dummyRect.x, this.dummyRect.y);
    if (d - PLAYER_HALF - this.dummy.halfSize > weapon.range) return false;
    return this._hasLineOfSight(char.sprite.x, char.sprite.y, this.dummyRect.x, this.dummyRect.y);
  },

  _hasLineOfSight(x1, y1, x2, y2) {
    this._losLine.setTo(x1, y1, x2, y2);
    return !this.wallRects.some(r => Phaser.Geom.Intersects.LineToRectangle(this._losLine, r));
  },

  _selectEnemyTarget() {
    const alive = this.chars.filter(c => c.alive);
    if (alive.length === 0) return null;

    const weapon = this.dummy.weapon;
    const inRangeLos = alive.filter(c => this._dummyCanHit(c, weapon));
    const withLos = inRangeLos.length > 0
      ? inRangeLos
      : alive.filter(c => this._hasLineOfSight(this.dummyRect.x, this.dummyRect.y, c.sprite.x, c.sprite.y));
    const pool = inRangeLos.length > 0 ? inRangeLos : (withLos.length > 0 ? withLos : alive);

    let best = pool[0];
    let bestDist = Phaser.Math.Distance.Between(this.dummyRect.x, this.dummyRect.y, best.sprite.x, best.sprite.y);
    for (let i = 1; i < pool.length; i++) {
      const d = Phaser.Math.Distance.Between(this.dummyRect.x, this.dummyRect.y, pool[i].sprite.x, pool[i].sprite.y);
      if (d < bestDist) {
        best = pool[i];
        bestDist = d;
      }
    }
    return best;
  },

  _dummyCanHit(char, weapon) {
    const d = Phaser.Math.Distance.Between(this.dummyRect.x, this.dummyRect.y, char.sprite.x, char.sprite.y);
    if (d - PLAYER_HALF - this.dummy.halfSize > weapon.range) return false;
    return this._hasLineOfSight(this.dummyRect.x, this.dummyRect.y, char.sprite.x, char.sprite.y);
  },

  _endTurnManual() {
    if (this.turnEnding) return;
    let totalSaved = 0;
    for (const c of this.chars) {
      if (!c.alive) {
        c.savedMovement = 0;
        continue;
      }
      const save = Math.min(Math.floor(c.distLeft / 2), MAX_DISTANCE / 2);
      c.savedMovement = save;
      totalSaved += save;
    }
    const msg = totalSaved > 0 ? `End of Turn!\n+${totalSaved} saved` : 'End of Turn!';
    this.turnMsg.setText(msg);
    this._endTurn();
  },

  _endTurn() {
    this.turnEnding = true;
    for (const c of this.chars) {
      if (c.sprite.body) c.sprite.body.setVelocity(0, 0);
    }

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

    if (this._enemySeenThisTurn) {
      this.dummy.turnsSinceSeen = 0;
    } else {
      this.dummy.turnsSinceSeen++;
    }

    if (this.dummy.turnsSinceSeen >= 2) {
      this._enemyAttackPhase();
      return;
    }

    const target = this._selectEnemyTarget();
    if (!target) {
      this._enemyAttackPhase();
      return;
    }

    const targetWeapon = target.inventory[0];
    const brace = targetWeapon?.abilities?.find(a => a.type === 'brace') ?? null;
    const wasInRange = this._charInAttackRange(target, targetWeapon);

    this._enemyBudget = ENEMY_MOVE;

    const afterMove = () => {
      const t2 = this._selectEnemyTarget();
      if (brace && !this.braceTriggered && !wasInRange && t2 === target && this._charInAttackRange(target, targetWeapon)) {
        this.braceTriggered = true;
        this._doBraceAttack(target);
      }
      if (this.dummy.alive) this._enemyAttackPhase();
      else this.time.delayedCall(400, () => this._startPlayerTurn());
    };

    const enemyWeapon = this.dummy.weapon;
    const centerDist = Phaser.Math.Distance.Between(this.dummyRect.x, this.dummyRect.y, target.sprite.x, target.sprite.y);
    if (
      centerDist - this.dummy.halfSize - PLAYER_HALF <= enemyWeapon.range &&
      this._hasLineOfSight(this.dummyRect.x, this.dummyRect.y, target.sprite.x, target.sprite.y)
    ) {
      afterMove();
      return;
    }

    const enemyR = Math.floor(this.dummyRect.y / TILE);
    const enemyC = Math.floor(this.dummyRect.x / TILE);
    const targetR = Math.floor(target.sprite.y / TILE);
    const targetC = Math.floor(target.sprite.x / TILE);

    const weaponRangeTiles = Math.max(1, Math.floor(this.dummy.weapon.range / TILE));
    const path = findPath(this.mapGrid, enemyR, enemyC, targetR, targetC, weaponRangeTiles);

    if (!path || path.length === 0) {
      afterMove();
      return;
    }

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

      const alive = this.chars.filter(c => c.alive);
      const hittable = alive.filter(c => this._dummyCanHit(c, enemyWeapon));
      if (hittable.length === 0) {
        this.time.delayedCall(500, () => this._startPlayerTurn());
        return;
      }

      let target = hittable[0];
      let bestDist = Phaser.Math.Distance.Between(this.dummyRect.x, this.dummyRect.y, target.sprite.x, target.sprite.y);
      for (let i = 1; i < hittable.length; i++) {
        const d = Phaser.Math.Distance.Between(this.dummyRect.x, this.dummyRect.y, hittable[i].sprite.x, hittable[i].sprite.y);
        if (d < bestDist) {
          target = hittable[i];
          bestDist = d;
        }
      }

      this._enemyBudget -= scaledCost;
      const { damage } = this._resolveAttack(this.dummy.weapon, target.inventory[0], target.sprite.x, target.sprite.y);

      target.hp = Math.max(0, target.hp - damage);

      if (target.hp <= 0) {
        this._killChar(target);
        if (this.chars.every(c => !c.alive)) {
          this.time.delayedCall(1000, () => this._gameOver());
          return;
        }
      }

      this.time.delayedCall(500, tryAttack);
    };

    tryAttack();
  },

  _killChar(char) {
    const deadIdx = this.chars.indexOf(char);
    char.alive = false;
    char.sprite.setFillStyle(0x555555);
    char.sprite.setDepth(2);
    if (char.sprite.body) char.sprite.body.setEnable(false);
    char.sprite.disableInteractive();
    char.hpGfx.clear();
    this._refreshCharSelector();
    if (this.activeIdx === deadIdx) {
      const nextAlive = this.chars.findIndex(c => c.alive);
      if (nextAlive >= 0) {
        this.activeIdx = nextAlive;
        const zoom = this.cameras.main.zoom || 1;
        this.cameras.main.startFollow(this.chars[nextAlive].sprite, true, 0.1, 0.1);
        this.cameras.main.setFollowOffset(0, -160 / zoom);
        this.movesText.setText(this._distLabel());
        this.weaponText.setText(this._weaponLabel());
        this._drawRange();
        this._drawAttackRange();
        this._updateDummyOutline();
        this._applyActiveDepth();
      }
    }
  },

  _startPlayerTurn() {
    this._enemySeenThisTurn = false;
    this.turnCount++;

    if (!this.dummy.alive && this.turnCount - this.dummy.defeatedAtTurn >= 3) {
      this._resurrectDummy();
    }

    this._applyRegenTicks();

    this.braceTriggered = false;
    for (const c of this.chars) {
      if (!c.alive) continue;
      const bonus = c.savedMovement;
      c.savedMovement = 0;
      c.effectiveMax = MAX_DISTANCE + bonus;
      c.distLeft = c.effectiveMax;
    }
    this.turnEnding = false;
    this.turnMsg.setText('End of Turn!');

    if (!this._activeChar().alive) {
      const nextAlive = this.chars.findIndex(c => c.alive);
      if (nextAlive >= 0) {
        this.activeIdx = nextAlive;
        const zoom = this.cameras.main.zoom || 1;
        this.cameras.main.startFollow(this.chars[nextAlive].sprite, true, 0.1, 0.1);
        this.cameras.main.setFollowOffset(0, -160 / zoom);
      }
    }

    this.movesText.setText(this._distLabel());
    this.weaponText.setText(this._weaponLabel());
    this._drawRange();
    this._drawAttackRange();
    this._updateDummyOutline();
    this._applyActiveDepth();
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
    const c = this._activeChar();
    if (!c.alive) return false;
    const w = c.inventory[0];
    if (!w) return false;
    if (this._isSupportWeapon(w)) return false;
    if (c.distLeft < w.cost) return false;
    return this._charInAttackRange(c, w);
  },

  _canCastSupport(targetChar) {
    const caster = this._activeChar();
    if (!caster || !caster.alive || !targetChar || !targetChar.alive) return false;
    if (this.turnEnding || this.inventoryOpen) return false;
    const w = caster.inventory[0];
    if (!this._isSupportWeapon(w)) return false;
    if (caster.distLeft < w.cost) return false;
    if (caster === targetChar) return true;
    const d = Phaser.Math.Distance.Between(caster.sprite.x, caster.sprite.y, targetChar.sprite.x, targetChar.sprite.y);
    if (d - PLAYER_HALF - PLAYER_HALF > w.range) return false;
    return this._hasLineOfSight(caster.sprite.x, caster.sprite.y, targetChar.sprite.x, targetChar.sprite.y);
  },

  _tryCastSupport(targetChar) {
    if (!this._canCastSupport(targetChar)) return false;
    const caster = this._activeChar();
    const w = caster.inventory[0];
    const regen = w.abilities.find(a => a.type === 'regen');
    caster.distLeft = Math.max(0, caster.distLeft - w.cost);
    targetChar.regenStrength = (targetChar.regenStrength ?? 0) + regen.value;
    this._showFloatingText(targetChar.sprite.x, targetChar.sprite.y - 40, `Regen ${targetChar.regenStrength}`, '#44ff88');
    this.movesText.setText(this._distLabel());
    this._drawRange();
    this._drawAttackRange();
    return true;
  },

  _applyRegenTicks() {
    for (const c of this.chars) {
      if (!c.alive) continue;
      if (!c.regenStrength || c.regenStrength <= 0) continue;
      const heal = Math.min(c.regenStrength, c.maxHp - c.hp);
      if (heal > 0) {
        c.hp += heal;
        this._showFloatingText(c.sprite.x, c.sprite.y + 24, `+${heal} HP`, '#44ff88');
      }
      c.regenStrength -= 1;
    }
  },

  _tryAttack() {
    if (!this._canAttack()) return;
    const c = this._activeChar();
    const w = c.inventory[0];

    c.distLeft = Math.max(0, c.distLeft - w.cost);
    this.movesText.setText(this._distLabel());
    this._drawRange();

    const { damage } = this._resolveAttack(w, this.dummy.weapon, this.dummyRect.x, this.dummyRect.y);
    this._applyDamageToDummy(damage);
  },

  _doBraceAttack(target) {
    const w = target.inventory[0];
    this._showFloatingText(target.sprite.x, target.sprite.y - 52, 'BRACE!', '#88ffff');
    const { damage } = this._resolveAttack(w, this.dummy.weapon, this.dummyRect.x, this.dummyRect.y);
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
