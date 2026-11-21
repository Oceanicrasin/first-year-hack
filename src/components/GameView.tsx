import { useEffect, useState } from 'react';
import { ROTATION_COOLDOWN_MS, placementPlayer } from '../game/engine';
import type { PlayerId } from '../game/engine';
import type { ClientAction, PresenceMeta, Snapshot } from '../net/protocol';
import { submitScore } from '../net/leaderboard';
import { BoardCanvas, NextCanvas } from './BoardCanvas';
import { Leaderboard } from './Leaderboard';

interface Props {
  code: string;
  role: 'host' | 'guest';
  name: string;
  snapshot: Snapshot | null;
  peers: PresenceMeta[];
  send: (action: ClientAction) => void;
  onLeave: () => void;
}

export function GameView({ code, role, name, snapshot, peers, send, onLeave }: Props) {
  const me: PlayerId = role === 'host' ? 1 : 2;
  const opponent = peers.find((p) => p.role !== role);
  const names = me === 1 ? [name, opponent?.name ?? 'Player 2'] : [opponent?.name ?? 'Player 1', name];
  const game = snapshot?.game ?? null;
  const running = snapshot?.phase === 'running' && game !== null;

  // Rotation cooldown: the host reports remaining ms; count down locally between updates.
  const [readyAt, setReadyAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (snapshot) setReadyAt(Date.now() + snapshot.cooldown[me - 1]); }, [snapshot, me]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 100); return () => window.clearInterval(t); }, []);
  const remaining = Math.max(0, readyAt - now);

  const placing = game ? placementPlayer(game) === me : false;
  const sabotaging = running && !placing;
  const cooling = sabotaging && remaining > 0;

  // Submit this player's own score to the leaderboard once per finished game.
  const [boardKey, setBoardKey] = useState(0);
  const [submittedGame, setSubmittedGame] = useState(0);
  useEffect(() => {
    if (snapshot?.phase !== 'finished' || !game || submittedGame === snapshot.gameId) return;
    setSubmittedGame(snapshot.gameId);
    void submitScore(name, game.scores[me - 1], game.winner === me, code).then(() => setBoardKey((k) => k + 1));
  }, [snapshot, game, submittedGame, name, me, code]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, ClientAction> = { ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowDown: 'DOWN', ' ': 'DROP', r: 'ROTATE', R: 'ROTATE' };
      const action = map[e.key];
      if (!action || !running) return;
      e.preventDefault();
      if (action === 'ROTATE' && cooling) return;
      send(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, cooling, send]);

  const status = !snapshot
    ? 'Connecting to the room…'
    : snapshot.phase === 'waiting'
      ? `Room ${code} — waiting for Player 2. Share this code with your friend.`
      : snapshot.phase === 'finished'
        ? 'Game over!'
        : `You are Player ${me} — Round ${game!.round}`;

  const roundInfo = game && snapshot?.phase === 'running'
    ? `Round ${game.round}: Player ${placementPlayer(game)} places, Player ${placementPlayer(game) === 1 ? 2 : 1} sabotages`
    : '';

  const progress = 1 - remaining / ROTATION_COOLDOWN_MS;

  return (
    <>
      <div className="status">{status}</div>
      <div className="round-info">{roundInfo}</div>
      <div className="game">
        <BoardCanvas game={game} />
        <div className="side">
          <div className="panel">
            <h3>Your Role</h3>
            {running ? (
              <div className={`role ${placing ? 'placement' : 'sabotage'}`}>
                {placing ? '🎯 PLACEMENT - Move and rotate the piece!' : '😈 SABOTAGE - Rotate to mess up!'}
              </div>
            ) : <div className="role">Waiting…</div>}
          </div>
          <div className="panel"><h3>Next Piece</h3><NextCanvas type={game?.next ?? null} /></div>
          <div className="panel">
            <h3>Scores</h3>
            <div>{names[0]}: <span className="score p1">{game?.scores[0] ?? 0}</span></div>
            <div>{names[1]}: <span className="score p2">{game?.scores[1] ?? 0}</span></div>
          </div>
          <div className="panel">
            <h3>Controls</h3>
            {running && (
              <div className="controls">
                <div className="control-row">
                  <button onClick={() => send('LEFT')}>←</button>
                  <button onClick={() => send('DOWN')}>↓</button>
                  <button onClick={() => send('RIGHT')}>→</button>
                </div>
                <button onClick={() => send('DROP')}>⬇ Hard Drop</button>
                <button onClick={() => send('ROTATE')} disabled={cooling}>🔄 Rotate</button>
                {sabotaging && (
                  <div className={`cooldown ${remaining === 0 ? 'ready' : ''}`}>
                    <div className="cooldown-label"><span>Rotation</span><span>{remaining === 0 ? 'Ready' : `Ready in ${(remaining / 1000).toFixed(1)}s`}</span></div>
                    <div className="cooldown-track"><div style={{ width: `${Math.min(1, progress) * 100}%` }} /></div>
                  </div>
                )}
              </div>
            )}
            <p className="muted">Arrow keys move, Space drops, R rotates.</p>
          </div>
          <button className="quiet" onClick={onLeave}>Leave room</button>
        </div>
      </div>

      {snapshot?.phase === 'finished' && game && (
        <div className="winner">
          <h2>{game.winner === 'draw' ? "🤝 It's a draw!" : `🏆 ${names[(game.winner as PlayerId) - 1]} wins!`}</h2>
          <p>{names[0]}: {game.scores[0]}</p>
          <p>{names[1]}: {game.scores[1]}</p>
          <button onClick={() => send('RESTART')}>Play again</button>
          <Leaderboard refreshKey={boardKey} />
        </div>
      )}
    </>
  );
}
