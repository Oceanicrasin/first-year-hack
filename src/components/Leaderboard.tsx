import { useEffect, useState } from 'react';
import { fetchTopScores } from '../net/leaderboard';
import type { ScoreRow } from '../net/leaderboard';

const MEDALS = ['🥇', '🥈', '🥉'];

export function Leaderboard({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<ScoreRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTopScores().then((r) => { if (!cancelled) setRows(r); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <section className="panel rgb-card">
      <h3 className="rgb-title">🏆 Leaderboard</h3>
      {rows === null ? (
        <p className="hint">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="hint">No scores yet. Be the first!</p>
      ) : (
        <ol className="leaderboard">
          {rows.map((r, i) => (
            <li key={r.id} className={i < 3 ? 'podium' : ''}>
              <span className="rank">{MEDALS[i] ?? i + 1}</span>
              <span className="name" title={r.name}>{r.name}{r.won && <span className="crown" title="Won the match"> 👑</span>}</span>
              <strong>{r.score.toLocaleString()}</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
