import { supabase } from './supabase';

export interface ScoreRow {
  id: number;
  name: string;
  score: number;
  won: boolean;
  created_at: string;
}

export async function fetchTopScores(limit = 10): Promise<ScoreRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('scores')
    .select('id,name,score,won,created_at')
    .order('score', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('Could not load leaderboard:', error.message);
    return [];
  }
  return data ?? [];
}

export async function submitScore(name: string, score: number, won: boolean, room: string) {
  if (!supabase) return;
  const { error } = await supabase.from('scores').insert({ name: name.slice(0, 20), score, won, room });
  if (error) console.error('Could not submit score:', error.message);
}
