export function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Expected at least ${index + 1} items, got ${items.length}`);
  return item;
}
