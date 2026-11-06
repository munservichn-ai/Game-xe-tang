import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bullet,
  CellType,
  Direction,
  EnemyType,
  ExplosionParticle,
  GameMode,
  GameState,
  HighScoreRecord,
  LcdPaletteId,
  PowerUpItem,
  PowerUpType,
  ShellTheme,
  Tank,
} from './game/types';
import { createBaseGrid, GRID_SIZE, STAGES } from './game/stages';
import { LCD_PALETTES, LcdMatrixScreen } from './components/LcdMatrixScreen';
import { HandheldConsoleUnit, SHELL_THEMES } from './components/HandheldConsoleUnit';
import { soundEngine } from './audio/soundEngine';

const HIGH_SCORE_STORAGE_KEY = 'brick_tank_1990_highscores_v1';

const SPAWN_POINTS = [
  { x: 2, y: 2 },
  { x: 10, y: 2 },
  { x: 18, y: 2 },
];

const PLAYER_SPAWN = { x: 6, y: 19 };

function cloneGrid(grid: number[][]): number[][] {
  return grid.map((row) => [...row]);
}

function getDelta(dir: Direction): { dx: number; dy: number } {
  switch (dir) {
    case 'UP':
      return { dx: 0, dy: -1 };
    case 'DOWN':
      return { dx: 0, dy: 1 };
    case 'LEFT':
      return { dx: -1, dy: 0 };
    case 'RIGHT':
      return { dx: 1, dy: 0 };
  }
}

function tanksOverlap(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.abs(ax - bx) <= 2 && Math.abs(ay - by) <= 2;
}

function canTankOccupy(
  cx: number,
  cy: number,
  grid: number[][],
  ignoreId: string,
  allTanks: Tank[]
): boolean {
  if (cx < 1 || cx > GRID_SIZE - 2 || cy < 1 || cy > GRID_SIZE - 2) {
    return false;
  }
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cell = grid[cy + dy]?.[cx + dx] ?? CellType.EMPTY;
      if (cell !== CellType.EMPTY) {
        return false;
      }
    }
  }
  for (const t of allTanks) {
    if (t.id === ignoreId || t.hp <= 0) continue;
    if (tanksOverlap(cx, cy, t.x, t.y)) {
      return false;
    }
  }
  return true;
}

