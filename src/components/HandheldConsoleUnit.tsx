import React from 'react';
import { Direction, ShellTheme } from '../game/types';

export interface ShellStyleConfig {
  id: ShellTheme;
  name: string;
  bodyClass: string;
  bezelClass: string;
  accentTextClass: string;
  dpadBtnClass: string;
  fireBtnClass: string;
  smallBtnClass: string;
}

export const SHELL_THEMES: Record<ShellTheme, ShellStyleConfig> = {
  CLASSIC_GREY: {
    id: 'CLASSIC_GREY',
    name: 'Xám Cổ Điển (Brick 1992)',
    bodyClass: 'bg-stone-800 border-stone-700 text-stone-100',
    bezelClass: 'bg-stone-900 border-stone-700',
    accentTextClass: 'text-amber-400',
    dpadBtnClass: 'bg-amber-400 text-stone-950 border-amber-600 shadow-md',
    fireBtnClass: 'bg-red-600 text-white border-red-800 shadow-md',
    smallBtnClass: 'bg-amber-400 border-amber-600',
  },
  ROYAL_BLUE: {
    id: 'ROYAL_BLUE',
    name: 'Xanh Dương Chợ Lớn',
    bodyClass: 'bg-blue-950 border-blue-800 text-blue-50',
    bezelClass: 'bg-slate-950 border-blue-900',
    accentTextClass: 'text-yellow-300',
    dpadBtnClass: 'bg-yellow-400 text-slate-950 border-yellow-600 shadow-md',
    fireBtnClass: 'bg-rose-600 text-white border-rose-800 shadow-md',
    smallBtnClass: 'bg-yellow-400 border-yellow-600',
  },
  RETRO_YELLOW: {
    id: 'RETRO_YELLOW',
    name: 'Vàng Nghệ Năng Động',
    bodyClass: 'bg-amber-500 border-amber-700 text-stone-950',
    bezelClass: 'bg-stone-900 border-stone-800 text-stone-100',
    accentTextClass: 'text-amber-400',
    dpadBtnClass: 'bg-stone-900 text-amber-400 border-stone-950 shadow-md',
    fireBtnClass: 'bg-red-600 text-white border-red-900 shadow-md',
    smallBtnClass: 'bg-red-600 border-red-900',
  },
  TRANSLUCENT_SMOKE: {
    id: 'TRANSLUCENT_SMOKE',
    name: 'Đen Khói Trong Suốt',
    bodyClass: 'bg-neutral-900 border-neutral-700 text-neutral-100',
    bezelClass: 'bg-black border-neutral-800',
    accentTextClass: 'text-emerald-400',
    dpadBtnClass: 'bg-neutral-200 text-neutral-950 border-neutral-400 shadow-md',
    fireBtnClass: 'bg-amber-500 text-neutral-950 border-amber-700 shadow-md',
    smallBtnClass: 'bg-emerald-400 border-emerald-600',
  },
};

interface HandheldConsoleUnitProps {
  shellTheme: ShellTheme;
  activeDirection: Direction | null;
  isFiring: boolean;
  onDirectionPress: (dir: Direction) => void;
  onDirectionRelease: (dir: Direction) => void;
  onFirePress: () => void;
  onStartPause: () => void;
  onToggleSound: () => void;
  onCycleSpeed: () => void;
  onResetGame: () => void;
  children: React.ReactNode;
}

