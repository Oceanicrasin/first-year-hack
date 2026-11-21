export const WIDTH = 10;
export const HEIGHT = 20;
export const TICK_MS = 500;
export const ROTATION_COOLDOWN_MS = 3000;
/** The sabotager earns one Blind charge for every this many successful sabotage rotations. */
export const BLIND_EVERY = 5;
/** How long a Blind hides the placer's NEXT preview. */
export const BLIND_MS = 10_000;
/** Rows the placer must clear on consecutive pieces (no non-clearing piece in between) to earn a Shield. */
export const SHIELD_STREAK = 2;

export type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type Shape = number[][];
export type Cell = string | null;
export type Action = 'LEFT' | 'RIGHT' | 'DOWN' | 'DROP' | 'ROTATE' | 'BLIND';
export type PlayerId = 1 | 2;

export const TETROMINOES: Record<TetrominoType, { shape: Shape; color: string }> = {
  I: { shape: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], color: '#22d3ee' },
  O: { shape: [[1, 1], [1, 1]], color: '#facc15' },
  T: { shape: [[0, 1, 0], [1, 1, 1], [0, 0, 0]], color: '#a855f7' },
  S: { shape: [[0, 1, 1], [1, 1, 0], [0, 0, 0]], color: '#22c55e' },
  Z: { shape: [[1, 1, 0], [0, 1, 1], [0, 0, 0]], color: '#f43f5e' },
  J: { shape: [[1, 0, 0], [1, 1, 1], [0, 0, 0]], color: '#3b82f6' },
  L: { shape: [[0, 0, 1], [1, 1, 1], [0, 0, 0]], color: '#fb923c' },
};

const TYPES = Object.keys(TETROMINOES) as TetrominoType[];
export const LINE_POINTS = [0, 100, 300, 500, 800];

export interface Piece {
  type: TetrominoType;
  shape: Shape;
  x: number;
  y: number;
}

/** Per-round abilities. Reset when the roles swap. */
export interface Powers {
  /** Successful sabotage rotations toward the next Blind charge (0 .. BLIND_EVERY-1). */
  sabotageRotations: number;
  blindCharges: number;
  /** Host clock (ms) until which the placer's NEXT preview is hidden. */
  blindUntil: number;
  /** The placer holds a Shield that cancels the next Blind. */
  shield: boolean;
  /** Rows cleared in the current back-to-back streak toward the next Shield. */
  streakRows: number;
}

/** Monotonic event counters. Clients diff consecutive snapshots to play sounds and show toasts. */
export interface Fx {
  move: number;
  soft: number;
  rotate: number;
  lock: number;
  drop: number;
  clear: number;
  clearRows: number;
  blind: number;
  blocked: number;
  shield: number;
  charge: number;
}

export interface GameState {
  round: 1 | 2;
  finished: boolean;
  board: Cell[][];
  piece: Piece;
  next: TetrominoType;
  /** scores[0] is Player 1, scores[1] is Player 2. The active round's score updates live. */
  scores: [number, number];
  winner: PlayerId | 'draw' | null;
  powers: Powers;
  fx: Fx;
  /** The most recent line clear (row indices and their cells before removal), for animation. */
  lastClear: { rows: number[]; cells: Cell[][] } | null;
  /** The most recent hard drop, for animation. */
  lastDrop: { type: TetrominoType; shape: Shape; x: number; fromY: number; toY: number } | null;
}

const randomType = (): TetrominoType => TYPES[Math.floor(Math.random() * TYPES.length)];
const makePiece = (type: TetrominoType): Piece => ({
  type,
  shape: TETROMINOES[type].shape.map((row) => [...row]),
  x: 5,
  y: 0,
});
const emptyBoard = (): Cell[][] => Array.from({ length: HEIGHT }, () => Array<Cell>(WIDTH).fill(null));
const freshPowers = (): Powers => ({ sabotageRotations: 0, blindCharges: 0, blindUntil: 0, shield: false, streakRows: 0 });

export const colorOf = (type: TetrominoType) => TETROMINOES[type].color;

export function rotateShape(shape: Shape): Shape {
  const rows = shape.length;
  const rotated: Shape = Array.from({ length: shape[0].length }, () => Array<number>(rows).fill(0));
  for (let i = 0; i < rows; i++) for (let j = 0; j < shape[i].length; j++) rotated[j][rows - 1 - i] = shape[i][j];
  return rotated;
}

export function fits(board: Cell[][], shape: Shape, x: number, y: number): boolean {
  for (let i = 0; i < shape.length; i++) {
    for (let j = 0; j < shape[i].length; j++) {
      if (!shape[i][j]) continue;
      const bx = x + j;
      const by = y + i;
      if (bx < 0 || bx >= WIDTH || by >= HEIGHT) return false;
      if (by >= 0 && board[by][bx] !== null) return false;
    }
  }
  return true;
}

export function newGame(): GameState {
  return {
    round: 1,
    finished: false,
    board: emptyBoard(),
    piece: makePiece(randomType()),
    next: randomType(),
    scores: [0, 0],
    winner: null,
    powers: freshPowers(),
    fx: { move: 0, soft: 0, rotate: 0, lock: 0, drop: 0, clear: 0, clearRows: 0, blind: 0, blocked: 0, shield: 0, charge: 0 },
    lastClear: null,
    lastDrop: null,
  };
}