export default function App() {
  // Appearance & Hardware Settings
  const [shellTheme, setShellTheme] = useState<ShellTheme>('CLASSIC_GREY');
  const [paletteId, setPaletteId] = useState<LcdPaletteId>('OLIVE_MATRIX');
  const [soundMuted, setSoundMuted] = useState<boolean>(false);
  const [speedLevel, setSpeedLevel] = useState<number>(2); // 1..5

  // Game Mode & Stage State
  const [gameMode, setGameMode] = useState<GameMode>('CLASSIC_DEFENSE');
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [stageIndex, setStageIndex] = useState<number>(0); // 0..STAGES.length-1
  const [builderBrush, setBuilderBrush] = useState<CellType>(CellType.BRICK);
  const [customGrid, setCustomGrid] = useState<number[][] | null>(null);

  // Live Playfield Entities
  const [grid, setGrid] = useState<number[][]>(() => cloneGrid(STAGES[0].grid));
  const [player, setPlayer] = useState<Tank | null>(null);
  const [enemies, setEnemies] = useState<Tank[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [explosions, setExplosions] = useState<ExplosionParticle[]>([]);
  const [powerUps, setPowerUps] = useState<PowerUpItem[]>([]);

  // Telemetry & Counters
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(2500);
  const [highScoreHistory, setHighScoreHistory] = useState<HighScoreRecord[]>([
    { id: 'init-1', score: 2500, stage: 3, mode: 'CLASSIC_DEFENSE', date: '1994-08-15' },
    { id: 'init-2', score: 1800, stage: 2, mode: 'ARENA_SURVIVAL', date: '1993-12-05' },
  ]);
  const [lives, setLives] = useState<number>(3);
  const [enemiesRemaining, setEnemiesRemaining] = useState<number>(STAGES[0].enemyQuota);
  const [baseDestroyed, setBaseDestroyed] = useState<boolean>(false);
  const [freezeTicks, setFreezeTicks] = useState<number>(0);
  const [fortifyTicks, setFortifyTicks] = useState<number>(0);
  const [tickCount, setTickCount] = useState<number>(0);

  // Input Tracking Refs
  const [activeDirection, setActiveDirection] = useState<Direction | null>(null);
  const [isFiring, setIsFiring] = useState<boolean>(false);
  const heldDirectionRef = useRef<Direction | null>(null);
  const queuedDirectionRef = useRef<Direction | null>(null);
  const fireRequestedRef = useRef<boolean>(false);

  // Load High Scores from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIGH_SCORE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as HighScoreRecord[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setHighScoreHistory(parsed);
          setHighScore(Math.max(...parsed.map((r) => r.score), 2500));
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const recordHighScore = useCallback(
    (finalScore: number, reachedStage: number, mode: GameMode) => {
      if (finalScore <= 0) return;
      setHighScore((prev) => Math.max(prev, finalScore));
      setHighScoreHistory((prev) => {
        const nextRecord: HighScoreRecord = {
          id: `hs-${Date.now()}`,
          score: finalScore,
          stage: reachedStage,
          mode,
          date: new Date().toISOString().slice(0, 10),
        };
        const updated = [nextRecord, ...prev]
          .sort((a, b) => b.score - a.score)
          .slice(0, 6);
        try {
          localStorage.setItem(HIGH_SCORE_STORAGE_KEY, JSON.stringify(updated));
        } catch {
          // Ignore
        }
        return updated;
      });
    },
    []
  );

  // Initialize a Stage or Mode
  const initStage = useCallback(
    (targetStageIdx: number, mode: GameMode, resetScoreAndLives: boolean) => {
      const stageDef = STAGES[targetStageIdx % STAGES.length];
      let initialGrid = customGrid
        ? cloneGrid(customGrid)
        : cloneGrid(stageDef.grid);

      if (mode === 'ARENA_SURVIVAL') {
        // Remove base core in Arena Survival mode so player can roam freely
        for (let y = 17; y <= 20; y++) {
          for (let x = 8; x <= 12; x++) {
            if (initialGrid[y][x] === CellType.BASE_CORE) {
              initialGrid[y][x] = CellType.EMPTY;
            }
          }
        }
      }

      const spawnPos = mode === 'ARENA_SURVIVAL' ? { x: 10, y: 18 } : PLAYER_SPAWN;

      const newPlayer: Tank = {
        id: 'player',
        x: spawnPos.x,
        y: spawnPos.y,
        dir: 'UP',
        isPlayer: true,
        hp: 1,
        maxHp: 1,
        moveCooldown: 0,
        shootCooldown: 0,
        shieldTicks: 20, // Brief spawn protection
        rapidFireTicks: 0,
      };

      setGrid(initialGrid);
      setPlayer(newPlayer);
      setEnemies([]);
      setBullets([]);
      setExplosions([]);
      setPowerUps([]);
      setBaseDestroyed(false);
      setFreezeTicks(0);
      setFortifyTicks(0);

      const quota =
        mode === 'BOSS_RUSH'
          ? 10
          : stageDef.enemyQuota + Math.floor(targetStageIdx / STAGES.length) * 4;
      setEnemiesRemaining(quota);

      if (resetScoreAndLives) {
        setScore(0);
        setLives(3);
      }
    },
    [customGrid]
  );

  // Start / Resume / Advance Game Handler
  const handleStartOrPause = useCallback(() => {
    if (gameState === 'TITLE_MENU' || gameState === 'GAME_OVER' || gameState === 'MAP_BUILDER') {
      soundEngine.playStartJingle();
      const startIdx = gameState === 'GAME_OVER' ? 0 : stageIndex;
      if (gameState === 'GAME_OVER') {
        setStageIndex(0);
      }
      initStage(startIdx, gameMode, true);
      setGameState('PLAYING');
    } else if (gameState === 'ROUND_SUMMARY') {
      soundEngine.playStartJingle();
      const nextIdx = stageIndex + 1;
      setStageIndex(nextIdx);
      initStage(nextIdx, gameMode, false);
      setGameState('PLAYING');
    } else if (gameState === 'PLAYING') {
      soundEngine.playButtonBeep(520);
      setGameState('PAUSED');
    } else if (gameState === 'PAUSED') {
      soundEngine.playButtonBeep(880);
      setGameState('PLAYING');
    }
  }, [gameState, stageIndex, gameMode, initStage]);

  const handleResetGame = useCallback(() => {
    soundEngine.playButtonBeep(440);
    initStage(stageIndex, gameMode, true);
    setGameState('TITLE_MENU');
  }, [stageIndex, gameMode, initStage]);

  const handleToggleSound = useCallback(() => {
    const muted = soundEngine.toggleMute();
    setSoundMuted(muted);
  }, []);

  const handleCycleSpeed = useCallback(() => {
    soundEngine.playButtonBeep(660);
    setSpeedLevel((prev) => (prev % 5) + 1);
  }, []);

  // Direction & Fire Input Handlers
  const handleDirectionPress = useCallback((dir: Direction) => {
    heldDirectionRef.current = dir;
    queuedDirectionRef.current = dir;
    setActiveDirection(dir);
  }, []);

  const handleDirectionRelease = useCallback((dir: Direction) => {
    if (heldDirectionRef.current === dir) {
      heldDirectionRef.current = null;
      setActiveDirection(null);
    }
  }, []);

  const handleFirePress = useCallback(() => {
    if (gameState === 'TITLE_MENU' || gameState === 'ROUND_SUMMARY' || gameState === 'GAME_OVER') {
      handleStartOrPause();
      return;
    }
    fireRequestedRef.current = true;
    setIsFiring(true);
    setTimeout(() => setIsFiring(false), 120);
  }, [gameState, handleStartOrPause]);

  // Keyboard Listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', ' '].includes(e.key)) {
        e.preventDefault();
      }
      const key = e.key.toLowerCase();
      if (e.key === 'ArrowUp' || key === 'w') {
        handleDirectionPress('UP');
      } else if (e.key === 'ArrowDown' || key === 's') {
        handleDirectionPress('DOWN');
      } else if (e.key === 'ArrowLeft' || key === 'a') {
        handleDirectionPress('LEFT');
      } else if (e.key === 'ArrowRight' || key === 'd') {
        handleDirectionPress('RIGHT');
      } else if (e.key === ' ' || e.key === 'Enter' || key === 'j') {
        fireRequestedRef.current = true;
        setIsFiring(true);
      } else if (key === 'p') {
        handleStartOrPause();
      } else if (key === 'r') {
        handleResetGame();
      } else if (key === 'm') {
        handleToggleSound();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (e.key === 'ArrowUp' || key === 'w') {
        handleDirectionRelease('UP');
      } else if (e.key === 'ArrowDown' || key === 's') {
        handleDirectionRelease('DOWN');
      } else if (e.key === 'ArrowLeft' || key === 'a') {
        handleDirectionRelease('LEFT');
      } else if (e.key === 'ArrowRight' || key === 'd') {
        handleDirectionRelease('RIGHT');
      } else if (e.key === ' ' || e.key === 'Enter' || key === 'j') {
        setIsFiring(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    handleDirectionPress,
    handleDirectionRelease,
    handleStartOrPause,
    handleResetGame,
    handleToggleSound,
  ]);

  // Keep latest state in a ref for the deterministic LCD game tick loop
  const stateRef = useRef({
    grid,
    player,
    enemies,
    bullets,
    explosions,
    powerUps,
    score,
    lives,
    enemiesRemaining,
    baseDestroyed,
    freezeTicks,
    fortifyTicks,
    stageIndex,
    gameMode,
    gameState,
  });

  useEffect(() => {
    stateRef.current = {
      grid,
      player,
      enemies,
      bullets,
      explosions,
      powerUps,
      score,
      lives,
      enemiesRemaining,
      baseDestroyed,
      freezeTicks,
      fortifyTicks,
      stageIndex,
      gameMode,
      gameState,
    };
  });

  // Main Brick Game LCD Clock Loop
  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    // Speed 1 = 150ms, Speed 2 = 125ms, Speed 3 = 105ms, Speed 4 = 90ms, Speed 5 = 75ms
    const tickIntervalMs = Math.max(70, 170 - speedLevel * 20);

    const interval = setInterval(() => {
      setTickCount((c) => c + 1);

      const s = stateRef.current;
      if (s.gameState !== 'PLAYING') return;

      const nextGrid = cloneGrid(s.grid);
      let nextPlayer = s.player ? { ...s.player } : null;
      let nextEnemies = s.enemies.map((e) => ({ ...e }));
      let nextBullets = s.bullets.map((b) => ({ ...b }));
      let nextExplosions = s.explosions
        .map((ex) => ({ ...ex, ticksLeft: ex.ticksLeft - 1 }))
        .filter((ex) => ex.ticksLeft > 0);
      let nextPowerUps = s.powerUps
        .map((pu) => ({ ...pu, ticksLeft: pu.ticksLeft - 1 }))
        .filter((pu) => pu.ticksLeft > 0);

      let nextScore = s.score;
      let nextLives = s.lives;
      let nextEnemiesRemaining = s.enemiesRemaining;
      let nextBaseDestroyed = s.baseDestroyed;
      let nextFreezeTicks = Math.max(0, s.freezeTicks - 1);
      let nextFortifyTicks = Math.max(0, s.fortifyTicks - 1);

      // Revert base fortification wall back to brick when fortify timer expires
      if (s.fortifyTicks === 1 && s.gameMode === 'CLASSIC_DEFENSE') {
        for (let y = 17; y <= 20; y++) {
          for (let x = 8; x <= 12; x++) {
            if (nextGrid[y][x] === CellType.STEEL) {
              nextGrid[y][x] = CellType.BRICK;
            }
          }
        }
      }

      // 1. Update Player Cooldowns, Movement & Shooting
      if (nextPlayer && nextPlayer.hp > 0) {
        if (nextPlayer.moveCooldown > 0) nextPlayer.moveCooldown--;
        if (nextPlayer.shootCooldown > 0) nextPlayer.shootCooldown--;
        if (nextPlayer.shieldTicks && nextPlayer.shieldTicks > 0) nextPlayer.shieldTicks--;
        if (nextPlayer.rapidFireTicks && nextPlayer.rapidFireTicks > 0) nextPlayer.rapidFireTicks--;

        const moveDir = queuedDirectionRef.current || heldDirectionRef.current;
        queuedDirectionRef.current = null;

        if (moveDir && nextPlayer.moveCooldown === 0) {
          if (nextPlayer.dir !== moveDir) {
            // Turn in place or step if clear
            nextPlayer.dir = moveDir;
            const { dx, dy } = getDelta(moveDir);
            if (
              canTankOccupy(
                nextPlayer.x + dx,
                nextPlayer.y + dy,
                nextGrid,
                nextPlayer.id,
                nextEnemies
              )
            ) {
              nextPlayer.x += dx;
              nextPlayer.y += dy;
            }
            soundEngine.playMoveTick();
            nextPlayer.moveCooldown = 1;
          } else {
            const { dx, dy } = getDelta(moveDir);
            if (
              canTankOccupy(
                nextPlayer.x + dx,
                nextPlayer.y + dy,
                nextGrid,
                nextPlayer.id,
                nextEnemies
              )
            ) {
              nextPlayer.x += dx;
              nextPlayer.y += dy;
              soundEngine.playMoveTick();
              nextPlayer.moveCooldown = 1;
            }
          }
        }

        // Check Power-Up Collection (3x3 overlap with player tank)
        nextPowerUps = nextPowerUps.filter((pu) => {
          if (
            nextPlayer &&
            Math.abs(pu.x - nextPlayer.x) <= 1 &&
            Math.abs(pu.y - nextPlayer.y) <= 1
          ) {
            soundEngine.playPowerUp();
            nextScore += 250;
            if (pu.type === 'SHIELD') {
              nextPlayer.shieldTicks = 60;
            } else if (pu.type === 'FREEZE') {
              nextFreezeTicks = 50;
            } else if (pu.type === 'RAPID') {
              nextPlayer.rapidFireTicks = 75;
            } else if (pu.type === 'EXTRA_LIFE') {
              nextLives = Math.min(4, nextLives + 1);
            } else if (pu.type === 'FORTIFY' && s.gameMode === 'CLASSIC_DEFENSE') {
              nextFortifyTicks = 75;
              for (let y = 17; y <= 20; y++) {
                for (let x = 8; x <= 12; x++) {
                  if (nextGrid[y][x] !== CellType.BASE_CORE) {
                    nextGrid[y][x] = CellType.STEEL;
                  }
                }
              }
            } else if (pu.type === 'BOMB') {
              soundEngine.playExplosion();
              nextEnemies.forEach((en) => {
                nextExplosions.push({
                  id: `exp-bomb-${en.id}-${Date.now()}`,
                  x: en.x,
                  y: en.y,
                  radius: 2,
                  ticksLeft: 5,
                });
                nextScore += 150;
              });
              nextEnemiesRemaining = Math.max(0, nextEnemiesRemaining - nextEnemies.length);
              nextEnemies = [];
            }
            return false;
          }
          return true;
        });

        // Player Fire Cannon
        if (fireRequestedRef.current) {
          fireRequestedRef.current = false;
          const activePlayerBullets = nextBullets.filter((b) => b.isPlayer).length;
          const maxBullets =
            nextPlayer.rapidFireTicks && nextPlayer.rapidFireTicks > 0 ? 3 : 2;
          if (nextPlayer.shootCooldown === 0 && activePlayerBullets < maxBullets) {
            const { dx, dy } = getDelta(nextPlayer.dir);
            nextBullets.push({
              id: `pb-${Date.now()}-${Math.random()}`,
              x: nextPlayer.x + dx,
              y: nextPlayer.y + dy,
              dir: nextPlayer.dir,
              isPlayer: true,
              power: nextPlayer.rapidFireTicks && nextPlayer.rapidFireTicks > 0 ? 2 : 1,
            });
            soundEngine.playShoot();
            nextPlayer.shootCooldown =
              nextPlayer.rapidFireTicks && nextPlayer.rapidFireTicks > 0 ? 1 : 2;
          }
        }
      }

      // 2. Spawn Enemy Tanks if below max active and quota remaining
      const stageDef = STAGES[s.stageIndex % STAGES.length];
      const unspawnedCount = nextEnemiesRemaining - nextEnemies.length;
      if (unspawnedCount > 0 && nextEnemies.length < stageDef.maxActiveEnemies) {
        const shuffledSpawns = [...SPAWN_POINTS].sort(() => Math.random() - 0.5);
        for (const sp of shuffledSpawns) {
          const allTanks = nextPlayer ? [nextPlayer, ...nextEnemies] : nextEnemies;
          if (canTankOccupy(sp.x, sp.y, nextGrid, 'spawn-check', allTanks)) {
            const roll = Math.random();
            let enemyType: EnemyType = 'BASIC';
            let hp = 1;
            if (s.gameMode === 'BOSS_RUSH') {
              enemyType = roll > 0.4 ? 'COMMANDER' : 'ARMORED';
              hp = enemyType === 'COMMANDER' ? 3 : 2;
            } else if (roll > 0.82) {
              enemyType = 'COMMANDER';
              hp = 3;
            } else if (roll > 0.58) {
              enemyType = 'ARMORED';
              hp = 2;
            } else if (roll > 0.32) {
              enemyType = 'SCOUT';
              hp = 1;
            }

            nextEnemies.push({
              id: `en-${Date.now()}-${Math.random()}`,
              x: sp.x,
              y: sp.y,
              dir: 'DOWN',
              isPlayer: false,
              enemyType,
              hp,
              maxHp: hp,
              moveCooldown: 3,
              shootCooldown: 4,
              isBonusCarrier: Math.random() < 0.28,
            });
            break;
          }
        }
      }

      // 3. Update Enemy AI Movement & Shooting (unless Frozen)
      if (nextFreezeTicks === 0) {
        const allTanksForCollision = (): Tank[] =>
          nextPlayer ? [nextPlayer, ...nextEnemies] : [...nextEnemies];

        nextEnemies.forEach((enemy) => {
          if (enemy.moveCooldown > 0) {
            enemy.moveCooldown--;
          } else {
            const { dx, dy } = getDelta(enemy.dir);
            const canStepForward = canTankOccupy(
              enemy.x + dx,
              enemy.y + dy,
              nextGrid,
              enemy.id,
              allTanksForCollision()
            );

            // Decide whether to continue forward or pick a tactical direction toward player/base
            if (canStepForward && Math.random() < 0.72) {
              enemy.x += dx;
              enemy.y += dy;
            } else {
              const dirs: Direction[] = ['DOWN', 'LEFT', 'RIGHT', 'UP'];
              // Bias toward DOWN (base) or toward player
              if (nextPlayer && Math.random() < 0.55) {
                if (Math.abs(nextPlayer.x - enemy.x) > Math.abs(nextPlayer.y - enemy.y)) {
                  dirs.unshift(nextPlayer.x > enemy.x ? 'RIGHT' : 'LEFT');
                } else {
                  dirs.unshift(nextPlayer.y > enemy.y ? 'DOWN' : 'UP');
                }
              }
              const chosenDir = dirs[Math.floor(Math.random() * dirs.length)];
              enemy.dir = chosenDir;
              const step = getDelta(chosenDir);
              if (
                canTankOccupy(
                  enemy.x + step.dx,
                  enemy.y + step.dy,
                  nextGrid,
                  enemy.id,
                  allTanksForCollision()
                )
              ) {
                enemy.x += step.dx;
                enemy.y += step.dy;
              }
            }
            enemy.moveCooldown = enemy.enemyType === 'SCOUT' ? 1 : 2;
          }

          // Enemy Shooting
          if (enemy.shootCooldown > 0) {
            enemy.shootCooldown--;
          } else if (Math.random() < 0.28) {
            const { dx, dy } = getDelta(enemy.dir);
            nextBullets.push({
              id: `eb-${Date.now()}-${Math.random()}`,
              x: enemy.x + dx,
              y: enemy.y + dy,
              dir: enemy.dir,
              isPlayer: false,
              power: enemy.enemyType === 'COMMANDER' ? 2 : 1,
            });
            enemy.shootCooldown = enemy.enemyType === 'SCOUT' ? 4 : 6;
          }
        });
      }

      // 4. Advance & Resolve Bullets
      const survivingBullets: Bullet[] = [];
      const destroyedBulletIds = new Set<string>();

      // Check bullet-to-bullet collisions first
      for (let i = 0; i < nextBullets.length; i++) {
        for (let j = i + 1; j < nextBullets.length; j++) {
          const b1 = nextBullets[i];
          const b2 = nextBullets[j];
          if (b1.isPlayer !== b2.isPlayer && Math.abs(b1.x - b2.x) <= 1 && Math.abs(b1.y - b2.y) <= 1) {
            destroyedBulletIds.add(b1.id);
            destroyedBulletIds.add(b2.id);
            nextExplosions.push({
              id: `exp-bb-${Date.now()}-${i}`,
              x: b1.x,
              y: b1.y,
              radius: 1,
              ticksLeft: 2,
            });
          }
        }
      }

      for (const b of nextBullets) {
        if (destroyedBulletIds.has(b.id)) continue;

        const { dx, dy } = getDelta(b.dir);
        const steps = b.power >= 2 ? 2 : 1;
        let bulletAlive = true;

        for (let stepIdx = 0; stepIdx < steps; stepIdx++) {
          if (stepIdx > 0) {
            b.x += dx;
            b.y += dy;
          }

          // Out of bounds
          if (b.x < 0 || b.x >= GRID_SIZE || b.y < 0 || b.y >= GRID_SIZE) {
            bulletAlive = false;
            break;
          }

          // Terrain collision
          const cell = nextGrid[b.y]?.[b.x] ?? CellType.EMPTY;
          if (cell === CellType.BRICK) {
            nextGrid[b.y][b.x] = CellType.EMPTY;
            // Clear adjacent perpendicular brick for authentic Battle City blast width
            if (b.dir === 'UP' || b.dir === 'DOWN') {
              if (b.x + 1 < GRID_SIZE && nextGrid[b.y][b.x + 1] === CellType.BRICK) {
                nextGrid[b.y][b.x + 1] = CellType.EMPTY;
              }
            } else {
              if (b.y + 1 < GRID_SIZE && nextGrid[b.y + 1]?.[b.x] === CellType.BRICK) {
                nextGrid[b.y + 1][b.x] = CellType.EMPTY;
              }
            }
            soundEngine.playBrickHit();
            nextExplosions.push({
              id: `exp-br-${Date.now()}-${Math.random()}`,
              x: b.x,
              y: b.y,
              radius: 1,
              ticksLeft: 2,
            });
            bulletAlive = false;
            break;
          } else if (cell === CellType.STEEL) {
            if (b.isPlayer && b.power >= 2) {
              nextGrid[b.y][b.x] = CellType.EMPTY;
              soundEngine.playBrickHit();
            } else {
              soundEngine.playSteelPing();
            }
            nextExplosions.push({
              id: `exp-st-${Date.now()}-${Math.random()}`,
              x: b.x,
              y: b.y,
              radius: 1,
              ticksLeft: 2,
            });
            bulletAlive = false;
            break;
          } else if (cell === CellType.BASE_CORE) {
            nextBaseDestroyed = true;
            soundEngine.playPlayerHit();
            nextExplosions.push({
              id: `exp-base-${Date.now()}`,
              x: 10,
              y: 19,
              radius: 2,
              ticksLeft: 8,
            });
            bulletAlive = false;
            break;
          }

          // Tank collision
          if (b.isPlayer) {
            for (const enemy of nextEnemies) {
              if (enemy.hp > 0 && Math.abs(b.x - enemy.x) <= 1 && Math.abs(b.y - enemy.y) <= 1) {
                enemy.hp -= 1;
                bulletAlive = false;
                if (enemy.hp <= 0) {
                  soundEngine.playExplosion();
                  const pts =
                    enemy.enemyType === 'COMMANDER'
                      ? 400
                      : enemy.enemyType === 'ARMORED'
                      ? 250
                      : enemy.enemyType === 'SCOUT'
                      ? 150
                      : 100;
                  nextScore += pts;
                  nextEnemiesRemaining = Math.max(0, nextEnemiesRemaining - 1);
                  nextExplosions.push({
                    id: `exp-en-${enemy.id}`,
                    x: enemy.x,
                    y: enemy.y,
                    radius: 2,
                    ticksLeft: 5,
                  });

                  // Spawn Power-Up if enemy was a bonus carrier
                  if (enemy.isBonusCarrier) {
                    const types: PowerUpType[] = [
                      'SHIELD',
                      'FREEZE',
                      'RAPID',
                      'FORTIFY',
                      'BOMB',
                      'EXTRA_LIFE',
                    ];
                    const chosenType = types[Math.floor(Math.random() * types.length)];
                    nextPowerUps.push({
                      id: `pu-${Date.now()}`,
                      x: Math.max(2, Math.min(GRID_SIZE - 3, enemy.x)),
                      y: Math.max(2, Math.min(GRID_SIZE - 5, enemy.y)),
                      type: chosenType,
                      ticksLeft: 95,
                    });
                  }
                } else {
                  soundEngine.playSteelPing();
                  nextExplosions.push({
                    id: `exp-hit-${Date.now()}-${Math.random()}`,
                    x: b.x,
                    y: b.y,
                    radius: 1,
                    ticksLeft: 2,
                  });
                }
                break;
              }
            }
          } else if (nextPlayer && nextPlayer.hp > 0) {
            if (Math.abs(b.x - nextPlayer.x) <= 1 && Math.abs(b.y - nextPlayer.y) <= 1) {
              bulletAlive = false;
              if (nextPlayer.shieldTicks && nextPlayer.shieldTicks > 0) {
                soundEngine.playSteelPing();
              } else {
                soundEngine.playPlayerHit();
                nextExplosions.push({
                  id: `exp-pl-${Date.now()}`,
                  x: nextPlayer.x,
                  y: nextPlayer.y,
                  radius: 2,
                  ticksLeft: 6,
                });
                nextLives -= 1;
                if (nextLives > 0) {
                  const respawnPos =
                    s.gameMode === 'ARENA_SURVIVAL' ? { x: 10, y: 18 } : PLAYER_SPAWN;
                  nextPlayer = {
                    ...nextPlayer,
                    x: respawnPos.x,
                    y: respawnPos.y,
                    dir: 'UP',
                    shieldTicks: 30,
                    rapidFireTicks: 0,
                  };
                } else {
                  nextPlayer.hp = 0;
                }
              }
            }
          }

          if (!bulletAlive) break;
        }

        if (bulletAlive) {
          b.x += dx;
          b.y += dy;
          if (b.x >= 0 && b.x < GRID_SIZE && b.y >= 0 && b.y < GRID_SIZE) {
            survivingBullets.push(b);
          }
        }
      }

      nextEnemies = nextEnemies.filter((e) => e.hp > 0);

      // Commit updated entities
      setGrid(nextGrid);
      setPlayer(nextPlayer);
      setEnemies(nextEnemies);
      setBullets(survivingBullets);
      setExplosions(nextExplosions);
      setPowerUps(nextPowerUps);
      setScore(nextScore);
      setLives(nextLives);
      setEnemiesRemaining(nextEnemiesRemaining);
      setBaseDestroyed(nextBaseDestroyed);
      setFreezeTicks(nextFreezeTicks);
      setFortifyTicks(nextFortifyTicks);

      if (nextScore > highScore) {
        setHighScore(nextScore);
      }

      // Check End Conditions
      if (nextBaseDestroyed || nextLives <= 0) {
        recordHighScore(nextScore, s.stageIndex + 1, s.gameMode);
        setGameState('GAME_OVER');
      } else if (nextEnemiesRemaining <= 0 && nextEnemies.length === 0) {
        soundEngine.playStageClear();
        const stageBonus = 500;
        setScore(nextScore + stageBonus);
        if (nextScore + stageBonus > highScore) {
          setHighScore(nextScore + stageBonus);
        }
        setGameState('ROUND_SUMMARY');
      }
    }, tickIntervalMs);

    return () => clearInterval(interval);
  }, [gameState, speedLevel, highScore, recordHighScore]);

  // Custom Map Builder Cell Painting
  const handleCellPaint = useCallback(
    (x: number, y: number) => {
      // Do not overwrite top enemy spawns, player spawn, or base core
      const inTopLeftSpawn = x <= 3 && y <= 3;
      const inTopCenterSpawn = x >= 9 && x <= 11 && y <= 3;
      const inTopRightSpawn = x >= 17 && y <= 3;
      const inPlayerSpawn = x >= 4 && x <= 8 && y >= 17;
      const inBaseCore = x >= 9 && x <= 11 && y >= 18;

      if (inTopLeftSpawn || inTopCenterSpawn || inTopRightSpawn || inPlayerSpawn || inBaseCore) {
        return;
      }

      setGrid((prev) => {
        const copy = cloneGrid(prev);
        copy[y][x] = builderBrush;
        setCustomGrid(copy);
        return copy;
      });
    },
    [builderBrush]
  );

  const currentStageDef = STAGES[stageIndex % STAGES.length];

  return (
    <div className="min-h-screen flex flex-col bg-stone-950 text-stone-100">
      {/* Top Bar Contract: 3 Zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-stone-800 bg-stone-950/90 backdrop-blur-sm">
        {/* Zone 1: Brand Title (Single text element, one line) */}
        <a
          href="#top"
          className="font-display text-lg font-extrabold tracking-tight text-amber-400 whitespace-nowrap shrink-0"
        >
          Brick Tank 1990
        </a>

        {/* Zone 2: 4 Single-line Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-stone-300">
          <a
            href="#console-arena"
            className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Máy Cầm Tay
          </a>
          <a
            href="#stage-config"
            onClick={(e) => {
              e.preventDefault();
              soundEngine.playButtonBeep(680);
              if (gameState === 'MAP_BUILDER') {
                setGameState('TITLE_MENU');
              } else {
                const base = customGrid ? cloneGrid(customGrid) : createBaseGrid(true);
                setGrid(base);
                setGameState('MAP_BUILDER');
              }
            }}
            className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            {gameState === 'MAP_BUILDER' ? 'Đóng Thiết Kế Màn' : 'Tự Tạo Bản Đồ'}
          </a>
          <a
            href="#tactical-guide"
            className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Cẩm Nang Chiến Thuật
          </a>
          <a
            href="#highscore-board"
            className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Bảng Kỷ Lục
          </a>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleStartOrPause}
            className="tactile-btn px-4 py-2 text-xs font-bold text-stone-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {gameState === 'PLAYING' ? 'Tạm Dừng (P)' : 'Bắt Đầu Chơi'}
          </button>
        </div>
      </header>

      {/* Main 1440px 3-Column Arcade Workbench */}
      <main
        id="console-arena"
        className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
      >
        {/* Left Column (4 cols): Mode, Stage Selector, Map Builder & Console Customizer */}
        <section
          id="stage-config"
          className="lg:col-span-4 space-y-5 bg-stone-900/90 border border-stone-800 rounded-2xl p-5"
        >
          <div>
            <h1 className="font-display text-xl font-bold text-stone-100">
              Cấu Hình Máy Điện Tử Cầm Tay
            </h1>
            <p className="text-xs text-stone-400 mt-1">
              Tùy chỉnh chế độ bắn xe tăng, màn chơi, tốc độ xung nhịp LCD và màu vỏ máy thập niên 90.
            </p>
          </div>

          {/* Game Mode Segmented Control */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-stone-300">
              Chế Độ Trận Đấu
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-stone-950 rounded-xl border border-stone-800">
              {(
                [
                  { id: 'CLASSIC_DEFENSE', label: 'Thủ Căn Cứ' },
                  { id: 'ARENA_SURVIVAL', label: 'Đấu Trường' },
                  { id: 'BOSS_RUSH', label: 'Đấu Trùm' },
                ] as Array<{ id: GameMode; label: string }>
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playButtonBeep(740);
                    setGameMode(m.id);
                    initStage(stageIndex, m.id, true);
                    setGameState('TITLE_MENU');
                  }}
                  className={`py-2 px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    gameMode === m.id
                      ? 'bg-amber-400 text-stone-950 shadow-sm'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stage Selector (01 to 05) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-stone-300">Chọn Màn Chơi (Stage)</span>
              <span className="font-mono-tabular text-amber-400">
                {currentStageDef.name}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {STAGES.map((st, idx) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playButtonBeep(600 + idx * 60);
                    setCustomGrid(null);
                    setStageIndex(idx);
                    initStage(idx, gameMode, true);
                    setGameState('TITLE_MENU');
                  }}
                  className={`py-2 px-3 rounded-lg font-mono-tabular text-xs font-bold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    stageIndex % STAGES.length === idx && !customGrid
                      ? 'bg-stone-100 text-stone-950 border-stone-100'
                      : 'bg-stone-950 text-stone-400 border-stone-800 hover:border-stone-700 hover:text-stone-200'
                  }`}
                >
                  0{st.id}
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-400 leading-relaxed">
              {customGrid
                ? 'Đang sử dụng bản đồ tự thiết kế trên màn hình LCD.'
                : currentStageDef.subtitle}
            </p>
          </div>

          {/* Custom Map Builder Toolbar */}
          <div className="pt-3 border-t border-stone-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-300">
                Thiết Kế Chiến Trường (Map Builder)
              </span>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playButtonBeep(720);
                  if (gameState === 'MAP_BUILDER') {
                    setGameState('TITLE_MENU');
                  } else {
                    const base = customGrid ? cloneGrid(customGrid) : cloneGrid(grid);
                    setGrid(base);
                    setGameState('MAP_BUILDER');
                  }
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  gameState === 'MAP_BUILDER'
                    ? 'bg-amber-400 text-stone-950 border-amber-400'
                    : 'bg-stone-950 text-stone-300 border-stone-700 hover:border-stone-500'
                }`}
              >
                {gameState === 'MAP_BUILDER' ? 'Hoàn Tất & Chơi' : 'Mở Công Cụ Vẽ'}
              </button>
            </div>

            {gameState === 'MAP_BUILDER' && (
              <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 space-y-2.5">
                <p className="text-xs text-amber-300">
                  Nhấp hoặc kéo chuột trực tiếp trên màn hình LCD 21×21 ở giữa để đặt địa hình:
                </p>
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      { type: CellType.BRICK, label: 'Tường Gạch' },
                      { type: CellType.STEEL, label: 'Khối Thép' },
                      { type: CellType.WATER, label: 'Mặt Nước' },
                      { type: CellType.EMPTY, label: 'Xóa Ô' },
                    ] as Array<{ type: CellType; label: string }>
                  ).map((b) => (
                    <button
                      key={b.type}
                      type="button"
                      onClick={() => {
                        soundEngine.playButtonBeep(800);
                        setBuilderBrush(b.type);
                      }}
                      className={`py-1.5 px-2 text-[11px] font-semibold rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        builderBrush === b.type
                          ? 'bg-amber-400 text-stone-950 border-amber-400'
                          : 'bg-stone-900 text-stone-300 border-stone-800'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playButtonBeep(500);
                      const fresh = createBaseGrid(gameMode === 'CLASSIC_DEFENSE');
                      setGrid(fresh);
                      setCustomGrid(fresh);
                    }}
                    className="text-xs text-stone-400 hover:text-stone-200 underline cursor-pointer"
                  >
                    Làm trống bản đồ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playStartJingle();
                      initStage(stageIndex, gameMode, true);
                      setGameState('PLAYING');
                    }}
                    className="px-3 py-1 text-xs font-bold bg-emerald-500 text-stone-950 rounded cursor-pointer"
                  >
                    Chơi Bản Đồ Này
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Hardware LCD Matrix & Shell Color Selectors */}
          <div className="pt-3 border-t border-stone-800 space-y-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-stone-300">
                Màu Tấm Nền Tinh Thể Lỏng (LCD Matrix)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(LCD_PALETTES) as LcdPaletteId[]).map((pid) => {
                  const pal = LCD_PALETTES[pid];
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => {
                        soundEngine.playButtonBeep(760);
                        setPaletteId(pid);
                      }}
                      className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                        paletteId === pid
                          ? 'border-amber-400 bg-stone-950'
                          : 'border-stone-800 bg-stone-950/60 hover:border-stone-700'
                      }`}
                    >
                      <div
                        className="w-full h-4 rounded border mb-1.5"
                        style={{
                          backgroundColor: pal.screenBg,
                          borderColor: pal.inkFull,
                        }}
                      />
                      <div className="text-[11px] font-medium text-stone-200 truncate">
                        {pid === 'OLIVE_MATRIX'
                          ? 'Xanh Rêu 1990'
                          : pid === 'AMBER_BACKLIT'
                          ? 'Hổ Phách LED'
                          : 'Xám Bạc Cổ Điển'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-stone-300">
                Màu Vỏ Máy Nhựa ABS
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(SHELL_THEMES) as ShellTheme[]).map((tid) => {
                  const st = SHELL_THEMES[tid];
                  return (
                    <button
                      key={tid}
                      type="button"
                      onClick={() => {
                        soundEngine.playButtonBeep(640);
                        setShellTheme(tid);
                      }}
                      className={`py-2 px-3 rounded-lg border text-xs font-medium text-left truncate transition-colors cursor-pointer ${
                        shellTheme === tid
                          ? 'border-amber-400 bg-stone-950 text-amber-300'
                          : 'border-stone-800 bg-stone-950/50 text-stone-300 hover:border-stone-700'
                      }`}
                    >
                      {st.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Center Column (5 cols): Focal Anchor — The Physical Handheld Brick Game Unit */}
        <section className="lg:col-span-5 flex flex-col items-center justify-center">
          <HandheldConsoleUnit
            shellTheme={shellTheme}
            activeDirection={activeDirection}
            isFiring={isFiring}
            onDirectionPress={handleDirectionPress}
            onDirectionRelease={handleDirectionRelease}
            onFirePress={handleFirePress}
            onStartPause={handleStartOrPause}
            onToggleSound={handleToggleSound}
            onCycleSpeed={handleCycleSpeed}
            onResetGame={handleResetGame}
          >
            <LcdMatrixScreen
              grid={grid}
              player={player}
              enemies={enemies}
              bullets={bullets}
              explosions={explosions}
              powerUps={powerUps}
              score={score}
              highScore={highScore}
              lives={lives}
              stageNumber={stageIndex + 1}
              enemiesRemaining={enemiesRemaining}
              speedLevel={speedLevel}
              gameState={gameState}
              gameMode={gameMode}
              baseDestroyed={baseDestroyed}
              freezeTicks={freezeTicks}
              fortifyTicks={fortifyTicks}
              tickCount={tickCount}
              paletteId={paletteId}
              soundMuted={soundMuted}
              builderBrush={builderBrush}
              onCellPaint={handleCellPaint}
              onStartGame={handleStartOrPause}
            />
          </HandheldConsoleUnit>
        </section>

        {/* Right Column (3 cols): Tactical Field Guide, Power-Up Matrix & High Score Ledger */}
        <aside className="lg:col-span-3 space-y-5">
          {/* Enemy & Power-Up Manual */}
          <div
            id="tactical-guide"
            className="bg-stone-900/90 border border-stone-800 rounded-2xl p-5 space-y-4"
          >
            <div>
              <h2 className="font-display text-base font-bold text-stone-100">
                Cẩm Nang Chiến Thuật
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">
                Cách điều khiển và ký hiệu vật phẩm trên màn hình ma trận điểm.
              </p>
            </div>

            {/* Keyboard & Button Controls */}
            <div className="space-y-1.5 text-xs border-t border-stone-800 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-stone-400">Di chuyển xe tăng</span>
                <span className="font-mono-tabular font-semibold text-stone-200">
                  WASD / Phím Mũi Tên
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-400">Khai hỏa pháo</span>
                <span className="font-mono-tabular font-semibold text-amber-400">
                  Space / Enter / J
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-400">Tạm dừng · Âm thanh</span>
                <span className="font-mono-tabular font-semibold text-stone-200">
                  Phím P · Phím M
                </span>
              </div>
            </div>

            {/* Power-Up Legend */}
            <div className="space-y-2 border-t border-stone-800 pt-3">
              <h3 className="text-xs font-semibold text-stone-300">
                Vật Phẩm Tiếp Tế (Bắn Xe Nhấp Nháy)
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-stone-950 border border-stone-800">
                  <div className="font-mono-tabular font-bold text-amber-400">[S] KHIÊN</div>
                  <div className="text-[11px] text-stone-400">Bất tử tạm thời 10s</div>
                </div>
                <div className="p-2 rounded-lg bg-stone-950 border border-stone-800">
                  <div className="font-mono-tabular font-bold text-amber-400">[R] ĐẠN NHANH</div>
                  <div className="text-[11px] text-stone-400">Đạn đôi xuyên thép</div>
                </div>
                <div className="p-2 rounded-lg bg-stone-950 border border-stone-800">
                  <div className="font-mono-tabular font-bold text-amber-400">[F] ĐÓNG BĂNG</div>
                  <div className="text-[11px] text-stone-400">Khóa chân toàn bộ địch</div>
                </div>
                <div className="p-2 rounded-lg bg-stone-950 border border-stone-800">
                  <div className="font-mono-tabular font-bold text-amber-400">[W] BỌC THÉP</div>
                  <div className="text-[11px] text-stone-400">Gia cố sở chỉ huy</div>
                </div>
                <div className="p-2 rounded-lg bg-stone-950 border border-stone-800">
                  <div className="font-mono-tabular font-bold text-amber-400">[B] BOM NỔ</div>
                  <div className="text-[11px] text-stone-400">Diệt sạch địch trên màn</div>
                </div>
                <div className="p-2 rounded-lg bg-stone-950 border border-stone-800">
                  <div className="font-mono-tabular font-bold text-amber-400">[+] THÊM MẠNG</div>
                  <div className="text-[11px] text-stone-400">+1 xe tăng dự phòng</div>
                </div>
              </div>
            </div>

            {/* Enemy Class Points */}
            <div className="space-y-1.5 border-t border-stone-800 pt-3 text-xs">
              <h3 className="font-semibold text-stone-300">Phân Loại Xe Tăng Địch</h3>
              <div className="flex justify-between text-stone-400">
                <span>Thiết giáp nhẹ · Trinh sát nhanh</span>
                <span className="font-mono-tabular text-stone-200">100 · 150 đ</span>
              </div>
              <div className="flex justify-between text-stone-400">
                <span>Hạng nặng (2 giáp) · Chỉ huy (3 giáp)</span>
                <span className="font-mono-tabular text-amber-400">250 · 400 đ</span>
              </div>
            </div>
          </div>

          {/* High Score Ledger */}
          <div
            id="highscore-board"
            className="bg-stone-900/90 border border-stone-800 rounded-2xl p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-stone-100">
                Bảng Vàng Kỷ Lục
              </h2>
              <span className="font-mono-tabular text-xs font-bold text-amber-400">
                HI: {String(highScore).padStart(6, '0')}
              </span>
            </div>

            <div className="divide-y divide-stone-800/80 text-xs">
              {highScoreHistory.map((item, idx) => (
                <div key={item.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono-tabular font-bold text-stone-400">
                      0{idx + 1}.
                    </span>
                    <span className="text-stone-200 truncate">
                      Màn {String(item.stage).padStart(2, '0')} ·{' '}
                      {item.mode === 'CLASSIC_DEFENSE'
                        ? 'Thủ Căn Cứ'
                        : item.mode === 'ARENA_SURVIVAL'
                        ? 'Đấu Trường'
                        : 'Đấu Trùm'}
                    </span>
                  </div>
                  <span className="font-mono-tabular font-bold text-amber-400 shrink-0">
                    {String(item.score).padStart(6, '0')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="mt-auto border-t border-stone-900 px-6 py-4 text-xs text-stone-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>Brick Tank 1990 · Mô phỏng máy điện tử cầm tay LCD ma trận điểm 21×21</span>
        <span>Hỗ trợ bàn phím cơ học, chuột và màn hình cảm ứng đa điểm</span>
      </footer>
    </div>
  );
}
