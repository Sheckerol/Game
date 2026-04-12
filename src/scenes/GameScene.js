import setupMethods from './gameScene/setupMethods.js';
import fogDebugMethods from './gameScene/fogDebugMethods.js';
import combatMethods from './gameScene/combatMethods.js';
import inventoryMethods from './gameScene/inventoryMethods.js';
import renderAndUpdateMethods from './gameScene/renderAndUpdateMethods.js';

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }
}

Object.assign(
  GameScene.prototype,
  setupMethods,
  fogDebugMethods,
  combatMethods,
  inventoryMethods,
  renderAndUpdateMethods,
);

export default GameScene;
