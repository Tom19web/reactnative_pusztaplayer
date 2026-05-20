export function dedupKey(usedKeys: Map<string, number>, prefix: string, id: number | string | undefined, fallbackIdx: number): string {
  const baseKey = `${prefix}_${id ?? fallbackIdx}`;
  const count = usedKeys.get(baseKey) || 0;
  usedKeys.set(baseKey, count + 1);
  return count > 0 ? `${baseKey}_${count}` : baseKey;
}
