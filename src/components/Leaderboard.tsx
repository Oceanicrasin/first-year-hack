import { useEffect, useState } from 'react';
import { fetchTopScores } from '../net/leaderboard';
import type { ScoreRow } from '../net/leaderboard';

export function Leaderboard({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<ScoreRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTopScores().then((r) => { if (!cancelled) setRows(r); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <div className="panel">
      <h3>🏆 Leaderboard</h3>
      {rows === null ? <p className="muted">Loading…</p> : rows.length === 0 ? <p className="muted">No scores yet.</p> : (
        <ol className="leaderboard">
          {rows.map((r) => (
            <li key={r.id}><span>{r.name}{r.won ? ' 👑' : ''}</span><strong>{r.score}</strong></li>
          ))}
        </ol>
      )}
    </div>
  );
}