/** Round 1: Player 1 places. Round 2: Player 2 places. The other player sabotages by rotating. */
export const placementPlayer = (s: GameState): PlayerId => (s.round === 1 ? 1 : 2);

const spawn = (s: GameState) => {
  s.piece = makePiece(s.next);
  s.next = randomType();
};

function endRound(s: GameState) {
  if (s.round === 1) {
    s.round = 2;
    s.board = emptyBoard();
    s.powers = freshPowers();
    spawn(s);
  } else {
    s.finished = true;
    s.powers.blindUntil = 0;
    s.winner = s.scores[0] > s.scores[1] ? 1 : s.scores[1] > s.scores[0] ? 2 : 'draw';
  }
}

function lockAndSpawn(s: GameState) {
  const { piece, board } = s;
  piece.shape.forEach((row, i) =>
    row.forEach((v, j) => {
      const y = piece.y + i;
      const x = piece.x + j;
      if (v && y >= 0 && y < HEIGHT && x >= 0 && x < WIDTH) board[y][x] = colorOf(piece.type);
    }),
  );
  s.fx.lock++;

  const fullRows = board.flatMap((row, i) => (row.every((c) => c !== null) ? [i] : []));
  const remaining = board.filter((row) => row.some((c) => c === null));
  const cleared = fullRows.length;
  if (cleared > 0) {
    s.lastClear = { rows: fullRows, cells: fullRows.map((i) => [...board[i]]) };
    s.board = [...Array.from({ length: cleared }, () => Array<Cell>(WIDTH).fill(null)), ...remaining];
    s.scores[s.round - 1] += LINE_POINTS[Math.min(cleared, 4)];
    s.fx.clear++;
    s.fx.clearRows = cleared;
    s.powers.streakRows += cleared;
    if (s.powers.streakRows >= SHIELD_STREAK) {
      s.powers.streakRows = 0;
      if (!s.powers.shield) {
        s.powers.shield = true;
        s.fx.shield++;
      }
    }
  } else {
    s.powers.streakRows = 0;
  }

  if (s.board[0].some((c) => c !== null)) return endRound(s);
  spawn(s);
  if (!fits(s.board, s.piece.shape, s.piece.x, s.piece.y)) endRound(s);
}

function tryMove(s: GameState, dx: number, dy: number): boolean {
  if (!fits(s.board, s.piece.shape, s.piece.x + dx, s.piece.y + dy)) return false;
  s.piece.x += dx;
  s.piece.y += dy;
  return true;
}

function tryRotate(s: GameState): boolean {
  const rotated = rotateShape(s.piece.shape);
  for (const kick of [0, -1, 1, -2, 2, -3, 3]) {
    if (fits(s.board, rotated, s.piece.x + kick, s.piece.y)) {
      s.piece.shape = rotated;
      s.piece.x += kick;
      return true;
    }
  }
  return false;
}

export function tick(state: GameState): GameState {
  if (state.finished) return state;
  const s = structuredClone(state);
  if (!tryMove(s, 0, 1)) lockAndSpawn(s);
  return s;
}

export interface ActionOptions {
  /** The action comes from the sabotaging player (counts rotations toward Blind, allows BLIND). */
  saboteur?: boolean;
  /** Host clock, used for timed effects. */
  now?: number;
}

/** Applies an action. `ok` is false when nothing changed (e.g. a rotation that would overlap). */
export function applyAction(state: GameState, action: Action, opts: ActionOptions = {}): { state: GameState; ok: boolean } {
  if (state.finished) return { state, ok: false };
  const s = structuredClone(state);
  const now = opts.now ?? Date.now();
  let ok = true;
  switch (action) {
    case 'LEFT':
    case 'RIGHT':
      ok = tryMove(s, action === 'LEFT' ? -1 : 1, 0);
      if (ok) s.fx.move++;
      break;
    case 'DOWN':
      ok = tryMove(s, 0, 1);
      if (ok) s.fx.soft++;
      break;
    case 'ROTATE':
      ok = tryRotate(s);
      if (!ok) break;
      s.fx.rotate++;
      if (opts.saboteur && ++s.powers.sabotageRotations >= BLIND_EVERY) {
        s.powers.sabotageRotations = 0;
        s.powers.blindCharges++;
        s.fx.charge++;
      }
      break;
    case 'DROP': {
      const fromY = s.piece.y;
      while (tryMove(s, 0, 1)) { /* fall */ }
      s.lastDrop = { type: s.piece.type, shape: s.piece.shape.map((r) => [...r]), x: s.piece.x, fromY, toY: s.piece.y };
      s.fx.drop++;
      lockAndSpawn(s);
      break;
    }
    case 'BLIND':
      if (!opts.saboteur || s.powers.blindCharges <= 0 || s.powers.blindUntil > now) { ok = false; break; }
      s.powers.blindCharges--;
      if (s.powers.shield) {
        s.powers.shield = false;
        s.fx.blocked++;
      } else {
        s.powers.blindUntil = now + BLIND_MS;
        s.fx.blind++;
      }
      break;
  }
  return { state: ok ? s : state, ok };
}
