import { useEffect, useRef } from 'react';
import { HEIGHT, WIDTH, colorOf } from '../game/engine';
import type { GameState, Shape } from '../game/engine';
import { TETROMINOES } from '../game/engine';

const CELL = 30;

function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size = CELL) {
  ctx.fillStyle = color;
  ctx.fillRect(x * size, y * size, size - 1, size - 1);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.strokeRect(x * size, y * size, size - 1, size - 1);
}

export function BoardCanvas({ game }: { game: GameState | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0f0f23';
    ctx.fillRect(0, 0, WIDTH * CELL, HEIGHT * CELL);
    ctx.strokeStyle = '#1a1a2e';
    for (let i = 0; i <= WIDTH; i++) { ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, HEIGHT * CELL); ctx.stroke(); }
    for (let i = 0; i <= HEIGHT; i++) { ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(WIDTH * CELL, i * CELL); ctx.stroke(); }
    if (!game) return;
    game.board.forEach((row, y) => row.forEach((c, x) => { if (c) drawCell(ctx, x, y, c); }));
    const { piece } = game;
    piece.shape.forEach((row, i) => row.forEach((v, j) => { if (v) drawCell(ctx, piece.x + j, piece.y + i, colorOf(piece.type)); }));
  }, [game]);

  return <canvas ref={ref} className="board" width={WIDTH * CELL} height={HEIGHT * CELL} />;
}

export function NextCanvas({ type }: { type: keyof typeof TETROMINOES | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0f0f23';
    ctx.fillRect(0, 0, 120, 120);
    if (!type) return;
    const shape: Shape = TETROMINOES[type].shape;
    const ox = (120 - shape[0].length * 25) / 2;
    const oy = (120 - shape.length * 25) / 2;
    shape.forEach((row, i) => row.forEach((v, j) => {
      if (!v) return;
      ctx.fillStyle = colorOf(type);
      ctx.fillRect(ox + j * 25, oy + i * 25, 24, 24);
    }));
  }, [type]);

  return <canvas ref={ref} className="next" width={120} height={120} />;
}
