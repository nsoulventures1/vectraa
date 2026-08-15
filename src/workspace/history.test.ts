import { describe, expect, it } from 'vitest';
import { addConversionHistoryItem, clearConversionHistory, createHistoryItem, readConversionHistory } from './history';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

describe('local conversion history', () => {
  it('stores only conversion metadata, not artwork', () => {
    const storage = memoryStorage();
    const item = createHistoryItem({ fileName: 'logo.png', preset: 'logo', purpose: 'branding', qualityScore: 91, fidelityScore: 88, paths: 14, bytes: 1024, createdAt: 1 });
    addConversionHistoryItem(item, storage);
    const [saved] = readConversionHistory(storage);
    expect(saved.fileName).toBe('logo.png');
    expect(JSON.stringify(saved)).not.toContain('<svg');
    expect(JSON.stringify(saved)).not.toContain('data:image');
  });

  it('keeps only the latest 20 items', () => {
    const storage = memoryStorage();
    for (let i = 0; i < 25; i += 1) addConversionHistoryItem(createHistoryItem({ fileName: `${i}.png`, preset: 'logo', purpose: 'general', qualityScore: 80, paths: 5, bytes: 500, createdAt: i }), storage);
    expect(readConversionHistory(storage)).toHaveLength(20);
  });

  it('can clear all local history', () => {
    const storage = memoryStorage();
    addConversionHistoryItem(createHistoryItem({ fileName: 'a.png', preset: 'logo', purpose: 'general', qualityScore: 80, paths: 5, bytes: 500 }), storage);
    clearConversionHistory(storage);
    expect(readConversionHistory(storage)).toEqual([]);
  });
});
