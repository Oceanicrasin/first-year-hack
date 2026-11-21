export const WIDTH = 10;
export const HEIGHT = 20;
export const TICK_MS = 500;
export const ROTATION_COOLDOWN_MS = 3000;

export type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type Shape = number[][];
export type Cell = string | null;
export type Action = 'LEFT' | 'RIGHT' | 'DOWN' | 'DROP' | 'ROTATE';
export type PlayerId = 1 | 2;

export const TETROMINOES: Record<TetrominoType, { shape: Shape; color: string }> = {
  I: { shape: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], color: '#00f0f0' },
  O: { shape: [[1, 1], [1, 1]], color: '#f0f000' },
  T: { shape: [[0, 1, 0], [1, 1, 1], [0, 0, 0]], color: '#a000f0' },
  S: { shape: [[0, 1, 1], [1, 1, 0], [0, 0, 0]], color: '#00f000' },
  Z: { shape: [[1, 1, 0], [0, 1, 1], [0, 0, 0]], color: '#f00000' },
  J: { shape: [[1, 0, 0], [1, 1, 1], [0, 0, 0]], color: '#0000f0' },
  L: { shape: [[0, 0, 1], [1, 1, 1], [0, 0, 0]], color: '#f0a000' },
};

const TYPES = Object.keys(TETROMINOES) as TetrominoType[];
const LINE_POINTS = [0, 100, 300, 500, 800];

export interface Piece {
  type: TetrominoType;
  shape: Shape;
  x: number;
  y: number;
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
}

const randomType = (): TetrominoType => TYPES[Math.floor(Math.random() * TYPES.length)];
const makePiece = (type: TetrominoType): Piece => ({
  type,
  shape: TETROMINOES[type].shape.map((row) => [...row]),
  x: 5,
  y: 0,
});
const emptyBoard = (): Cell[][] => Array.from({ length: HEIGHT }, () => Array<Cell>(WIDTH).fill(null));

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
    spawn(s);
  } else {
    s.finished = true;
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

  const remaining = board.filter((row) => row.some((c) => c === null));
  const cleared = HEIGHT - remaining.length;
  if (cleared > 0) {
    s.board = [...Array.from({ length: cleared }, () => Array<Cell>(WIDTH).fill(null)), ...remaining];
    s.scores[s.round - 1] += LINE_POINTS[Math.min(cleared, 4)];
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

/** Applies an action. `ok` is false when nothing changed (e.g. a rotation that would overlap). */
export function applyAction(state: GameState, action: Action): { state: GameState; ok: boolean } {
  if (state.finished) return { state, ok: false };
  const s = structuredClone(state);
  let ok = true;
  switch (action) {
    case 'LEFT': ok = tryMove(s, -1, 0); break;
    case 'RIGHT': ok = tryMove(s, 1, 0); break;
    case 'DOWN': ok = tryMove(s, 0, 1); break;
    case 'ROTATE': ok = tryRotate(s); break;
    case 'DROP':
      while (tryMove(s, 0, 1)) { /* fall */ }
      lockAndSpawn(s);
      break;
  }
  return { state: ok ? s : state, ok };
}