export const HandheldConsoleUnit: React.FC<HandheldConsoleUnitProps> = ({
  shellTheme,
  activeDirection,
  isFiring,
  onDirectionPress,
  onDirectionRelease,
  onFirePress,
  onStartPause,
  onToggleSound,
  onCycleSpeed,
  onResetGame,
  children,
}) => {
  const theme = SHELL_THEMES[shellTheme];

  return (
    <div
      className={`w-full max-w-[490px] mx-auto rounded-[28px] border-4 p-4 sm:p-6 shadow-2xl transition-colors duration-200 ${theme.bodyClass}`}
    >
      {/* Recessed Bezel Housing the LCD Screen */}
      <div className={`rounded-2xl border-2 p-3 sm:p-4 ${theme.bezelClass}`}>
        <div className="flex items-center justify-between mb-2 px-1">
          <span className={`font-display text-xs sm:text-sm font-extrabold tracking-widest ${theme.accentTextClass}`}>
            BRICK GAME 9999-IN-1
          </span>
          <span className="font-mono-tabular text-[10px] text-stone-400 tracking-wider">
            SUPER TANK MK-II
          </span>
        </div>

        {/* LCD Matrix Viewport */}
        {children}

        <div className="mt-2 flex items-center justify-between px-1 text-[10px] font-mono-tabular text-stone-400">
          <span>DOT MATRIX WITH STEREO BUZZER</span>
          <span>DC 3V (2xAA)</span>
        </div>
      </div>

      {/* Middle Row: 4 Classic Rubber System Pill Buttons */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3 my-5 px-2 sm:px-4">
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={onStartPause}
            aria-label="Start or Pause Game"
            className={`tactile-btn w-11 h-4 rounded-full border-2 cursor-pointer ${theme.smallBtnClass}`}
          />
          <span className="text-[10px] font-mono-tabular font-bold tracking-tight whitespace-nowrap">
            START/PAUSE
          </span>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleSound}
            aria-label="Toggle Sound"
            className={`tactile-btn w-11 h-4 rounded-full border-2 cursor-pointer ${theme.smallBtnClass}`}
          />
          <span className="text-[10px] font-mono-tabular font-bold tracking-tight whitespace-nowrap">
            SOUND
          </span>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={onCycleSpeed}
            aria-label="Cycle Speed"
            className={`tactile-btn w-11 h-4 rounded-full border-2 cursor-pointer ${theme.smallBtnClass}`}
          />
          <span className="text-[10px] font-mono-tabular font-bold tracking-tight whitespace-nowrap">
            SPEED
          </span>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={onResetGame}
            aria-label="Reset Game"
            className="tactile-btn w-11 h-4 rounded-full border-2 bg-red-600 border-red-800 cursor-pointer"
          />
          <span className="text-[10px] font-mono-tabular font-bold tracking-tight whitespace-nowrap">
            RESET
          </span>
        </div>
      </div>

      {/* Bottom Ergonomic Tactile Deck: Left 4-Way D-Pad + Right Big Fire Button & Speaker Grille */}
      <div className="flex items-center justify-between px-1 sm:px-3 pt-1 pb-2">
        {/* Left: 4-Button Brick Game Directional Cross */}
        <div className="relative w-36 h-36 sm:w-40 sm:h-40 shrink-0">
          {/* UP */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              onDirectionPress('UP');
            }}
            onPointerUp={() => onDirectionRelease('UP')}
            onPointerLeave={() => onDirectionRelease('UP')}
            onPointerCancel={() => onDirectionRelease('UP')}
            aria-label="Move Up"
            className={`tactile-btn absolute top-0 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full border-b-4 flex items-center justify-center font-bold text-base cursor-pointer ${
              theme.dpadBtnClass
            } ${activeDirection === 'UP' ? 'tactile-btn-pressed' : ''}`}
          >
            ▲
          </button>

          {/* DOWN */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              onDirectionPress('DOWN');
            }}
            onPointerUp={() => onDirectionRelease('DOWN')}
            onPointerLeave={() => onDirectionRelease('DOWN')}
            onPointerCancel={() => onDirectionRelease('DOWN')}
            aria-label="Move Down"
            className={`tactile-btn absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full border-b-4 flex items-center justify-center font-bold text-base cursor-pointer ${
              theme.dpadBtnClass
            } ${activeDirection === 'DOWN' ? 'tactile-btn-pressed' : ''}`}
          >
            ▼
          </button>

          {/* LEFT */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              onDirectionPress('LEFT');
            }}
            onPointerUp={() => onDirectionRelease('LEFT')}
            onPointerLeave={() => onDirectionRelease('LEFT')}
            onPointerCancel={() => onDirectionRelease('LEFT')}
            aria-label="Move Left"
            className={`tactile-btn absolute left-0 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-b-4 flex items-center justify-center font-bold text-base cursor-pointer ${
              theme.dpadBtnClass
            } ${activeDirection === 'LEFT' ? 'tactile-btn-pressed' : ''}`}
          >
            ◀
          </button>

          {/* RIGHT */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              onDirectionPress('RIGHT');
            }}
            onPointerUp={() => onDirectionRelease('RIGHT')}
            onPointerLeave={() => onDirectionRelease('RIGHT')}
            onPointerCancel={() => onDirectionRelease('RIGHT')}
            aria-label="Move Right"
            className={`tactile-btn absolute right-0 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-b-4 flex items-center justify-center font-bold text-base cursor-pointer ${
              theme.dpadBtnClass
            } ${activeDirection === 'RIGHT' ? 'tactile-btn-pressed' : ''}`}
          >
            ▶
          </button>

          {/* Center Pivot Moulding */}
          <div className="

absolute inset-0 m-auto w-7 h-7 rounded-full border border-current opacity-25 pointer-events-none flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-current" />
          </div>
        </div>

        {/* Right: Iconic Giant Round FIRE / ROTATE Button + Molded Speaker Slots */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-col items-center">
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                onFirePress();
              }}
              aria-label="Fire Cannon"
              className={`tactile-btn w-20 h-20 sm:w-24 sm:h-24 rounded-full border-b-4 flex flex-col items-center justify-center cursor-pointer ${
                theme.fireBtnClass
              } ${isFiring ? 'tactile-btn-pressed' : ''}`}
            >
              <span className="font-display font-extrabold text-sm sm:text-base tracking-wider">
                BẮN
              </span>
              <span className="font-mono-tabular text-[10px] opacity-85">
                FIRE
              </span>
            </button>
            <span className="mt-1.5 text-[10px] font-mono-tabular font-bold tracking-wider opacity-85">
              PHÍM SPACE / ENTER
            </span>
          </div>

          {/* Molded Plastic Speaker Grille */}
          <div className="flex items-center gap-1.5 pt-1" aria-hidden="true">
            <div className="w-1.5 h-5 rounded-full bg-black/45" />
            <div className="w-1.5 h-6 rounded-full bg-black/45" />
            <div className="w-1.5 h-6 rounded-full bg-black/45" />
            <div className="w-1.5 h-6 rounded-full bg-black/45" />
            <div className="w-1.5 h-5 rounded-full bg-black/45" />
          </div>
        </div>
      </div>
    </div>
  );
};
