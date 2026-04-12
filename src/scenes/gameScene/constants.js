import { MAP_ROWS, MAP_COLS } from '../../mapGen.js';

export { MAP_ROWS, MAP_COLS };
export const MAP_SEED = 556432165;

export const TILE = 32;
export const MAX_DISTANCE = 160;
export const SPEED = 160;

export const DUMMY_HP = 50;
export const PLAYER_HALF = (TILE - 4) / 2;

export const WEAPONS = [
  { name: 'Dagger', range: 40, damage: 15, cost: 30, abilities: [{ type: 'crit_range', value: 4 }] },
  { name: 'Sword', range: 80, damage: 10, cost: 50, abilities: [{ type: 'block', value: 3 }] },
  { name: 'Spear', range: 130, damage: 7, cost: 40, abilities: [{ type: 'brace', value: 1 }] },
];

export const PLAYER_HP = 100;
export const ENEMY_MOVE = 100;

export const WORLD_W = MAP_COLS * TILE;
export const WORLD_H = MAP_ROWS * TILE;

export const JOY_RADIUS = 50;
export const JOY_KNOB_RADIUS = 22;
export const JOY_MARGIN = 80;
