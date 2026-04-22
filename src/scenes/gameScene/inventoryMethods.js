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
    this.invCardW = cardW;
    this.invCardH = cardH;

    const overlay = this.add.rectangle(cx, this.H / 2, this.W, this.H, 0x000000, 0.65).setScrollFactor(SF).setDepth(D).setInteractive();
    const panelBg = this.add.rectangle(cx, this.H / 2, panelW, panelH, 0x1a1a2e).setStrokeStyle(2, 0x4fc3f7).setScrollFactor(SF).setDepth(D);
    this.invTitle = this.add
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

    this.invShellElements = [overlay, panelBg, this.invTitle, equippedLabel, divGfx, bagLabel, ...this.invSlotBgs, closeBtn];
    this.invShellElements.forEach(el => {
      this._addUi(el);
      el.setVisible(false);
    });

    this.invAllCards = [];
    for (const char of this.chars) {
      for (const weapon of char.inventory) {
        if (!weapon) continue;
        const card = this._buildWeaponCard(char, weapon, cx, cardW, SF, D);
        char.invCards.push(card);
        char.invCardsByWeapon.set(weapon, card);
        this.invAllCards.push(card);
      }
    }

    this.dragCard = null;
    this.dragFromSlot = -1;

    this.input.on('pointermove', ptr => {
      if (this.dragCard && this.inventoryOpen) this._updateCardDrag(ptr);
    });
    this.input.on('pointerup', ptr => {
      if (this.dragCard && this.inventoryOpen) this._endCardDrag(ptr);
    });

    this.invAllCards.forEach(card => {
      [card.bg, card.nameText, card.statsText, card.abilityText].forEach(el => {
        this._addUi(el);
        el.setVisible(false);
      });
    });
  },

  _buildWeaponCard(char, weapon, cx, cardW, SF, D) {
    const si = char.inventory.indexOf(weapon);
    const sx = cx;
    const sy = si >= 0 ? this.invSlotYs[si] : -200;

    const cardBg = this.add
      .rectangle(sx, sy, cardW, this.invCardH, 0x2a2a4a)
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

    const card = { bg: cardBg, nameText, statsText, abilityText, weapon, char };

    cardBg.on('pointerdown', () => {
      if (this.chars[this.activeIdx] !== char) return;
      this.justAttacked = true;
      this._startCardDrag(card);
    });

    return card;
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
    const cardW = this.invCardW;
    card.bg.setPosition(ptr.x, ptr.y);
    card.nameText.setPosition(ptr.x - cardW / 2 + 12, ptr.y - 10);
    card.statsText.setPosition(ptr.x + cardW / 2 - 10, ptr.y + 10);
    card.abilityText.setPosition(ptr.x - cardW / 2 + 12, ptr.y + 10);
  },

  _endCardDrag(ptr) {
    const card = this.dragCard;
    this.dragCard = null;
    const cardW = this.invCardW;
    const cardH = this.invCardH;

    const targetSlot = this.invSlotYs.findIndex(
      sy => Math.abs(ptr.x - this.invSlotX) < cardW / 2 && Math.abs(ptr.y - sy) < cardH / 2
    );

    const prevEquipped = this.invSlotWeapons[0];

    if (targetSlot >= 0 && targetSlot !== this.dragFromSlot) {
      const from = this.dragFromSlot;
      const weaponA = this.invSlotWeapons[from];
      const weaponB = this.invSlotWeapons[targetSlot];

      this.invSlotWeapons[targetSlot] = weaponA;
      this.invSlotWeapons[from] = weaponB ?? null;

      this._moveCardToSlot(this.invCardsByWeapon.get(weaponA), targetSlot);
      if (weaponB) this._moveCardToSlot(this.invCardsByWeapon.get(weaponB), from);

      if (this.invSlotWeapons[0] !== prevEquipped) {
        this._onEquipChanged();
      }
    } else {
      this._moveCardToSlot(card, this.dragFromSlot);
    }

    this._refreshInvHighlights();
  },

  _moveCardToSlot(card, slotIdx) {
    const sx = this.invSlotX;
    const sy = this.invSlotYs[slotIdx];
    const cardW = this.invCardW;
    card.bg.setPosition(sx, sy).setDepth(26);
    card.nameText.setPosition(sx - cardW / 2 + 12, sy - 10).setDepth(27);
    card.statsText.setPosition(sx + cardW / 2 - 10, sy + 10).setDepth(27);
    card.abilityText.setPosition(sx - cardW / 2 + 12, sy + 10).setDepth(27);
  },

  _openInventory() {
    const active = this._activeChar();
    this.invSlotWeapons = active.inventory;
    this.invCardsByWeapon = active.invCardsByWeapon;
    this.invTitle.setText(`INVENTORY \u2014 Char ${active.id}`);

    // Move the active char's cards to their current slot positions (others stay offscreen)
    for (const card of this.invAllCards) {
      const visible = card.char === active && active.inventory.includes(card.weapon);
      [card.bg, card.nameText, card.statsText, card.abilityText].forEach(el => el.setVisible(visible));
      if (visible) {
        const slot = active.inventory.indexOf(card.weapon);
        if (slot >= 0) this._moveCardToSlot(card, slot);
      }
    }

    this.invShellElements.forEach(el => el.setVisible(true));
    this._refreshInvHighlights();
    this.inventoryOpen = true;
  },

  _closeInventory() {
    this.invShellElements.forEach(el => el.setVisible(false));
    for (const card of this.invAllCards) {
      [card.bg, card.nameText, card.statsText, card.abilityText].forEach(el => el.setVisible(false));
    }
    this.inventoryOpen = false;
  },

  _onEquipChanged() {
    this.weaponText.setText(this._weaponLabel());
    this._drawAttackRange();
    this._updateDummyOutline();
  },

  _refreshInvHighlights() {
    const equipped = this.invSlotWeapons[0];
    for (const card of this.invAllCards) {
      if (card.char !== this._activeChar()) continue;
      const isEq = card.weapon === equipped;
      card.bg.setFillStyle(isEq ? 0x334488 : 0x2a2a4a);
      card.bg.setStrokeStyle(isEq ? 2 : 1, isEq ? 0x4fc3f7 : 0x4466aa);
      card.nameText.setColor(isEq ? '#ffdd00' : '#ffffff');
    }
  },
};

export default inventoryMethods;
