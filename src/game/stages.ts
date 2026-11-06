import { CellType, Direction, EnemyType, StageDefinition } from './types';

export const GRID_SIZE = 21;

// Returns the 3x3 pixel offsets active for a tank facing `dir`
export function getTankShapeOffsets(
  dir: Direction,
  isPlayer: boolean,
  enemyType: EnemyType = 'BASIC'
): Array<{ dx: number; dy: number; intensity: 'FULL' | 'MID' }> {
  // Standard 3x3 Brick Game Tank silhouette:
  // UP:
  // . # .
  // # # #
  // # . #
  const baseMap: Record<Direction, number[][]> = {
    UP: [
      [0, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
    DOWN: [
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 0],
    ],
    LEFT: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 1, 1],
    ],
    RIGHT: [
      [1, 1, 0],
      [0, 1, 1],
      [1, 1, 0],
    ],
  };

  // Commander / Armored enemy tanks fill their rear center cell as well so players can distinguish them on the LCD screen
  const matrix = baseMap[dir].map((row) => [...row]);
  if (!isPlayer && (enemyType === 'ARMORED' || enemyType === 'COMMANDER')) {
    if (dir === 'UP') matrix[2][1] = 1;
    if (dir === 'DOWN') matrix[0][1] = 1;
    if (dir === 'LEFT') matrix[1][2] = 1;
    if (dir === 'RIGHT') matrix[1][0] = 1;
  }

  const offsets: Array<{ dx: number; dy: number; intensity: 'FULL' | 'MID' }> = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (matrix[r][c] === 1) {
        const isCenter = r === 1 && c === 1;
        offsets.push({
          dx: c - 1,
          dy: r - 1,
          intensity: !isPlayer && enemyType === 'SCOUT' && isCenter ? 'MID' : 'FULL',
        });
      }
    }
  }
  return offsets;
}

// Helper to create an empty 21x21 grid with optional base at bottom center
export function createBaseGrid(includeBase: boolean = true): number[][] {
  const grid: number[][] = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => CellType.EMPTY)
  );

  if (includeBase) {
    // Base core occupies center (10, 19), i.e., x: 9..11, y: 18..20
    for (let y = 18; y <= 20; y++) {
      for (let x = 9; x <= 11; x++) {
        grid[y][x] = CellType.BASE_CORE;
      }
    }
    // Protective brick wall around the base (x: 8..12, y: 17..20)
    for (let y = 17; y <= 20; y++) {
      for (let x = 8; x <= 12; x++) {
        if (grid[y][x] === CellType.EMPTY) {
          grid[y][x] = CellType.BRICK;
        }
      }
    }
  }

  return grid;
}

function stampRect(grid: number[][], x1: number, y1: number, x2: number, y2: number, type: CellType) {
  for (let y = Math.max(0, y1); y <= Math.min(GRID_SIZE - 1, y2); y++) {
    for (let x = Math.max(0, x1); x <= Math.min(GRID_SIZE - 1, x2); x++) {
      // Reserve top spawn zones: (1..3, 1..3), (9..11, 1..3), (17..19, 1..3)
      // Reserve player spawn zone: (4..6, 17..19)
      const inTopLeftSpawn = x <= 3 && y <= 3;
      const inTopCenterSpawn = x >= 9 && x <= 11 && y <= 3;
      const inTopRightSpawn = x >= 17 && y <= 3;
      const inPlayerSpawn = x >= 4 && x <= 6 && y >= 17;
      const inBaseZone = x >= 8 && x <= 12 && y >= 17;

      if (inTopLeftSpawn || inTopCenterSpawn || inTopRightSpawn || inPlayerSpawn || inBaseZone) {
        continue;
      }
      grid[y][x] = type;
    }
  }
}

