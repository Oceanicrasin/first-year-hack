import { useEffect, useState } from 'react';
import { audio, useAudioSettings } from './audio/audio';
import { GameView } from './components/GameView';
import { Leaderboard } from './components/Leaderboard';
import { Starfield } from './components/Starfield';
import { supabaseConfigured } from './net/supabase';
import { useRoom } from './net/useRoom';

const NAME_KEY = 'sabotage-tetris-name';
const loadName = () => {
  try { return localStorage.getItem(NAME_KEY) || `Player${Math.floor(100 + Math.random() * 900)}`; } catch { return 'Player'; }
};

function Title() {
  return (
    <header className="title">
      <h1>TETRIS <span>SABOTAGE</span></h1>
      <p>Two players. One board. Zero trust.</p>
    </header>
  );
}

function AudioToggles() {
  const { music, sfx, toggleMusic, toggleSfx } = useAudioSettings();
  return (
    <div className="audio-toggles">
      <button className="icon-btn" aria-pressed={music} onClick={toggleMusic} title={music ? 'Mute music' : 'Play music'} aria-label="Music">
        {music ? '🎵' : '🔇'}
      </button>
      <button className="icon-btn" aria-pressed={sfx} onClick={toggleSfx} title={sfx ? 'Mute sound effects' : 'Play sound effects'} aria-label="Sound effects">
        {sfx ? '🔊' : '🔈'}
      </button>
    </div>
  );
}

export function App() {
  const [name, setName] = useState(loadName);
  const [codeInput, setCodeInput] = useState('');
  const room = useRoom(name.trim() || 'Player');

  // Browsers only allow audio after a user gesture.
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const rememberName = (value: string) => {
    setName(value);
    try { localStorage.setItem(NAME_KEY, value); } catch { /* ignore */ }
  };

  const inRoom = room.connection === 'ready' && room.role;
  const busy = room.connection === 'connecting';

  return (
    <>
      <Starfield />
      <AudioToggles />
      <main>
        <Title />
        {!supabaseConfigured ? (
          <div className="panel notice error">
            Supabase isn't configured. Set <code>VITE_SUPABASE_ANON_KEY</code> (your publishable key) in <code>.env.local</code>,
            or in your hosting provider's environment variables, and rebuild.
          </div>
        ) : inRoom ? (
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
            <section className="panel lobby-card">
              {room.error && (
                <button className="notice error" onClick={room.dismissError} title="Dismiss">{room.error}</button>
              )}
              <label className="field">
                <span>Your name</span>
                <input value={name} maxLength={20} onChange={(e) => rememberName(e.target.value)} />
              </label>
              <button className="primary big" disabled={busy} onClick={() => void room.createRoom()}>
                {busy ? 'Connecting…' : 'Create room'}
              </button>
              <div className="divider"><span>or join a friend</span></div>
              <form className="join" onSubmit={(e) => { e.preventDefault(); void room.joinRoom(codeInput); }}>
                <input
                  className="code-input"
                  value={codeInput}
                  maxLength={8}
                  placeholder="CODE"
                  aria-label="Room code"
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                />
                <button disabled={busy || !codeInput.trim()}>Join</button>
              </form>
              <div className="how">
                <div><strong>Round 1</strong><span>P1 places · P2 sabotages</span></div>
                <div><strong>Round 2</strong><span>P2 places · P1 sabotages</span></div>
              </div>
              <div className="abilities-info">
                <div><span>👁️</span><p><strong>Blind</strong> — the sabotager earns one every 5 rotations. Press <kbd>Z</kbd> to hide the placer's NEXT piece for 10s.</p></div>
                <div><span>🛡️</span><p><strong>Shield</strong> — the placer earns one by clearing 2+ rows back-to-back. It blocks the next Blind.</p></div>
              </div>
            </section>
            <aside className="lobby-side">
              <Leaderboard refreshKey={0} />
            </aside>
          </div>
        )}
      </main>
    </>
  );
}
