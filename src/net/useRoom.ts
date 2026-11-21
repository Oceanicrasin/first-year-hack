import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { ROTATION_COOLDOWN_MS, TICK_MS, applyAction, newGame, placementPlayer, tick } from '../game/engine';
import type { GameState, PlayerId } from '../game/engine';
import type { ClientAction, Phase, PresenceMeta, Snapshot } from './protocol';
import { supabase } from './supabase';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const SYNC_TIMEOUT_MS = 4000;

export type Connection = 'idle' | 'connecting' | 'ready';

export function useRoom(name: string) {
  const [connection, setConnection] = useState<Connection>('idle');
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [role, setRole] = useState<'host' | 'guest' | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [peers, setPeers] = useState<PresenceMeta[]>([]);

  const clientId = useRef(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  const channel = useRef<RealtimeChannel | null>(null);
  const timer = useRef<number | null>(null);
  const roleRef = useRef<'host' | 'guest' | null>(null);
  const game = useRef<GameState | null>(null);
  const phase = useRef<Phase>('waiting');
  const gameId = useRef(0);
  const lastRotation = useRef<[number, number]>([0, 0]);
  const prevGuests = useRef(0);
  const sawHost = useRef(false);

  const stopTimer = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };

  const leave = useCallback(() => {
    stopTimer();
    if (channel.current && supabase) void supabase.removeChannel(channel.current);
    channel.current = null;
    roleRef.current = null;
    game.current = null;
    phase.current = 'waiting';
    prevGuests.current = 0;
    sawHost.current = false;
    setConnection('idle');
    setCode('');
    setRole(null);
    setSnapshot(null);
    setPeers([]);
  }, []);

  useEffect(() => leave, [leave]);

  // ---- host side -------------------------------------------------------------------------
  const publish = () => {
    const now = Date.now();
    const snap: Snapshot = {
      gameId: gameId.current,
      phase: phase.current,
      game: game.current,
      cooldown: [
        Math.max(0, ROTATION_COOLDOWN_MS - (now - lastRotation.current[0])),
        Math.max(0, ROTATION_COOLDOWN_MS - (now - lastRotation.current[1])),
      ],
      blindMs: game.current ? Math.max(0, game.current.powers.blindUntil - now) : 0,
    };
    setSnapshot(snap);
    void channel.current?.send({ type: 'broadcast', event: 'snap', payload: snap });
  };

  const startGame = () => {
    stopTimer();
    game.current = newGame();
    phase.current = 'running';
    gameId.current += 1;
    lastRotation.current = [0, 0];
    publish();
    timer.current = window.setInterval(() => {
      if (!game.current) return;
      game.current = tick(game.current);
      if (game.current.finished) {
        phase.current = 'finished';
        stopTimer();
      }
      publish();
    }, TICK_MS);
  };

  const handleAction = (player: PlayerId, action: ClientAction) => {
    if (action === 'RESTART') {
      if (phase.current === 'finished' && prevGuests.current > 0) startGame();
      return;
    }
    const current = game.current;
    if (phase.current !== 'running' || !current) return;
    const placing = placementPlayer(current);
    if (action === 'ROTATE') {
      const sabotage = player !== placing;
      const now = Date.now();
      if (sabotage && now - lastRotation.current[player - 1] < ROTATION_COOLDOWN_MS) return;
      const result = applyAction(current, 'ROTATE', { saboteur: sabotage, now });
      if (!result.ok) return;
      if (sabotage) lastRotation.current[player - 1] = now;
      game.current = result.state;
    } else if (action === 'BLIND') {
      if (player === placing) return;
      const result = applyAction(current, 'BLIND', { saboteur: true, now: Date.now() });
      if (!result.ok) return;
      game.current = result.state;
    } else if (player === placing) {
      const result = applyAction(current, action);
      if (!result.ok) return;
      game.current = result.state;
      if (game.current.finished) {
        phase.current = 'finished';
        stopTimer();
      }
    } else return;
    publish();
  };

  // ---- connection ------------------------------------------------------------------------
  const readMetas = (ch: RealtimeChannel): PresenceMeta[] =>
    Object.values(ch.presenceState<PresenceMeta>()).flat() as PresenceMeta[];

  const onPresence = (ch: RealtimeChannel) => {
    const metas = readMetas(ch);
    setPeers(metas);
    if (roleRef.current === 'host') {
      const guests = metas.filter((m) => m.role === 'guest').length;
      if (guests > 0 && prevGuests.current === 0) {
        prevGuests.current = guests;
        startGame();
      } else if (guests === 0 && prevGuests.current > 0) {
        prevGuests.current = 0;
        stopTimer();
        game.current = null;
        phase.current = 'waiting';
        publish();
      }
    } else if (roleRef.current === 'guest') {
      if (metas.some((m) => m.role === 'host')) sawHost.current = true;
      else if (sawHost.current) {
        setError('The host left the room.');
        leave();
      }
    }
  };

  /** Subscribes to a room channel; resolves once presence has synced (or timed out). */
  const open = async (roomCode: string) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const ch = supabase.channel(`tetris:${roomCode}`, {
      config: { presence: { key: clientId.current }, broadcast: { self: false } },
    });
    let markSynced: () => void = () => {};
    const synced = new Promise<void>((resolve) => {
      markSynced = resolve;
      window.setTimeout(resolve, SYNC_TIMEOUT_MS);
    });
    ch.on('presence', { event: 'sync' }, () => {
      markSynced();
      if (channel.current === ch) onPresence(ch);
    });
    ch.on('broadcast', { event: 'snap' }, ({ payload }) => {
      if (roleRef.current === 'guest') setSnapshot(payload as Snapshot);
    });
    ch.on('broadcast', { event: 'action' }, ({ payload }) => {
      if (roleRef.current === 'host') handleAction(2, (payload as { action: ClientAction }).action);
    });
    await new Promise<void>((resolve, reject) => {
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error('Could not reach the game service.'));
      });
    });
    await synced;
    return ch;
  };

  const fail = async (ch: RealtimeChannel | null, message: string) => {
    if (ch && supabase) await supabase.removeChannel(ch);
    channel.current = null;
    setError(message);
    setConnection('idle');
  };

  const createRoom = useCallback(async () => {
    leave();
    setError('');
    setConnection('connecting');
    let ch: RealtimeChannel | null = null;
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = makeCode();
        ch = await open(candidate);
        if (!readMetas(ch).some((m) => m.role === 'host')) {
          roleRef.current = 'host';
          channel.current = ch;
          setCode(candidate);
          setRole('host');
          await ch.track({ clientId: clientId.current, role: 'host', name } satisfies PresenceMeta);
          setConnection('ready');
          publish();
          return;
        }
        await supabase!.removeChannel(ch);
        ch = null;
      }
      await fail(null, 'Could not find a free room code. Try again.');
    } catch (e) {
      await fail(ch, e instanceof Error ? e.message : 'Could not create the room.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, leave]);

  const joinRoom = useCallback(async (rawCode: string) => {
    leave();
    setError('');
    const roomCode = rawCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(roomCode)) return setError('Enter a valid room code.');
    setConnection('connecting');
    let ch: RealtimeChannel | null = null;
    try {
      ch = await open(roomCode);
      const metas = readMetas(ch);
      if (!metas.some((m) => m.role === 'host')) return await fail(ch, 'Room not found. Check the code and try again.');
      if (metas.some((m) => m.role === 'guest')) return await fail(ch, 'That room is already full.');
      roleRef.current = 'guest';
      channel.current = ch;
      sawHost.current = true;
      setCode(roomCode);
      setRole('guest');
      setPeers(metas);
      await ch.track({ clientId: clientId.current, role: 'guest', name } satisfies PresenceMeta);
      setConnection('ready');
    } catch (e) {
      await fail(ch, e instanceof Error ? e.message : 'Could not join the room.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, leave]);

  const send = useCallback((action: ClientAction) => {
    if (roleRef.current === 'host') handleAction(1, action);
    else if (roleRef.current === 'guest') void channel.current?.send({ type: 'broadcast', event: 'action', payload: { action } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissError = useCallback(() => setError(''), []);

  return { connection, error, dismissError, code, role, snapshot, peers, createRoom, joinRoom, leave, send };
}