export const STAGES: StageDefinition[] = [
  {
    id: 1,
    name: 'MÀN 01 · PHÁO ĐÀI GẠCH',
    subtitle: 'Bố cục tường gạch cổ điển, nhịp độ vừa phải để làm quen tay cầm.',
    enemyQuota: 12,
    maxActiveEnemies: 3,
    grid: (() => {
      const g = createBaseGrid(true);
      // Four vertical brick pillars
      stampRect(g, 3, 5, 4, 13, CellType.BRICK);
      stampRect(g, 7, 5, 8, 11, CellType.BRICK);
      stampRect(g, 12, 5, 13, 11, CellType.BRICK);
      stampRect(g, 16, 5, 17, 13, CellType.BRICK);
      // Center steel crossbar
      stampRect(g, 9, 9, 11, 10, CellType.STEEL);
      // Lower flank walls
      stampRect(g, 1, 14, 3, 15, CellType.BRICK);
      stampRect(g, 17, 14, 19, 15, CellType.BRICK);
      return g;
    })(),
  },
  {
    id: 2,
    name: 'MÀN 02 · CẦU QUA SÔNG',
    subtitle: 'Dòng sông cắt ngang chiến trường với hai cây cầu hẹp chiến lược.',
    enemyQuota: 15,
    maxActiveEnemies: 3,
    grid: (() => {
      const g = createBaseGrid(true);
      // River across row 9..10 with bridges at x=5..7 and x=13..15
      stampRect(g, 0, 9, 4, 10, CellType.WATER);
      stampRect(g, 8, 9, 12, 10, CellType.WATER);
      stampRect(g, 16, 9, 20, 10, CellType.WATER);

      // Brick bunkers North and South of bridges
      stampRect(g, 4, 5, 8, 6, CellType.BRICK);
      stampRect(g, 12, 5, 16, 6, CellType.BRICK);
      stampRect(g, 2, 13, 6, 14, CellType.BRICK);
      stampRect(g, 14, 13, 18, 14, CellType.BRICK);
      stampRect(g, 9, 13, 11, 14, CellType.STEEL);
      return g;
    })(),
  },
  {
    id: 3,
    name: 'MÀN 03 · MÊ CUNG THÉP',
    subtitle: 'Các khối thép bất khả xâm phạm tạo hành lang đấu súng trực diện.',
    enemyQuota: 18,
    maxActiveEnemies: 4,
    grid: (() => {
      const g = createBaseGrid(true);
      stampRect(g, 4, 4, 5, 7, CellType.STEEL);
      stampRect(g, 15, 4, 16, 7, CellType.STEEL);
      stampRect(g, 9, 6, 11, 7, CellType.STEEL);

      stampRect(g, 2, 10, 6, 11, CellType.BRICK);
      stampRect(g, 14, 10, 18, 11, CellType.BRICK);
      stampRect(g, 8, 10, 12, 12, CellType.BRICK);

      stampRect(g, 4, 14, 5, 15, CellType.STEEL);
      stampRect(g, 15, 14, 16, 15, CellType.STEEL);
      return g;
    })(),
  },
  {
    id: 4,
    name: 'MÀN 04 · PHÒNG TUYẾN ĐÔI',
    subtitle: 'Lực lượng xe tăng thiết giáp hạng nặng tấn công dồn dập từ 3 mũi.',
    enemyQuota: 20,
    maxActiveEnemies: 4,
    grid: (() => {
      const g = createBaseGrid(true);
      // Checkerboard bunkers
      for (let x = 2; x <= 18; x += 4) {
        stampRect(g, x, 5, x + 1, 6, CellType.BRICK);
        stampRect(g, x, 12, x + 1, 13, CellType.BRICK);
      }
      stampRect(g, 0, 8, 2, 9, CellType.STEEL);
      stampRect(g, 18, 8, 20, 9, CellType.STEEL);
      stampRect(g, 7, 8, 13, 9, CellType.BRICK);
      stampRect(g, 9, 14, 11, 14, CellType.STEEL);
      return g;
    })(),
  },
  {
    id: 5,
    name: 'MÀN 05 · TRẬN ĐỊA CUỐI CÙNG',
    subtitle: 'Thử thách tốc độ cao chuẩn máy Brick Game 9999-in-1 cấp độ 9.',
    enemyQuota: 24,
    maxActiveEnemies: 4,
    grid: (() => {
      const g = createBaseGrid(true);
      stampRect(g, 3, 4, 7, 5, CellType.BRICK);
      stampRect(g, 13, 4, 17, 5, CellType.BRICK);
      stampRect(g, 5, 7, 6, 11, CellType.WATER);
      stampRect(g, 14, 7, 15, 11, CellType.WATER);
      stampRect(g, 8, 7, 12, 8, CellType.STEEL);
      stampRect(g, 8, 11, 12, 12, CellType.BRICK);
      stampRect(g, 1, 13, 4, 14, CellType.BRICK);
      stampRect(g, 16, 13, 19, 14, CellType.BRICK);
      return g;
    })(),
  },
];
