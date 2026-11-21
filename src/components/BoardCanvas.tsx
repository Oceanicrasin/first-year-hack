import { useEffect, useRef } from 'react';
import { HEIGHT, LINE_POINTS, TETROMINOES, WIDTH, colorOf } from '../game/engine';
import type { Cell, GameState, TetrominoType } from '../game/engine';

const CELL = 30;
const W = WIDTH * CELL;
const H = HEIGHT * CELL;
const NEXT_CELL = 24;
const NEXT_SIZE = 112;

// Animation timings (ms)
const CLEAR_FLASH_MS = 200; // cleared rows flash white and shrink away
const CLEAR_FALL_MS = 260; // rows above fall into the gap
const DROP_MS = 300; // hard-drop streak + impact flash
const SOFT_MS = 140; // soft-drop streak
const TEXT_MS = 1000; // "DOUBLE +300" popup

const LABELS = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS!'];
const LABEL_COLORS = ['#fff', '#e9ecff', '#22d3ee', '#c084fc', '#facc15'];

const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
const rand = (min: number, max: number) => min + Math.random() * (max - min);

interface CellStyle { scale?: number; white?: number; alpha?: number }

function drawCell(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, color: string, style: CellStyle = {}) {
  const scale = style.scale ?? 1;
  if (scale <= 0.02) return;
  const full = size - 3;
  const s = full * scale;
  const x = px + 1.5 + (full - s) / 2;
  const y = py + 1.5 + (full - s) / 2;
  ctx.globalAlpha = style.alpha ?? 1;
  ctx.beginPath();
  ctx.roundRect(x, y, s, s, 5 * scale);
  ctx.fillStyle = color;
  ctx.fill();
  const shade = ctx.createLinearGradient(x, y, x + s, y + s);
  shade.addColorStop(0, 'rgba(255,255,255,0.45)');
  shade.addColorStop(0.45, 'rgba(255,255,255,0.05)');
  shade.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = shade;
  ctx.fill();
  if (style.white) {
    ctx.fillStyle = `rgba(255,255,255,${style.white})`;
    ctx.fill();
  }
  if (scale > 0.6) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x + 4 * scale, y + 3 * scale, s - 8 * scale, 2);
  }
  ctx.globalAlpha = 1;
}

interface ClearAnim { start: number; rows: number[]; cells: Cell[][]; shift: number[]; lock: number }
interface Streak { x: number; from: number; to: number } // column, pixel y range
interface DropAnim { start: number; color: string; streaks: Streak[]; landed: [number, number][] }
interface SoftAnim { start: number; color: string; streaks: Streak[] }
interface Particle { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; color: string }
interface Popup { start: number; y: number; label: string; points: number; color: string; big: boolean }

interface FxState {
  clear: ClearAnim | null;
  drop: DropAnim | null;
  soft: SoftAnim | null;
  particles: Particle[];
  popups: Popup[];
  raf: number;
  last: number;
}

/** For each column of a shape, the topmost and bottommost filled row. */
function columnsOf(shape: number[][]) {
  const cols: { j: number; top: number; bottom: number }[] = [];
  for (let j = 0; j < shape[0].length; j++) {
    const rows = shape.flatMap((row, i) => (row[j] ? [i] : []));
    if (rows.length) cols.push({ j, top: Math.min(...rows), bottom: Math.max(...rows) });
  }
  return cols;
}

