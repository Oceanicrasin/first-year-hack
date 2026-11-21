import type { Action, GameState } from '../game/engine';

export type Phase = 'waiting' | 'running' | 'finished';

/** Everything the guest needs to render. The host is authoritative and broadcasts this. */
export interface Snapshot {
  gameId: number;
  phase: Phase;
  game: GameState | null;
  /** Milliseconds until each player may sabotage-rotate again, measured when sent. */
  cooldown: [number, number];
}

export type ClientAction = Action | 'RESTART';

export interface PresenceMeta {
  clientId: string;
  role: 'host' | 'guest';
  name: string;
}
