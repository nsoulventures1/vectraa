import type { ConversionHistoryItem } from '../workspace/history';
import { supabase } from './supabase';

interface CloudHistoryRow {
  local_id: string;
  file_name: string;
  created_at: string;
  preset: ConversionHistoryItem['preset'];
  purpose: ConversionHistoryItem['purpose'];
  quality_score: number;
  fidelity_score: number | null;
  paths: number;
  bytes: number;
}

export async function syncHistory(userId: string, localItems: ConversionHistoryItem[]): Promise<ConversionHistoryItem[]> {
  if (!supabase) return localItems;

  if (localItems.length) {
    const rows = localItems.map((item) => ({
      user_id: userId,
      local_id: item.id,
      file_name: item.fileName,
      created_at: new Date(item.createdAt).toISOString(),
      preset: item.preset,
      purpose: item.purpose,
      quality_score: item.qualityScore,
      fidelity_score: item.fidelityScore ?? null,
      paths: item.paths,
      bytes: item.bytes,
    }));
    const { error } = await supabase.from('conversion_history').upsert(rows, { onConflict: 'user_id,local_id' });
    if (error) throw error;
  }

  const { data, error } = await supabase
    .from('conversion_history')
    .select('local_id,file_name,created_at,preset,purpose,quality_score,fidelity_score,paths,bytes')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;

  return ((data ?? []) as CloudHistoryRow[]).map((row) => ({
    id: row.local_id,
    fileName: row.file_name,
    createdAt: new Date(row.created_at).getTime(),
    preset: row.preset,
    purpose: row.purpose,
    qualityScore: row.quality_score,
    fidelityScore: row.fidelity_score ?? undefined,
    paths: row.paths,
    bytes: Number(row.bytes),
  }));
}

export async function deleteCloudHistory(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('conversion_history').delete().not('id', 'is', null);
  if (error) throw error;
}
