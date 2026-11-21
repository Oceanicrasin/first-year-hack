import { useEffect, useRef, useState } from 'react';
import { placementPlayer } from '../game/engine';
import type { PlayerId } from '../game/engine';
import { audio } from '../audio/audio';
import type { Snapshot } from '../net/protocol';

export interface Toast { id: number; text: string; tone: 'good' | 'bad' | 'info' }

/** Plays sounds and produces toast messages by diffing consecutive snapshots' event counters. */
export function useGameFx(snapshot: Snapshot | null, me: PlayerId): Toast | null {
  const prev = useRef<Snapshot | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    const p = prev.current;
    prev.current = snapshot;
    const game = snapshot?.game;
    if (!snapshot || !game) return;
    const show = (text: string, tone: Toast['tone']) => setToast({ id: Date.now() + Math.random(), text, tone });

    if (!p?.game || p.gameId !== snapshot.gameId) {
      if (snapshot.phase === 'running') {
        audio.play('start');
        show(game.round === 1 && me === 1 ? 'Round 1 — you place!' : 'Round 1 — you sabotage!', 'info');
      }
      return;
    }

    const a = p.game.fx;
    const b = game.fx;
    const placing = placementPlayer(game) === me;

    if (b.clear > a.clear) audio.play(b.clearRows >= 4 ? 'tetris' : 'clear', b.clearRows);
    else if (b.drop > a.drop) audio.play('drop');
    else if (b.lock > a.lock) audio.play('lock');
    if (b.rotate > a.rotate) audio.play('rotate');
    if (b.move > a.move) audio.play('move');

    if (game.round !== p.game.round) {
      audio.play('round');
      show(placing ? 'Round 2 — roles swap: you place!' : 'Round 2 — roles swap: you sabotage!', 'info');
    }
    if (b.charge > a.charge) {
      audio.play('charge');
      show(placing ? '⚠ Opponent charged a Blind' : '👁️ Blind charged — press Z', placing ? 'bad' : 'good');
    }
    if (b.shield > a.shield) {
      audio.play('shield');
      show(placing ? '🛡️ Shield earned!' : '🛡️ Opponent earned a Shield', placing ? 'good' : 'bad');
    }
    if (b.blind > a.blind) {
      audio.play('blind');
      show(placing ? '👁️ You’ve been blinded!' : '👁️ Opponent blinded!', placing ? 'bad' : 'good');
    }
    if (b.blocked > a.blocked) {
      audio.play('blocked');
      show(placing ? '🛡️ Shield blocked the Blind!' : '🛡️ Your Blind was blocked!', placing ? 'good' : 'bad');
    }
    if (snapshot.phase === 'finished' && p.phase !== 'finished') audio.play(game.winner === me ? 'win' : 'lose');
  }, [snapshot, me]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  return toast;
}
