import React from 'react';
import {
  Bullet,
  CellType,
  ExplosionParticle,
  GameMode,
  GameState,
  LcdPaletteId,
  PowerUpItem,
  Tank,
} from '../game/types';
import { getTankShapeOffsets, GRID_SIZE } from '../game/stages';

export interface LcdPaletteConfig {
  id: LcdPaletteId;
  name: string;
  screenBg: string;
  screenInnerShadow: string;
  inkFull: string;
  inkMid: string;
  inkGhost: string;
  borderColor: string;
}

export const LCD_PALETTES: Record<LcdPaletteId, LcdPaletteConfig> = {
  OLIVE_MATRIX: {
    id: 'OLIVE_MATRIX',
    name: 'Tinh Thể Lỏng Xanh Rêu (1990)',
    screenBg: '#9BBC0F',
    screenInnerShadow: 'inset 0 3px 10px rgba(15, 56, 15, 0.35)',
    inkFull: '#0F380F',
    inkMid: '#306230',
    inkGhost: 'rgba(15, 56, 15, 0.13)',
    borderColor: '#0F380F',
  },
  AMBER_BACKLIT: {
    id: 'AMBER_BACKLIT',
    name: 'Đèn Nền Hổ Phách (Amber LED)',
    screenBg: '#D99B26',
    screenInnerShadow: 'inset 0 3px 12px rgba(45, 24, 2, 0.4)',
    inkFull: '#241202',
    inkMid: '#593108',
    inkGhost: 'rgba(36, 18, 2, 0.14)',
    borderColor: '#241202',
  },
  POCKET_MONO: {
    id: 'POCKET_MONO',
    name: 'Xám Bạc Cổ Điển (Brick 9999)',
    screenBg: '#B8C4B8',
    screenInnerShadow: 'inset 0 3px 10px rgba(20, 28, 20, 0.32)',
    inkFull: '#182018',
    inkMid: '#455245',
    inkGhost: 'rgba(24, 32, 24, 0.12)',
    borderColor: '#182018',
  },
};

interface LcdMatrixScreenProps {
  grid: number[][];
  player: Tank | null;
  enemies: Tank[];
  bullets: Bullet[];
  explosions: ExplosionParticle[];
  powerUps: PowerUpItem[];
  score: number;
  highScore: number;
  lives: number;
  stageNumber: number;
  enemiesRemaining: number;
  speedLevel: number;
  gameState: GameState;
  gameMode: GameMode;
  baseDestroyed: boolean;
  freezeTicks: number;
  fortifyTicks: number;
  tickCount: number;
  paletteId: LcdPaletteId;
  soundMuted: boolean;
  builderBrush: CellType;
  onCellPaint?: (x: number, y: number) => void;
  onStartGame: () => void;
}

type PixelRenderState = {
  active: boolean;
  kind:
    | 'OFF'
    | 'TANK_FULL'
    | 'TANK_MID'
    | 'PLAYER_CORE'
    | 'BRICK'
    | 'STEEL'
    | 'WATER'
    | 'BASE'
    | 'BULLET'
    | 'EXPLOSION'
    | 'POWERUP'
    | 'SHIELD_RING';
  label?: string;
};