export function BoardCanvas({ game }: { game: GameState | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GameState | null>(game);
  const fx = useRef<FxState>({ clear: null, drop: null, soft: null, particles: [], popups: [], raf: 0, last: 0 });
  const seen = useRef<{ clear: number; drop: number; soft: number } | null>(null);

  const shake = (px: number) => {
    const el = shakeRef.current;
    if (!el || reduceMotion) return;
    el.style.setProperty('--shake', `${px}px`);
    el.classList.remove('shake');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('shake');
  };

  const startClear = (g: GameState, now: number) => {
    if (!g.lastClear) return;
    const { rows, cells } = g.lastClear;
    const k = rows.length;
    const kept = Array.from({ length: HEIGHT }, (_, r) => r).filter((r) => !rows.includes(r));
    const shift = Array<number>(HEIGHT).fill(0);
    kept.forEach((oldRow, i) => { shift[k + i] = k + i - oldRow; });
    const a = fx.current;
    if (!reduceMotion) {
      a.clear = { start: now, rows, cells, shift, lock: g.fx.lock };
      rows.forEach((r, i) => cells[i].forEach((c, x) => {
        if (!c) return;
        for (let n = 0; n < 3; n++) {
          a.particles.push({
            x: x * CELL + CELL / 2 + rand(-8, 8), y: r * CELL + CELL / 2 + rand(-8, 8),
            vx: (x - 4.5) * 45 + rand(-140, 140), vy: rand(-320, -60),
            age: 0, life: rand(0.5, 0.95), size: rand(3, 6.5), color: Math.random() < 0.25 ? '#ffffff' : c,
          });
        }
      }));
      if (k >= 2) shake(1.5 + k * 1.2);
    }
    a.popups.push({
      start: now,
      y: (rows.reduce((t, r) => t + r, 0) / k) * CELL + CELL / 2,
      label: LABELS[Math.min(k, 4)],
      points: LINE_POINTS[Math.min(k, 4)],
      color: LABEL_COLORS[Math.min(k, 4)],
      big: k >= 4,
    });
  };

  const startDrop = (g: GameState, now: number) => {
    const d = g.lastDrop;
    if (!d || reduceMotion) return;
    const dist = d.toY - d.fromY;
    const color = colorOf(d.type);
    const cols = columnsOf(d.shape);
    const a = fx.current;
    a.drop = {
      start: now,
      color,
      streaks: cols.map(({ j, top }) => ({ x: d.x + j, from: (d.fromY + top) * CELL, to: (d.toY + top) * CELL })),
      landed: d.shape.flatMap((row, i) => row.flatMap((v, j) => (v ? [[d.x + j, d.toY + i] as [number, number]] : []))),
    };
    if (dist >= 1) {
      for (const { j, bottom } of cols) {
        for (let n = 0; n < 4; n++) {
          a.particles.push({
            x: (d.x + j) * CELL + rand(2, CELL - 2), y: (d.toY + bottom + 1) * CELL - 2,
            vx: rand(-170, 170), vy: rand(-200, -50),
            age: 0, life: rand(0.25, 0.5), size: rand(2, 4), color: Math.random() < 0.5 ? '#ffffff' : color,
          });
        }
      }
    }
    if (dist >= 2) shake(Math.min(7, 1.5 + dist * 0.35));
  };

  const startSoft = (g: GameState, now: number) => {
    if (reduceMotion) return;
    const p = g.piece;
    fx.current.soft = {
      start: now,
      color: colorOf(p.type),
      streaks: columnsOf(p.shape).map(({ j, top }) => ({ x: p.x + j, from: (p.y + top - 1.6) * CELL, to: (p.y + top) * CELL + 4 })),
    };
  };

  const drawStreaks = (ctx: CanvasRenderingContext2D, streaks: Streak[], color: string, alpha: number) => {
    for (const s of streaks) {
      if (s.to <= s.from) continue;
      const grad = ctx.createLinearGradient(0, s.from, 0, s.to);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(1, color);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = grad;
      ctx.fillRect(s.x * CELL + 5, s.from, CELL - 10, s.to - s.from);
    }
    ctx.globalAlpha = 1;
  };

  /** Draws one frame. Returns true while any animation is still running. */
  const draw = (now: number): boolean => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return false;
    const a = fx.current;
    const dt = Math.min(0.05, Math.max(0, (now - a.last) / 1000));
    a.last = now;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(6, 8, 22, 0.92)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(148, 163, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < WIDTH; i++) { ctx.beginPath(); ctx.moveTo(i * CELL + 0.5, 0); ctx.lineTo(i * CELL + 0.5, H); ctx.stroke(); }
    for (let i = 1; i < HEIGHT; i++) { ctx.beginPath(); ctx.moveTo(0, i * CELL + 0.5); ctx.lineTo(W, i * CELL + 0.5); ctx.stroke(); }

    const g = gameRef.current;
    if (!g) return false;

    // ---- line clear: rows above hold, then fall into the gap
    let clear = a.clear;
    if (clear && (g.fx.lock !== clear.lock || now - clear.start > CLEAR_FLASH_MS + CLEAR_FALL_MS)) clear = a.clear = null;
    const ct = clear ? now - clear.start : 0;
    const fall = clear ? (ct < CLEAR_FLASH_MS ? 0 : easeOutBack(clamp01((ct - CLEAR_FLASH_MS) / CLEAR_FALL_MS))) : 1;

    g.board.forEach((row, y) => {
      const offset = clear ? clear.shift[y] * (1 - fall) : 0;
      row.forEach((c, x) => { if (c) drawCell(ctx, x * CELL, (y - offset) * CELL, CELL, c); });
    });

    if (clear && ct < CLEAR_FLASH_MS) {
      const p = ct / CLEAR_FLASH_MS;
      clear.rows.forEach((r, i) => {
        ctx.fillStyle = `rgba(255,255,255,${0.28 * (1 - p)})`;
        ctx.fillRect(0, r * CELL, W, CELL);
        clear!.cells[i].forEach((c, x) => {
          if (!c) return;
          const fromCenter = Math.abs(x - 4.5) / 4.5;
          const vanish = clamp01((p - 0.3 - fromCenter * 0.3) / 0.4);
          drawCell(ctx, x * CELL, r * CELL, CELL, c, { white: Math.min(1, p * 2.5) * 0.85, scale: 1 - vanish });
        });
      });
    }

    // ---- drop streaks (behind the piece)
    if (a.soft) {
      const p = (now - a.soft.start) / SOFT_MS;
      if (p >= 1) a.soft = null;
      else drawStreaks(ctx, a.soft.streaks, a.soft.color, 0.45 * (1 - p));
    }
    if (a.drop) {
      const p = (now - a.drop.start) / DROP_MS;
      if (p >= 1) a.drop = null;
      else {
        drawStreaks(ctx, a.drop.streaks, a.drop.color, 0.6 * (1 - easeOutCubic(p)));
        const flash = 1 - clamp01(p / 0.55);
        if (flash > 0 && !clear) {
          for (const [x, y] of a.drop.landed) {
            ctx.fillStyle = `rgba(255,255,255,${0.6 * flash})`;
            ctx.beginPath();
            ctx.roundRect(x * CELL + 1.5, y * CELL + 1.5, CELL - 3, CELL - 3, 5);
            ctx.fill();
          }
        }
      }
    }

    // ---- active piece
    const { piece } = g;
    ctx.save();
    ctx.shadowColor = colorOf(piece.type);
    ctx.shadowBlur = 14;
    piece.shape.forEach((row, i) => row.forEach((v, j) => {
      if (v) drawCell(ctx, (piece.x + j) * CELL, (piece.y + i) * CELL, CELL, colorOf(piece.type));
    }));
    ctx.restore();

    // ---- particles
    a.particles = a.particles.filter((pt) => (pt.age += dt) < pt.life);
    for (const pt of a.particles) {
      pt.vy += 900 * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      ctx.globalAlpha = 1 - pt.age / pt.life;
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;

    // ---- score popups
    a.popups = a.popups.filter((pp) => now - pp.start < TEXT_MS);
    for (const pp of a.popups) {
      const p = (now - pp.start) / TEXT_MS;
      const alpha = p < 0.12 ? p / 0.12 : 1 - clamp01((p - 0.6) / 0.4);
      const pop = 1 + 0.35 * (1 - clamp01(p / 0.15));
      const y = pp.y - (reduceMotion ? 0 : 40 * easeOutCubic(p));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(W / 2, y);
      ctx.scale(pop, pop);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = pp.color;
      ctx.shadowBlur = 18;
      ctx.fillStyle = pp.color;
      ctx.font = `800 ${pp.big ? 30 : 22}px Orbitron, Inter, sans-serif`;
      ctx.fillText(pp.label, 0, 0);
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 15px Orbitron, Inter, sans-serif';
      ctx.fillText(`+${pp.points}`, 0, pp.big ? 26 : 22);
      ctx.restore();
    }

    return Boolean(a.clear || a.drop || a.soft || a.particles.length || a.popups.length);
  };

  const loop = (now: number) => {
    fx.current.raf = draw(now) ? requestAnimationFrame(loop) : 0;
  };

  useEffect(() => {
    gameRef.current = game;
    const a = fx.current;
    const now = performance.now();
    if (!game) {
      seen.current = null;
      a.clear = a.drop = a.soft = null;
      a.particles = [];
      a.popups = [];
    } else {
      const ids = { clear: game.fx.clear, drop: game.fx.drop, soft: game.fx.soft };
      const prev = seen.current;
      // Only animate forward progress within the same game (counters reset on a new game).
      if (prev && ids.clear >= prev.clear && ids.drop >= prev.drop && ids.soft >= prev.soft) {
        if (ids.drop > prev.drop) startDrop(game, now);
        if (ids.clear > prev.clear) startClear(game, now);
        if (ids.soft > prev.soft && ids.drop === prev.drop) startSoft(game, now);
      }
      seen.current = ids;
    }
    // Draw the new state right away; keep animating on later frames only while effects are running.
    if (!a.raf) a.last = now;
    if (draw(now) && !a.raf) a.raf = requestAnimationFrame(loop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  useEffect(() => () => {
    // Reset the id too: StrictMode (dev) unmounts and remounts, and a stale id would stop all redraws.
    cancelAnimationFrame(fx.current.raf);
    fx.current.raf = 0;
  }, []);

  return (
    <div ref={shakeRef} className="board-shake" onAnimationEnd={(e) => e.currentTarget.classList.remove('shake')}>
      <canvas ref={canvasRef} className="board" width={W} height={H} />
    </div>
  );
}

export function NextCanvas({ type }: { type: TetrominoType | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, NEXT_SIZE, NEXT_SIZE);
    if (!type) return;
    const shape = TETROMINOES[type].shape;
    const cells = shape.flatMap((row, i) => row.flatMap((v, j) => (v ? [[i, j]] : [])));
    const rows = cells.map(([i]) => i);
    const cols = cells.map(([, j]) => j);
    const minR = Math.min(...rows), maxR = Math.max(...rows), minC = Math.min(...cols), maxC = Math.max(...cols);
    const ox = (NEXT_SIZE - (maxC - minC + 1) * NEXT_CELL) / 2;
    const oy = (NEXT_SIZE - (maxR - minR + 1) * NEXT_CELL) / 2;
    for (const [i, j] of cells) drawCell(ctx, ox + (j - minC) * NEXT_CELL, oy + (i - minR) * NEXT_CELL, NEXT_CELL, colorOf(type));
  }, [type]);

  return <canvas ref={ref} className="next" width={NEXT_SIZE} height={NEXT_SIZE} />;
}
