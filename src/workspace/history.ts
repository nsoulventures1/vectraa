import type { ProductionPurpose } from '../vector/purpose';
import type { VectorPreset } from '../vector/types';

export interface ConversionHistoryItem {
  id: string;
  fileName: string;
  createdAt: number;
  preset: VectorPreset;
  purpose: ProductionPurpose;
  qualityScore: number;
  fidelityScore?: number;
  paths: number;
  bytes: number;
}

const STORAGE_KEY = 'vectraa:conversion-history:v1';
const MAX_ITEMS = 20;

export function readConversionHistory(storage: Pick<Storage, 'getItem'> = localStorage): ConversionHistoryItem[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryItem).slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function writeConversionHistory(items: ConversionHistoryItem[], storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

export function addConversionHistoryItem(item: ConversionHistoryItem, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): ConversionHistoryItem[] {
  const next = [item, ...readConversionHistory(storage)].filter((entry, index, list) => list.findIndex((candidate) => candidate.id === entry.id) === index).slice(0, MAX_ITEMS);
  writeConversionHistory(next, storage);
  return next;
}

export function clearConversionHistory(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  storage.removeItem(STORAGE_KEY);
}

export function createHistoryItem(input: Omit<ConversionHistoryItem, 'id' | 'createdAt'> & { createdAt?: number }): ConversionHistoryItem {
  const createdAt = input.createdAt ?? Date.now();
  const id = `${createdAt}-${Math.random().toString(36).slice(2, 9)}`;
  return { ...input, createdAt, id };
}

function isHistoryItem(value: unknown): value is ConversionHistoryItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ConversionHistoryItem>;
  return typeof item.id === 'string' && typeof item.fileName === 'string' && typeof item.createdAt === 'number' && typeof item.qualityScore === 'number' && typeof item.paths === 'number' && typeof item.bytes === 'number';
}
