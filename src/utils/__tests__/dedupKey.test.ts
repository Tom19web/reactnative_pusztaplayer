import { dedupKey } from '../dedupKey';

describe('dedupKey', () => {
  it('generates base key for unique items', () => {
    const map = new Map<string, number>();
    expect(dedupKey(map, 'ep', 123, 0)).toBe('ep_123');
  });

  it('appends counter for duplicates', () => {
    const map = new Map<string, number>();
    expect(dedupKey(map, 'ep', 123, 0)).toBe('ep_123');
    expect(dedupKey(map, 'ep', 123, 0)).toBe('ep_123_1');
    expect(dedupKey(map, 'ep', 123, 0)).toBe('ep_123_2');
  });

  it('handles undefined id with fallback index', () => {
    const map = new Map<string, number>();
    expect(dedupKey(map, 'ch', undefined, 42)).toBe('ch_42');
  });

  it('does not share counter across different prefixes', () => {
    const map = new Map<string, number>();
    expect(dedupKey(map, 'ep', 1, 0)).toBe('ep_1');
    expect(dedupKey(map, 'ser', 1, 0)).toBe('ser_1');
  });
});
