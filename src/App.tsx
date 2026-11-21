import { useState } from 'react';
import { GameView } from './components/GameView';
import { Leaderboard } from './components/Leaderboard';
import { supabaseConfigured } from './net/supabase';
import { useRoom } from './net/useRoom';

const NAME_KEY = 'sabotage-tetris-name';
const loadName = () => {
  try { return localStorage.getItem(NAME_KEY) || `Player${Math.floor(100 + Math.random() * 900)}`; } catch { return 'Player'; }
};

export function App() {
  const [name, setName] = useState(loadName);
  const [codeInput, setCodeInput] = useState('');
  const room = useRoom(name.trim() || 'Player');

  const rememberName = (value: string) => {
    setName(value);
    try { localStorage.setItem(NAME_KEY, value); } catch { /* ignore */ }
  };

  if (!supabaseConfigured) {
    return (
      <main>
        <h1>🎮 Sabotage Tetris 🎮</h1>
        <div className="status error">
          Supabase isn't configured. Copy <code>.env.local.example</code> to <code>.env.local</code>, add your project's
          anon key (<code>VITE_SUPABASE_ANON_KEY</code>), then restart <code>npm run dev</code>.
        </div>
      </main>
    );
  }

  const inRoom = room.connection === 'ready' && room.role;
  const busy = room.connection === 'connecting';

  return (
    <main>
      <h1>🎮 Sabotage Tetris 🎮</h1>
      {inRoom ? (
        <GameView
          code={room.code}
          role={room.role!}
          name={name.trim() || 'Player'}
          snapshot={room.snapshot}
          peers={room.peers}
          send={room.send}
          onLeave={room.leave}
        />
      ) : (
        <div className="lobby">
          {room.error && <div className="status error" onClick={room.dismissError}>{room.error}</div>}
          <div className="panel">
            <h3>Your name</h3>
            <input value={name} maxLength={20} onChange={(e) => rememberName(e.target.value)} aria-label="Your name" />
            <button className="primary" disabled={busy} onClick={() => void room.createRoom()}>
              {busy ? 'Connecting…' : 'Create room'}
            </button>
            <form onSubmit={(e) => { e.preventDefault(); void room.joinRoom(codeInput); }}>
              <input
                value={codeInput}
                maxLength={8}
                placeholder="ROOM CODE"
                aria-label="Room code"
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              />
              <button disabled={busy || !codeInput.trim()}>Join</button>
            </form>
          </div>
          <Leaderboard refreshKey={0} />
        </div>
      )}
    </main>
  );
}
