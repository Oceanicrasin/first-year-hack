import { useSyncExternalStore } from 'react';

/**
 * Synthesised music and sound effects (Web Audio API, no audio files).
 * The browser only allows audio after a user gesture, so `unlock()` is called from the first click/keypress.
 */

export type Sfx =
  | 'move' | 'rotate' | 'lock' | 'drop' | 'clear' | 'tetris' | 'blind' | 'blocked'
  | 'shield' | 'charge' | 'ready' | 'round' | 'start' | 'win' | 'lose';

// ---- music: "Korobeiniki" (traditional Russian folk song, public domain) ----------------------
// Each token is NOTE:eighths, "-" is a rest. Every bar is 8 eighths.
const PART_A = `
  E5:2 B4:1 C5:1 D5:2 C5:1 B4:1 | A4:2 A4:1 C5:1 E5:2 D5:1 C5:1 | B4:3 C5:1 D5:2 E5:2 | C5:2 A4:2 A4:4 |
  -:1 D5:2 F5:1 A5:2 G5:1 F5:1 | E5:3 C5:1 E5:2 D5:1 C5:1 | B4:2 B4:1 C5:1 D5:2 E5:2 | C5:2 A4:2 A4:2 -:2`;
const BASS_A = ['E2', 'A2', 'G#2', 'A2', 'D2', 'C2', 'G#2', 'A2'];
const PART_B = `
  E5:4 C5:4 | D5:4 B4:4 | C5:4 A4:4 | G#4:4 B4:2 -:2 |
  E5:4 C5:4 | D5:4 B4:4 | C5:2 E5:2 A5:4 | G#5:8`;
const BASS_B = ['A2', 'G#2', 'A2', 'E2', 'A2', 'G#2', 'A2', 'E2'];

const midi = (name: string) => {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) throw new Error(`Bad note ${name}`);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as 'C'];
  return base + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;
};
const hz = (n: number) => 440 * 2 ** ((n - 69) / 12);

interface Step { lead?: [number, number]; bass: number }

function buildSection(melody: string, bass: string[]): Step[] {
  const steps: Step[] = [];
  for (const token of melody.replace(/\|/g, ' ').trim().split(/\s+/)) {
    const [note, len] = token.split(':');
    const length = Number(len);
    steps.push({ lead: note === '-' ? undefined : [midi(note), length], bass: 0 });
    for (let i = 1; i < length; i++) steps.push({ bass: 0 });
  }
  steps.forEach((s, i) => { s.bass = midi(bass[Math.floor(i / 8)]) + (i % 2 ? 12 : 0); });
  return steps;
}

const A = buildSection(PART_A, BASS_A);
const SONG: Step[] = [...A, ...A, ...buildSection(PART_B, BASS_B)];
const BPM = 140;

// ---- engine -----------------------------------------------------------------------------------
const readFlag = (key: string) => {
  try { return localStorage.getItem(key) !== 'off'; } catch { return true; }
};
const writeFlag = (key: string, on: boolean) => {
  try { localStorage.setItem(key, on ? 'on' : 'off'); } catch { /* ignore */ }
};

class AudioEngine {
  musicOn = readFlag('tetris-sabotage-music');
  sfxOn = readFlag('tetris-sabotage-sfx');

  private ctx: AudioContext | null = null;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  private listeners = new Set<() => void>();