export const LcdMatrixScreen: React.FC<LcdMatrixScreenProps> = ({
  grid,
  player,
  enemies,
  bullets,
  explosions,
  powerUps,
  score,
  highScore,
  lives,
  stageNumber,
  enemiesRemaining,
  speedLevel,
  gameState,
  gameMode,
  baseDestroyed,
  freezeTicks,
  fortifyTicks,
  tickCount,
  paletteId,
  soundMuted,
  onCellPaint,
  onStartGame,
}) => {
  const palette = LCD_PALETTES[paletteId];
  const [isPainting, setIsPainting] = React.useState(false);

  // Build 21x21 composite pixel buffer for current frame
  const pixelBuffer: PixelRenderState[][] = React.useMemo(() => {
    const buf: PixelRenderState[][] = Array.from({ length: GRID_SIZE }, () =>
      Array.from({ length: GRID_SIZE }, () => ({ active: false, kind: 'OFF' }))
    );

    // 1. Static terrain from grid
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = grid[y]?.[x] ?? CellType.EMPTY;
        if (cell === CellType.BRICK) {
          buf[y][x] = { active: true, kind: 'BRICK' };
        } else if (cell === CellType.STEEL) {
          buf[y][x] = { active: true, kind: 'STEEL' };
        } else if (cell === CellType.WATER) {
          buf[y][x] = { active: true, kind: 'WATER' };
        } else if (cell === CellType.BASE_CORE) {
          // 3x3 Command Base Eagle pattern at x: 9..11, y: 18..20
          const bx = x - 9;
          const by = y - 18;
          const eaglePattern = baseDestroyed
            ? [
                [1, 0, 1],
                [0, 1, 0],
                [1, 0, 1],
              ]
            : [
                [1, 1, 1],
                [0, 1, 0],
                [1, 1, 1],
              ];
          if (eaglePattern[by]?.[bx] === 1) {
            buf[y][x] = { active: true, kind: 'BASE' };
          }
        }
      }
    }

    // 2. Power-Ups (blink on LCD)
    powerUps.forEach((pu) => {
      if (pu.x >= 0 && pu.x < GRID_SIZE && pu.y >= 0 && pu.y < GRID_SIZE) {
        const blinkOn = Math.floor(tickCount / 2) % 2 === 0;
        const symbolMap: Record<PowerUpItem['type'], string> = {
          SHIELD: 'S',
          FREEZE: 'F',
          FORTIFY: 'W',
          RAPID: 'R',
          BOMB: 'B',
          EXTRA_LIFE: '+',
        };
        buf[pu.y][pu.x] = {
          active: blinkOn,
          kind: 'POWERUP',
          label: symbolMap[pu.type],
        };
      }
    });

    // 3. Enemy Tanks
    enemies.forEach((enemy) => {
      // Bonus carrier blinks moderately
      if (enemy.isBonusCarrier && tickCount % 4 === 0) {
        return;
      }
      const offsets = getTankShapeOffsets(enemy.dir, false, enemy.enemyType);
      offsets.forEach(({ dx, dy, intensity }) => {
        const px = enemy.x + dx;
        const py = enemy.y + dy;
        if (px >= 0 && px < GRID_SIZE && py >= 0 && py < GRID_SIZE) {
          buf[py][px] = {
            active: true,
            kind: intensity === 'MID' ? 'TANK_MID' : 'TANK_FULL',
          };
        }
      });
    });

    // 4. Player Tank
    if (player && player.hp > 0) {
      const offsets = getTankShapeOffsets(player.dir, true);
      offsets.forEach(({ dx, dy }) => {
        const px = player.x + dx;
        const py = player.y + dy;
        if (px >= 0 && px < GRID_SIZE && py >= 0 && py < GRID_SIZE) {
          const isCenter = dx === 0 && dy === 0;
          buf[py][px] = {
            active: true,
            kind: isCenter ? 'PLAYER_CORE' : 'TANK_FULL',
          };
        }
      });

      // If player has active shield, blink the 4 corner pixels of its 3x3 bounding box
      if (player.shieldTicks && player.shieldTicks > 0 && tickCount % 2 === 0) {
        const corners = [
          { dx: -1, dy: -1 },
          { dx: 1, dy: -1 },
          { dx: -1, dy: 1 },
          { dx: 1, dy: 1 },
        ];
        corners.forEach(({ dx, dy }) => {
          const px = player.x + dx;
          const py = player.y + dy;
          if (px >= 0 && px < GRID_SIZE && py >= 0 && py < GRID_SIZE && !buf[py][px].active) {
            buf[py][px] = { active: true, kind: 'SHIELD_RING' };
          }
        });
      }
    }

    // 5. Bullets
    bullets.forEach((b) => {
      if (b.x >= 0 && b.x < GRID_SIZE && b.y >= 0 && b.y < GRID_SIZE) {
        buf[b.y][b.x] = { active: true, kind: 'BULLET' };
      }
    });

    // 6. Explosions
    explosions.forEach((exp) => {
      if (exp.radius === 1) {
        if (exp.x >= 0 && exp.x < GRID_SIZE && exp.y >= 0 && exp.y < GRID_SIZE) {
          buf[exp.y][exp.x] = { active: true, kind: 'EXPLOSION' };
        }
      } else {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const isChecker = (Math.abs(dx) + Math.abs(dy) + exp.ticksLeft) % 2 === 0;
            const px = exp.x + dx;
            const py = exp.y + dy;
            if (isChecker && px >= 0 && px < GRID_SIZE && py >= 0 && py < GRID_SIZE) {
              buf[py][px] = { active: true, kind: 'EXPLOSION' };
            }
          }
        }
      }
    });

    return buf;
  }, [grid, player, enemies, bullets, explosions, powerUps, baseDestroyed, tickCount]);

  // Mini 4x4 LCD preview matrix for "NEXT ENEMY / RADAR" in the right sidebar
  const miniPreviewMatrix = [
    [0, 1, 0, 0],
    [1, 1, 1, 0],
    [1, 0, 1, 0],
    [0, 0, 0, 0],
  ];

  return (
    <div
      className="relative rounded-md p-2.5 sm:p-3.5 select-none transition-colors duration-200 border-2"
      style={{
        backgroundColor: palette.screenBg,
        boxShadow: palette.screenInnerShadow,
        borderColor: palette.borderColor,
        color: palette.inkFull,
      }}
      onPointerUp={() => setIsPainting(false)}
      onPointerLeave={() => setIsPainting(false)}
    >
      {/* Top LCD Micro Status Header */}
      <div
        className="flex items-center justify-between pb-1.5 mb-2 border-b text-[10px] font-mono-tabular font-bold tracking-wider"
        style={{ borderColor: palette.inkMid }}
      >
        <div className="flex items-center gap-2">
          <span>9999-IN-1 LCD MATRIX</span>
          <span>·</span>
          <span>
            {gameMode === 'CLASSIC_DEFENSE'
              ? 'THỦ CĂN CỨ'
              : gameMode === 'ARENA_SURVIVAL'
              ? 'ĐẤU TRƯỜNG'
              : 'ĐỘI QUÂN TRÙM'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {freezeTicks > 0 && <span className="px-1 border border-current">BĂNG:{Math.ceil(freezeTicks / 5)}s</span>}
          {fortifyTicks > 0 && <span className="px-1 border border-current">THÉP:{Math.ceil(fortifyTicks / 5)}s</span>}
          <span>{soundMuted ? 'ÂM:TẮT' : 'ÂM:BẬT'}</span>
        </div>
      </div>

      {/* Main LCD Split: Left 21x21 Dot Matrix Arena + Right Brick Game Segment HUD */}
      <div className="grid grid-cols-[1fr_104px] sm:grid-cols-[1fr_118px] gap-2.5 items-stretch">
        {/* Left: 21x21 Playfield Matrix */}
        <div
          className="relative aspect-square w-full border-2 p-1"
          style={{ borderColor: palette.inkFull }}
        >
          <div
            className="grid w-full h-full gap-[1px]"
            style={{
              gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
            }}
          >
            {pixelBuffer.map((row, y) =>
              row.map((cell, x) => {
                const isInteractive = gameState === 'MAP_BUILDER' && onCellPaint;
                return (
                  <div
                    key={`${y}-${x}`}
                    onPointerDown={() => {
                      if (isInteractive) {
                        setIsPainting(true);
                        onCellPaint(x, y);
                      }
                    }}
                    onPointerEnter={() => {
                      if (isInteractive && isPainting) {
                        onCellPaint(x, y);
                      }
                    }}
                    className={`relative w-full h-full flex items-center justify-center ${
                      isInteractive ? 'cursor-pointer' : ''
                    }`}
                    style={{
                      border: `1px solid ${
                        cell.active ? palette.inkFull : palette.inkGhost
                      }`,
                      backgroundColor:
                        cell.kind === 'TANK_FULL' ||
                        cell.kind === 'STEEL' ||
                        cell.kind === 'BULLET' ||
                        cell.kind === 'BASE'
                          ? palette.inkFull
                          : cell.kind === 'TANK_MID' || cell.kind === 'BRICK'
                          ? palette.inkMid
                          : cell.kind === 'POWERUP' && cell.active
                          ? palette.inkFull
                          : 'transparent',
                    }}
                  >
                    {/* Inner LCD Segment Detail for Authentic 90s Brick Game Look */}
                    {!cell.active && (
                      <div
                        className="w-[55%] h-[55%]"
                        style={{ backgroundColor: palette.inkGhost }}
                      />
                    )}

                    {cell.kind === 'PLAYER_CORE' && (
                      <div
                        className="w-[68%] h-[68%] border"
                        style={{
                          backgroundColor: palette.inkFull,
                          borderColor: palette.screenBg,
                        }}
                      />
                    )}

                    {cell.kind === 'BRICK' && (
                      <div
                        className="w-full h-full grid grid-cols-2 grid-rows-2 gap-[1px] p-[1px]"
                        style={{ backgroundColor: palette.screenBg }}
                      >
                        <div style={{ backgroundColor: palette.inkFull }} />
                        <div style={{ backgroundColor: palette.inkFull }} />
                        <div style={{ backgroundColor: palette.inkFull }} />
                        <div style={{ backgroundColor: palette.inkFull }} />
                      </div>
                    )}

                    {cell.kind === 'STEEL' && (
                      <div
                        className="w-[56%] h-[56%] border"
                        style={{
                          backgroundColor: palette.screenBg,
                          borderColor: palette.inkFull,
                        }}
                      />
                    )}

                    {cell.kind === 'WATER' && (
                      <div className="w-full h-full flex flex-col justify-evenly px-[1px]">
                        <div
                          className="h-[2px] w-full"
                          style={{
                            backgroundColor:
                              (x + y + Math.floor(tickCount / 3)) % 2 === 0
                                ? palette.inkFull
                                : palette.inkMid,
                          }}
                        />
                        <div
                          className="h-[2px] w-full"
                          style={{
                            backgroundColor:
                              (x + y + Math.floor(tickCount / 3)) % 2 === 1
                                ? palette.inkFull
                                : palette.inkMid,
                          }}
                        />
                      </div>
                    )}

                    {cell.kind === 'EXPLOSION' && (
                      <div
                        className="w-[75%] h-[75%] rotate-45"
                        style={{ backgroundColor: palette.inkFull }}
                      />
                    )}

                    {cell.kind === 'SHIELD_RING' && (
                      <div
                        className="w-[65%] h-[65%]"
                        style={{ backgroundColor: palette.inkMid }}
                      />
                    )}

                    {cell.kind === 'POWERUP' && cell.label && (
                      <span
                        className="text-[8px] sm:text-[9px] font-mono-tabular font-extrabold leading-none"
                        style={{
                          color: cell.active ? palette.screenBg : palette.inkFull,
                        }}
                      >
                        {cell.label}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* LCD State Overlays (Rendered in Authentic Dot-Matrix Box Style) */}
          {gameState === 'TITLE_MENU' && (
            <div
              className="absolute inset-2 flex flex-col items-center justify-between p-3 border-2 text-center"
              style={{
                backgroundColor: palette.screenBg,
                borderColor: palette.inkFull,
              }}
            >
              <div className="w-full flex items-center justify-between text-[10px] font-mono-tabular font-bold border-b pb-1" style={{ borderColor: palette.inkMid }}>
                <span>BRICK GAME</span>
                <span>TANK-9999</span>
              </div>

              <div className="my-auto space-y-2">
                <div className="inline-block border-2 px-2.5 py-1 font-mono-tabular font-extrabold text-base sm:text-lg tracking-widest" style={{ borderColor: palette.inkFull }}>
                  BẮN XE TĂNG
                </div>
                <p className="text-[11px] font-semibold leading-tight max-w-[200px] mx-auto">
                  Bảo vệ sở chỉ huy & tiêu diệt đoàn xe thiết giáp trên màn hình LCD cổ điển.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={onStartGame}
                    className="tactile-btn px-3 py-1.5 text-xs font-mono-tabular font-bold tracking-wider border-2 cursor-pointer"
                    style={{
                      backgroundColor: palette.inkFull,
                      color: palette.screenBg,
                      borderColor: palette.inkFull,
                    }}
                  >
                    BẤM START ĐỂ CHƠI
                  </button>
                </div>
              </div>

              <div className="w-full text-[10px] font-mono-tabular font-bold border-t pt-1 flex justify-between" style={{ borderColor: palette.inkMid }}>
                <span>WASD / PHÍM MŨI TÊN</span>
                <span>SPACE: BẮN</span>
              </div>
            </div>
          )}

          {gameState === 'PAUSED' && (
            <div
              className="absolute inset-x-4 top-1/2 -translate-y-1/2 p-3 border-2 text-center space-y-2"
              style={{
                backgroundColor: palette.screenBg,
                borderColor: palette.inkFull,
              }}
            >
              <div className="font-mono-tabular font-extrabold text-sm tracking-widest">
                TẠM DỪNG (PAUSE)
              </div>
              <p className="text-[11px] font-medium">
                Nhấn nút START/PAUSE hoặc phím P để tiếp tục trận đấu.
              </p>
              <button
                type="button"
                onClick={onStartGame}
                className="tactile-btn px-3 py-1 text-xs font-mono-tabular font-bold border cursor-pointer"
                style={{
                  backgroundColor: palette.inkFull,
                  color: palette.screenBg,
                  borderColor: palette.inkFull,
                }}
              >
                TIẾP TỤC
              </button>
            </div>
          )}

          {gameState === 'ROUND_SUMMARY' && (
            <div
              className="absolute inset-3 flex flex-col items-center justify-center p-3 border-2 text-center space-y-2"
              style={{
                backgroundColor: palette.screenBg,
                borderColor: palette.inkFull,
              }}
            >
              <div className="text-xs font-mono-tabular font-bold tracking-widest border-b pb-1 w-full" style={{ borderColor: palette.inkMid }}>
                HOÀN THÀNH MÀN {String(stageNumber).padStart(2, '0')}
              </div>
              <div className="py-1 space-y-1 font-mono-tabular text-xs">
                <div>ĐIỂM HIỆN TẠI: {score}</div>
                <div>THƯỞNG QUA MÀN: +500</div>
              </div>
              <button
                type="button"
                onClick={onStartGame}
                className="tactile-btn px-3 py-1.5 text-xs font-mono-tabular font-bold border-2 cursor-pointer"
                style={{
                  backgroundColor: palette.inkFull,
                  color: palette.screenBg,
                  borderColor: palette.inkFull,
                }}
              >
                SANG MÀN TIẾP THEO
              </button>
            </div>
          )}

          {gameState === 'GAME_OVER' && (
            <div
              className="absolute inset-3 flex flex-col items-center justify-center p-3 border-2 text-center space-y-2"
              style={{
                backgroundColor: palette.screenBg,
                borderColor: palette.inkFull,
              }}
            >
              <div className="font-mono-tabular font-extrabold text-base tracking-widest border-b-2 pb-1 w-full" style={{ borderColor: palette.inkFull }}>
                GAME OVER
              </div>
              <p className="text-[11px] font-semibold">
                {baseDestroyed
                  ? 'Sở chỉ huy đã bị phá hủy!'
                  : 'Bạn đã hết lượt xe tăng dự phòng!'}
              </p>
              <div className="font-mono-tabular text-xs font-bold space-y-0.5">
                <div>TỔNG ĐIỂM: {score}</div>
                <div>KỶ LỤC: {highScore}</div>
              </div>
              <button
                type="button"
                onClick={onStartGame}
                className="tactile-btn px-3 py-1.5 text-xs font-mono-tabular font-bold border-2 cursor-pointer"
                style={{
                  backgroundColor: palette.inkFull,
                  color: palette.screenBg,
                  borderColor: palette.inkFull,
                }}
              >
                CHƠI LẠI TỪ ĐẦU
              </button>
            </div>
          )}
        </div>

        {/* Right: Classic Handheld LCD Segment Telemetry Bar */}
        <div
          className="flex flex-col justify-between border-2 p-1.5 font-mono-tabular"
          style={{ borderColor: palette.inkFull }}
        >
          {/* HI-SCORE & SCORE */}
          <div className="space-y-1.5">
            <div>
              <div className="text-[9px] font-bold tracking-tighter leading-none opacity-80">
                HI-SCORE
              </div>
              <div className="text-xs sm:text-sm font-extrabold tracking-tight leading-tight border-b pb-0.5" style={{ borderColor: palette.inkMid }}>
                {String(highScore).padStart(6, '0')}
              </div>
            </div>

            <div>
              <div className="text-[9px] font-bold tracking-tighter leading-none opacity-80">
                SCORE
              </div>
              <div className="text-xs sm:text-sm font-extrabold tracking-tight leading-tight border-b pb-0.5" style={{ borderColor: palette.inkMid }}>
                {String(score).padStart(6, '0')}
              </div>
            </div>
          </div>

          {/* 4x4 Mini Matrix Preview & Remaining Enemy Quota */}
          <div className="my-1">
            <div className="text-[9px] font-bold tracking-tighter leading-none mb-1">
              ĐỊCH CÒN: {String(enemiesRemaining).padStart(2, '0')}
            </div>
            <div
              className="grid grid-cols-4 grid-rows-4 gap-[1px] w-11 h-11 mx-auto p-0.5 border"
              style={{ borderColor: palette.inkMid }}
            >
              {miniPreviewMatrix.map((r, ry) =>
                r.map((val, rx) => (
                  <div
                    key={`mini-${ry}-${rx}`}
                    style={{
                      backgroundColor: val ? palette.inkFull : palette.inkGhost,
                    }}
                  />
                ))
              )}
            </div>
          </div>

          {/* Player Lives Indicator */}
          <div>
            <div className="text-[9px] font-bold tracking-tighter leading-none mb-1">
              MẠNG ({lives})
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {Array.from({ length: 4 }).map((_, idx) => {
                const active = idx < lives;
                return (
                  <div
                    key={`life-${idx}`}
                    className="w-3.5 h-3.5 border flex items-center justify-center text-[9px] font-extrabold"
                    style={{
                      borderColor: palette.inkFull,
                      backgroundColor: active ? palette.inkFull : 'transparent',
                      color: active ? palette.screenBg : palette.inkGhost,
                    }}
                  >
                    ▲
                  </div>
                );
              })}
            </div>
          </div>

          {/* Speed / Stage Footer */}
          <div className="space-y-1 pt-1 border-t" style={{ borderColor: palette.inkMid }}>
            <div className="flex items-center justify-between text-[10px] font-extrabold">
              <span>SPEED</span>
              <span>0{speedLevel}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] font-extrabold">
              <span>STAGE</span>
              <span>{String(stageNumber).padStart(2, '0')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
