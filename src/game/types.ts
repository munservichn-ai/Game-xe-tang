export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'ROUND_SUMMARY' | 'GAME_OVER' | 'MAP_BUILDER';

export type GameMode = 'CLASSIC_DEFENSE' | 'ARENA_SURVIVAL' | 'BOSS_RUSH';

export type ShellTheme = 'CLASSIC_GREY' | 'ROYAL_BLUE' | 'TRANSLUCENT_SMOKE' | 'RETRO_YELLOW';

export type LcdPaletteId = 'OLIVE_MATRIX' | 'AMBER_BACKLIT' | 'POCKET_MONO';

export enum CellType {
  EMPTY = 0,
  BRICK = 1,
  STEEL = 2,
  WATER = 3,
  BASE_CORE = 4,
}

export type EnemyType = 'BASIC' | 'SCOUT' | 'ARMORED' | 'COMMANDER';

export interface Tank {
  id: string;
  x: number; // Center X in 21x21 grid (1..19)
  y: number; // Center Y in 21x21 grid (1..19)
  dir: Direction;
  isPlayer: boolean;
  enemyType?: EnemyType;
  hp: number;
  maxHp: number;
  moveCooldown: number;
  shootCooldown: number;
  isBonusCarrier?: boolean;
  shieldTicks?: number;
  rapidFireTicks?: number;
}

export interface Bullet {
  id: string;
  x: number;
  y: number;
  dir: Direction;
  isPlayer: boolean;
  power: number;
}

export interface ExplosionParticle {
  id: string;
  x: number;
  y: number;
  radius: number; // 1 = single pixel, 2 = 3x3 burst
  ticksLeft: number;
}

export type PowerUpType = 'SHIELD' | 'FREEZE' | 'FORTIFY' | 'RAPID' | 'BOMB' | 'EXTRA_LIFE';

export interface PowerUpItem {
  id: string;
  x: number;
  y: number;
  type: PowerUpType;
  ticksLeft: number;
}

export interface StageDefinition {
  id: number;
  name: string;
  subtitle: string;
  enemyQuota: number;
  maxActiveEnemies: number;
  grid: number[][]; // 21x21 matrix of CellType
}

export interface HighScoreRecord {
  id: string;
  score: number;
  stage: number;
  mode: GameMode;
  date: string;
}
