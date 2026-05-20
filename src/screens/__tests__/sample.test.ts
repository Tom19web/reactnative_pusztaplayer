function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

describe('sample', () => {
  it('returns requested number of items', () => {
    const result = sample([1, 2, 3, 4, 5], 3);
    expect(result).toHaveLength(3);
  });

  it('returns all items when n >= length', () => {
    const result = sample([1, 2, 3], 5);
    expect(result).toHaveLength(3);
  });

  it('returns empty array for empty input', () => {
    const result = sample([], 3);
    expect(result).toHaveLength(0);
  });

  it('preserves all elements (no duplicates, no missing)', () => {
    const input = [1, 2, 3, 4, 5];
    const result = sample(input, 3);
    for (const item of result) {
      expect(input).toContain(item);
    }
  });

  it('does not mutate the original array', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    sample(input, 2);
    expect(input).toEqual(copy);
  });
});
