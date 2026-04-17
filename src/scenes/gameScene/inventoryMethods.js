import { WEAPONS } from './constants.js';

const inventoryMethods = {
  _buildInventoryPanel() {
    const cx = this.W / 2;
    const panelW = 380;
    const panelH = 460;
    const panelTop = this.H / 2 - panelH / 2;
    const cardW = panelW - 40;
    const cardH = 58;
    const SF = 0;
    const D = 25;

    this.invSlotX = cx;
    this.invSlotYs = [panelTop + 90, panelTop + 190, panelTop + 260];

    this.invSlotWeapons = [this.equippedWeapon, ...WEAPONS.filter(w => w !== this.equippedWeapon)];

    const overlay = this.add.rectangle(cx, this.H / 2, this.W, this.H, 0x000000, 0.65).setScrollFactor(SF).setDepth(D).setInteractive();
    const panelBg = this.add.rectangle(cx, this.H / 2, panelW, panelH, 0x1a1a2e).setStrokeStyle(2, 0x4fc3f7).setScrollFactor(SF).setDepth(D);
    const title = this.add
      .text(cx, panelTop + 26, 'INVENTORY', {
        fontSize: '20px',
        color: '#4fc3f7',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(SF)
      .setDepth(D);

    const equippedLabel = this.add
      .text(cx - cardW / 2, panelTop + 66, 'EQUIPPED', {
        fontSize: '11px',
        color: '#888888',
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(SF)
      .setDepth(D);

    const divGfx = this.add.graphics().setScrollFactor(SF).setDepth(D);
    divGfx.lineStyle(1, 0x333355, 1);
    divGfx.lineBetween(cx - cardW / 2, panelTop + 150, cx + cardW / 2, panelTop + 150);

    const bagLabel = this.add
      .text(cx - cardW / 2, panelTop + 163, 'BAG', {
        fontSize: '11px',
        color: '#888888',
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(SF)
      .setDepth(D);

    this.invSlotBgs = this.invSlotYs.map((sy, i) =>
      this.add
        .rectangle(cx, sy, cardW, cardH, 0x111122)
        .setStrokeStyle(1, i === 0 ? 0x4fc3f7 : 0x333355)
        .setScrollFactor(SF)
        .setDepth(D)
    );

    const closeBtn = this.add
      .text(cx, panelTop + panelH - 30, '[ CLOSE ]', {
        fontSize: '16px',
        color: '#ff6666',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(SF)
      .setDepth(D)
      .setInteractive();
    closeBtn.on('pointerdown', () => {
      this.justAttacked = true;
      this._closeInventory();
    });

    this.invCards = [];
    this.invCardsByWeapon = new Map();

    WEAPONS.forEach(weapon => {
      const si = this.invSlotWeapons.indexOf(weapon);
      const sx = cx;
      const sy = si >= 0 ? this.invSlotYs[si] : -200;

      const cardBg = this.add
        .rectangle(sx, sy, cardW, cardH, 0x2a2a4a)
        .setStrokeStyle(1, 0x4466aa)
        .setScrollFactor(SF)
        .setDepth(D + 1)
        .setInteractive();

      const nameText = this.add
        .text(sx - cardW / 2 + 12, sy - 10, weapon.name, {
          fontSize: '15px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(SF)
        .setDepth(D + 2);

      const statsText = this.add
        .text(sx + cardW / 2 - 10, sy + 10, `Rng:${weapon.range}  Dmg:${weapon.damage}  Cost:${weapon.cost}`, {
          fontSize: '11px',
          color: '#aaaacc',
        })
        .setOrigin(1, 0.5)
        .setScrollFactor(SF)
        .setDepth(D + 2);

      const abilityText = this.add
        .text(sx - cardW / 2 + 12, sy + 10, this._abilityLabel(weapon), {
          fontSize: '11px',
          color: '#ffdd88',
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(SF)
        .setDepth(D + 2);

      const card = { bg: cardBg, nameText, statsText, abilityText, weapon };
      this.invCards.push(card);
      this.invCardsByWeapon.set(weapon, card);

      cardBg.on('pointerdown', ptr => {
        this.justAttacked = true;
        this._startCardDrag(card, ptr);
      });
    });

    this.invElements = [
      overlay,
      panelBg,
      title,
      equippedLabel,
      divGfx,
      bagLabel,
      ...this.invSlotBgs,
      closeBtn,
      ...this.invCards.flatMap(c => [c.bg, c.nameText, c.statsText, c.abilityText]),
    ];

    this.dragCard = null;
    this.dragFromSlot = -1;

    this.input.on('pointermove', ptr => {
      if (this.dragCard && this.inventoryOpen) this._updateCardDrag(ptr);
    });
    this.input.on('pointerup', ptr => {
      if (this.dragCard && this.inventoryOpen) this._endCardDrag(ptr);
    });

    this.invElements.forEach(el => {
      this._addUi(el);
      el.setVisible(false);
    });
  },

  _startCardDrag(card) {
    this.dragCard = card;
    this.dragFromSlot = this.invSlotWeapons.indexOf(card.weapon);
    card.bg.setDepth(30);
    card.nameText.setDepth(31);
    card.statsText.setDepth(31);
    card.abilityText.setDepth(31);
  },

  _updateCardDrag(ptr) {
    const card = this.dragCard;
    const cardW = 340;
    card.bg.setPosition(ptr.x, ptr.y);
    card.nameText.setPosition(ptr.x - cardW / 2 + 12, ptr.y - 10);
    card.statsText.setPosition(ptr.x + cardW / 2 - 10, ptr.y + 10);
    card.abilityText.setPosition(ptr.x - cardW / 2 + 12, ptr.y + 10);
  },

  _endCardDrag(ptr) {
    const card = this.dragCard;
    this.dragCard = null;
    const cardW = 340;
    const cardH = 58;

    const targetSlot = this.invSlotYs.findIndex(
      sy => Math.abs(ptr.x - this.invSlotX) < cardW / 2 && Math.abs(ptr.y - sy) < cardH / 2
    );

    if (targetSlot >= 0 && targetSlot !== this.dragFromSlot) {
      const from = this.dragFromSlot;
      const weaponA = this.invSlotWeapons[from];
      const weaponB = this.invSlotWeapons[targetSlot];

      this.invSlotWeapons[targetSlot] = weaponA;
      this.invSlotWeapons[from] = weaponB ?? null;

      this._moveCardToSlot(this.invCardsByWeapon.get(weaponA), targetSlot);
      if (weaponB) this._moveCardToSlot(this.invCardsByWeapon.get(weaponB), from);

      if (this.invSlotWeapons[0] !== this.equippedWeapon) {
        this._equipWeapon(this.invSlotWeapons[0]);
      }
    } else {
      this._moveCardToSlot(card, this.dragFromSlot);
    }

    this._refreshInvHighlights();
  },

  _moveCardToSlot(card, slotIdx) {
    const sx = this.invSlotX;
    const sy = this.invSlotYs[slotIdx];
    const cardW = 340;
    card.bg.setPosition(sx, sy).setDepth(26);
    card.nameText.setPosition(sx - cardW / 2 + 12, sy - 10).setDepth(27);
    card.statsText.setPosition(sx + cardW / 2 - 10, sy + 10).setDepth(27);
    card.abilityText.setPosition(sx - cardW / 2 + 12, sy + 10).setDepth(27);
  },

  _openInventory() {
    const ei = this.invSlotWeapons.indexOf(this.equippedWeapon);
    if (ei > 0) {
      const displaced = this.invSlotWeapons[0];
      this.invSlotWeapons[0] = this.equippedWeapon;
      this.invSlotWeapons[ei] = displaced;
      this._moveCardToSlot(this.invCardsByWeapon.get(this.equippedWeapon), 0);
      if (displaced) this._moveCardToSlot(this.invCardsByWeapon.get(displaced), ei);
    }
    this._refreshInvHighlights();
    this.invElements.forEach(el => el.setVisible(true));
    this.inventoryOpen = true;
  },

  _closeInventory() {
    this.invElements.forEach(el => el.setVisible(false));
    this.inventoryOpen = false;
  },

  _equipWeapon(weapon) {
    this.equippedWeapon = weapon;
    this.weaponText.setText(this._weaponLabel());
    this._drawAttackRange();
    this._updateDummyOutline();
  },

  _refreshInvHighlights() {
    this.invCards.forEach(card => {
      const equipped = card.weapon === this.equippedWeapon;
      card.bg.setFillStyle(equipped ? 0x334488 : 0x2a2a4a);
      card.bg.setStrokeStyle(equipped ? 2 : 1, equipped ? 0x4fc3f7 : 0x4466aa);
      card.nameText.setColor(equipped ? '#ffdd00' : '#ffffff');
    });
  },
};

export default inventoryMethods;
