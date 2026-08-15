import { describe, expect, it } from 'vitest';
import { RunGuard } from './runGuard';

describe('RunGuard', () => {
  it('keeps only the newest operation current', () => {
    const guard = new RunGuard();
    const first = guard.next();
    const second = guard.next();
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
  });

  it('invalidates an active operation', () => {
    const guard = new RunGuard();
    const token = guard.next();
    guard.invalidate();
    expect(guard.isCurrent(token)).toBe(false);
  });
});
