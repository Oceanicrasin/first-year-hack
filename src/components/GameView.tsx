import { useEffect, useRef, useState } from 'react';
import { BLIND_EVERY, BLIND_MS, ROTATION_COOLDOWN_MS, SHIELD_STREAK, placementPlayer } from '../game/engine';
import type { PlayerId } from '../game/engine';
import type { ClientAction, PresenceMeta, Snapshot } from '../net/protocol';
import { submitScore } from '../net/leaderboard';
import { audio } from '../audio/audio';
import { BoardCanvas, NextCanvas } from './BoardCanvas';
import { Leaderboard } from './Leaderboard';
import { useGameFx } from './useGameFx';

interface Props {
  code: string;
  role: 'host' | 'guest';
  name: string;
  snapshot: Snapshot | null;
  peers: PresenceMeta[];
  send: (action: ClientAction) => void;
  onLeave: () => void;
}

const KEYS: Record<string, ClientAction> = {
  ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowDown: 'DOWN', ' ': 'DROP', r: 'ROTATE', R: 'ROTATE', z: 'BLIND', Z: 'BLIND',
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function GameView({ code, role, name, snapshot, peers, send, onLeave }: Props) {
  const me: PlayerId = role === 'host' ? 1 : 2;
  const opponent = peers.find((p) => p.role !== role);
  const names = me === 1 ? [name, opponent?.name ?? 'Player 2'] : [opponent?.name ?? 'Player 1', name];
  const game = snapshot?.game ?? null;
  const running = snapshot?.phase === 'running' && game !== null;
  const powers = game?.powers;

  // Timers: the host reports remaining ms; count down locally between updates. A value of 0 means
  // "not active" (rather than "ends now"), so a fresh snapshot never makes a ready bar flicker back.
  const [readyAt, setReadyAt] = useState(0);
  const [blindEnd, setBlindEnd] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!snapshot) return;
    const t = Date.now();
    const cooldown = snapshot.cooldown[me - 1];
    setReadyAt(cooldown > 0 ? t + cooldown : 0);
    setBlindEnd(snapshot.blindMs > 0 ? t + snapshot.blindMs : 0);
    setNow(t);
  }, [snapshot, me]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 100); return () => window.clearInterval(t); }, []);
  const remaining = readyAt ? Math.max(0, readyAt - now) : 0;
  const blindLeft = blindEnd ? Math.max(0, blindEnd - now) : 0;

  const placer = game ? placementPlayer(game) : null;
  const placing = running && placer === me;
  const sabotaging = running && placer !== me;
  const cooling = sabotaging && remaining > 0;
  const blinded = placing && blindLeft > 0;
  const canBlind = sabotaging && (powers?.blindCharges ?? 0) > 0 && blindLeft === 0;

  const toast = useGameFx(snapshot, me);

  // Music plays while a game is running, a little faster in round 2.
  useEffect(() => { audio.setMusicWanted(running, game?.round === 2 ? 1.12 : 1); }, [running, game?.round]);
  useEffect(() => () => audio.setMusicWanted(false), []);

  // Soft ping when the sabotage rotation recharges.
  const wasCooling = useRef(false);
  useEffect(() => {
    if (wasCooling.current && !cooling && sabotaging) audio.play('ready');
    wasCooling.current = cooling;
  }, [cooling, sabotaging]);

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
      const action = KEYS[e.key];
      if (!action || !running || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      e.preventDefault();
      if (e.repeat && (action === 'DROP' || action === 'BLIND')) return;
      if (sabotaging && action !== 'ROTATE' && action !== 'BLIND') return; // the sabotager can only rotate and blind
      if (placing && action === 'BLIND') return;
      if (action === 'ROTATE' && cooling) return;
      if (action === 'BLIND' && !canBlind) return;
      send(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, placing, sabotaging, cooling, canBlind, send]);

  const [copied, setCopied] = useState(false);
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const status = !snapshot
    ? 'Connecting to the room…'
    : snapshot.phase === 'waiting'
      ? 'Waiting for Player 2 — share the room code'
      : snapshot.phase === 'finished'
        ? 'Game over'
        : `Round ${game!.round} of 2 · ${names[placer! - 1]} places, ${names[placer === 1 ? 1 : 0]} sabotages`;

  const progress = Math.min(1, 1 - remaining / ROTATION_COOLDOWN_MS);

  return (
    <>
      <div className="hud">
        <button className="room-chip" onClick={copyCode} title="Copy room code">
          <span>ROOM</span><strong>{code}</strong><em>{copied ? 'Copied!' : 'Copy'}</em>
        </button>
        <div className="status-pill">{status}</div>
      </div>

      <div className="game">
        <div className={`board-wrap ${sabotaging ? 'sabotage' : placing ? 'placement' : ''}`}>
          <BoardCanvas game={game} />
          {toast && <div key={toast.id} className={`toast ${toast.tone}`}>{toast.text}</div>}
          {!game && (
            <div className="board-overlay">
              <div className="spinner" />
              <p>Waiting for Player 2</p>
              <p className="hint">Send them the code <strong>{code}</strong></p>
            </div>
          )}
        </div>

        <aside className="side">
          <section className={`panel role-card ${placing ? 'placement' : sabotaging ? 'sabotage' : ''}`}>
            <h3>Your role · Player {me}</h3>
            {placing ? (
              <><div className="role-name">🎯 Placement</div><p>Move, drop and rotate the piece. Clear lines!</p></>
            ) : sabotaging ? (
              <><div className="role-name">😈 Sabotage</div><p>Rotate the piece at the worst possible moment.</p></>
            ) : (
              <><div className="role-name muted">Waiting…</div><p>Your role appears when the game starts.</p></>
            )}
          </section>

          <section className="panel">
            <h3>Next</h3>
            <div className="next-wrap">
              <NextCanvas type={blinded ? null : game?.next ?? null} />
              {blinded && (
                <div className="blind-overlay" role="status">
                  <span>BLINDED</span>
                  <small>{seconds(blindLeft)}</small>
                </div>
              )}
            </div>
            {sabotaging && blindLeft > 0 && <p className="hint good-text">👁️ Opponent can't see this · {Math.ceil(blindLeft / 1000)}s</p>}
          </section>

          <section className="panel">
            <h3>Scores</h3>
            <div className="scoreboard">
              {[0, 1].map((i) => (
                <div key={i} className={`score-row p${i + 1} ${running && placer === i + 1 ? 'active' : ''}`}>
                  <span className="who">{names[i]}{me === i + 1 && <em> (you)</em>}</span>
                  <strong>{(game?.scores[i] ?? 0).toLocaleString()}</strong>
                </div>
              ))}
            </div>
          </section>

          {placing && powers && (
            <section className="panel">
              <h3>Controls</h3>
              <div className="controls">
                <div className="dpad">
                  <button aria-label="Move left" onClick={() => send('LEFT')}>←</button>
                  <button aria-label="Soft drop" onClick={() => send('DOWN')}>↓</button>
                  <button aria-label="Move right" onClick={() => send('RIGHT')}>→</button>
                </div>
                <div className="dpad two">
                  <button onClick={() => send('ROTATE')}>⟳ Rotate</button>
                  <button className="primary" onClick={() => send('DROP')}>⤓ Drop</button>
                </div>
                <p className="hint"><kbd>←</kbd><kbd>→</kbd> move · <kbd>↓</kbd> soft drop · <kbd>Space</kbd> drop · <kbd>R</kbd> rotate</p>

                <div className={`ability shield ${powers.shield ? 'armed' : ''}`}>
                  <div className="ability-head">
                    <span>🛡️ Shield</span>
                    <span className={`ability-state ${powers.shield ? 'ready' : ''}`}>{powers.shield ? 'Active' : 'Charging'}</span>
                  </div>
                  <div className="pips">
                    {Array.from({ length: SHIELD_STREAK }, (_, i) => (
                      <span key={i} className={powers.shield || i < powers.streakRows ? 'on' : ''} />
                    ))}
                  </div>
                  <p className="hint">
                    {powers.shield ? 'Blocks the next Blind automatically.' : `Clear ${SHIELD_STREAK}+ rows back-to-back to block the next Blind.`}
                  </p>
                  {powers.blindCharges > 0 && <p className="warn">⚠ Opponent has a Blind ready{powers.shield ? ' — you’re covered.' : '.'}</p>}
                </div>
              </div>
            </section>
          )}

          {sabotaging && powers && (
            <section className="panel">
              <h3>Sabotage</h3>
              <div className="controls">
                <button className="sabotage-btn" disabled={cooling} onClick={() => send('ROTATE')}>⟳ Rotate <kbd>R</kbd></button>
                <div className={`cooldown ${remaining === 0 ? 'ready' : ''}`} role="progressbar" aria-label="Rotation cooldown" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                  <div className="cooldown-label"><span>Recharge</span><span>{remaining === 0 ? 'Ready' : seconds(remaining)}</span></div>
                  <div className="cooldown-track"><div style={{ width: `${progress * 100}%` }} /></div>
                </div>

                <div className={`ability blind ${powers.blindCharges > 0 ? 'armed' : ''}`}>
                  <div className="ability-head">
                    <span>👁️ Blind</span>
                    <span className="ability-state">{powers.sabotageRotations}/{BLIND_EVERY} rotations</span>
                  </div>
                  <div className="pips">
                    {Array.from({ length: BLIND_EVERY }, (_, i) => <span key={i} className={i < powers.sabotageRotations ? 'on' : ''} />)}
                  </div>
                  <button className="blind-btn" disabled={!canBlind} onClick={() => send('BLIND')}>
                    {blindLeft > 0 ? `Blinding… ${Math.ceil(blindLeft / 1000)}s` : `Blind ×${powers.blindCharges}`} <kbd>Z</kbd>
                  </button>
                  <p className="hint">Hides their NEXT piece for {BLIND_MS / 1000}s. Earn one every {BLIND_EVERY} rotations.</p>
                  {powers.shield && <p className="warn">🛡️ They have a Shield — your next Blind will be blocked.</p>}
                </div>
              </div>
            </section>
          )}

          <button className="ghost" onClick={onLeave}>Leave room</button>
        </aside>

        <aside className="side side-board">
          <Leaderboard refreshKey={boardKey} />
        </aside>
      </div>

      {snapshot?.phase === 'finished' && game && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-label="Match result">
            <div className="hint">MATCH COMPLETE</div>
            <h2>{game.winner === 'draw' ? "🤝 It's a draw!" : game.winner === me ? '🏆 You win!' : `${names[(game.winner as PlayerId) - 1]} wins`}</h2>
            <div className="final-scores">
              {[0, 1].map((i) => (
                <div key={i} className={`final p${i + 1} ${game.winner === i + 1 ? 'won' : ''}`}>
                  <span>{names[i]}</span><strong>{game.scores[i].toLocaleString()}</strong>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="primary" onClick={() => send('RESTART')}>Play again</button>
              <button className="ghost" onClick={onLeave}>Leave</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