  private wantMusic = false;
  private tempo = 1;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  };

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = 0.55;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 3200;
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.5;
      this.musicBus.connect(lowpass).connect(master);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(master);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.syncMusic();
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    writeFlag('tetris-sabotage-music', on);
    this.syncMusic();
    this.listeners.forEach((l) => l());
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    writeFlag('tetris-sabotage-sfx', on);
    this.listeners.forEach((l) => l());
  }

  /** Whether the game currently wants background music, and how fast. */
  setMusicWanted(want: boolean, tempo = 1) {
    this.tempo = tempo;
    if (want !== this.wantMusic) {
      this.wantMusic = want;
      if (!want) this.step = 0;
    }
    this.syncMusic();
  }

  private syncMusic() {
    const shouldPlay = Boolean(this.ctx) && this.wantMusic && this.musicOn;
    if (shouldPlay && this.timer === null) {
      this.nextTime = this.ctx!.currentTime + 0.08;
      this.timer = window.setInterval(this.schedule, 25);
    } else if (!shouldPlay && this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private schedule = () => {
    const ctx = this.ctx;
    if (!ctx) return;
    const eighth = 60 / (BPM * this.tempo) / 2;
    // If the tab was in the background, skip ahead instead of playing a burst of late notes.
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.15) {
      const s = SONG[this.step % SONG.length];
      const t = this.nextTime;
      if (s.lead) {
        this.tone('square', hz(s.lead[0]), t, s.lead[1] * eighth * 0.95, 0.075, this.musicBus, undefined, true);
        this.tone('triangle', hz(s.lead[0] + 12), t, s.lead[1] * eighth * 0.6, 0.025, this.musicBus);
      }
      this.tone('triangle', hz(s.bass), t, eighth * 0.85, 0.2, this.musicBus);
      if (this.step % 2 === 1) this.hiss(t, 0.03, 0.035, 7000, this.musicBus);
      this.nextTime += eighth;
      this.step++;
    }
  };

  play(name: Sfx, rows = 1) {
    if (!this.sfxOn || !this.ctx) return;
    const t = this.ctx.currentTime + 0.005;
    const out = this.sfxBus;
    const n = (note: string) => hz(midi(note));
    switch (name) {
      case 'move':
        this.tone('square', 300, t, 0.035, 0.035, out);
        break;
      case 'rotate':
        this.tone('square', 520, t, 0.07, 0.06, out, 820);
        break;
      case 'lock':
        this.tone('triangle', 150, t, 0.1, 0.22, out, 70);
        break;
      case 'drop':
        this.tone('triangle', 240, t, 0.2, 0.35, out, 45);
        this.hiss(t, 0.09, 0.14, 1400, out);
        break;
      case 'clear':
        ['C5', 'E5', 'G5', 'C6', 'E6'].slice(0, rows + 2).forEach((note, i) => this.tone('square', n(note), t + i * 0.055, 0.12, 0.07, out));
        break;
      case 'tetris':
        ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'].forEach((note, i) => this.tone('square', n(note), t + i * 0.05, 0.16, 0.07, out));
        this.tone('sine', n('C7'), t + 0.35, 0.6, 0.06, out);
        break;
      case 'blind':
        this.tone('sawtooth', 900, t, 0.6, 0.09, out, 110);
        this.tone('sine', 320, t, 0.6, 0.1, out, 60);
        this.hiss(t, 0.5, 0.05, 2500, out);
        break;
      case 'blocked':
        this.tone('square', 1320, t, 0.06, 0.08, out);
        this.tone('square', 1760, t + 0.05, 0.18, 0.07, out);
        this.hiss(t, 0.06, 0.12, 6000, out);
        break;
      case 'shield':
        ['C6', 'E6', 'G6', 'C7'].forEach((note, i) => this.tone('sine', n(note), t + i * 0.045, 0.55, 0.07, out));
        break;
      case 'charge':
        this.tone('sine', n('E6'), t, 0.1, 0.09, out);
        this.tone('sine', n('B6'), t + 0.09, 0.22, 0.09, out);
        break;
      case 'ready':
        this.tone('sine', n('A6'), t, 0.09, 0.05, out);
        break;
      case 'round':
      case 'start':
        ['G4', 'C5', 'E5', 'G5'].forEach((note, i) => this.tone('square', n(note), t + i * 0.09, 0.16, 0.07, out));
        break;
      case 'win':
        ['C5', 'E5', 'G5', 'C6', 'G5', 'C6'].forEach((note, i) => this.tone('square', n(note), t + i * 0.11, i === 5 ? 0.6 : 0.14, 0.08, out));
        break;
      case 'lose':
        ['G4', 'F#4', 'F4', 'E4'].forEach((note, i) => this.tone('triangle', n(note), t + i * 0.2, i === 3 ? 0.7 : 0.22, 0.16, out));
        break;
    }
  }

  private tone(type: OscillatorType, freq: number, start: number, dur: number, vol: number, dest: AudioNode, freqEnd?: number, sustain = false) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, start + dur);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.008);
    if (sustain) gain.gain.linearRampToValueAtTime(vol * 0.6, start + dur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(dest);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  private hiss(start: number, dur: number, vol: number, cutoff: number, dest: AudioNode) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter).connect(gain).connect(dest);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.02);
  }
}

export const audio = new AudioEngine();

export function useAudioSettings() {
  const music = useSyncExternalStore(audio.subscribe, () => audio.musicOn);
  const sfx = useSyncExternalStore(audio.subscribe, () => audio.sfxOn);
  return {
    music,
    sfx,
    toggleMusic: () => audio.setMusic(!audio.musicOn),
    toggleSfx: () => audio.setSfx(!audio.sfxOn),
  };
}
