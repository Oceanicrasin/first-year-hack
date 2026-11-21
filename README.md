# Sabotage Tetris

An online two-player Tetris game with a **rotation-sabotage** mechanic, built with TypeScript + React + Supabase Realtime.

| Round | Player 1 | Player 2 |
|-------|----------|----------|
| 1 | Places the piece (move / drop) | Sabotages by rotating (3s cooldown) |
| 2 | Sabotages by rotating (3s cooldown) | Places the piece |

After both rounds, the higher score wins. Scores are saved to a global leaderboard.

## Setup

1. In your Supabase project, run `supabase/schema.sql` in the SQL editor (creates the `scores` table).
2. Copy `.env.local.example` to `.env.local` and paste your project's anon key into `VITE_SUPABASE_ANON_KEY`.
   (`VITE_SUPABASE_URL` is already set in `.env`.)
3. `npm install`, then `npm run dev`.

## Playing

One player clicks **Create room** and shares the 5-letter code; the other enters it and clicks **Join**.
This works across the internet, since rooms are Supabase Realtime channels (Presence + Broadcast).
The host's browser runs the game and broadcasts state; the guest sends their actions.

Controls: ← → move, ↓ soft drop, Space hard drop, R rotate (on-screen buttons too).

## Deploy

`npm run build` produces a static site in `dist/`, which can go on Vercel, Netlify or Cloudflare Pages.
Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables there.
