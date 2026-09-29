/** Move one id within an ordered list and return the new order. */
export function reorder<T>(ids: T[], from: number, to: number): T[] {
  const next = ids.slice();
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/** Contiguous 0-based positions for an ordered list of ids (write these back to `position`). */
export function renumber<T>(ids: T[]): { id: T; position: number }[] {
  return ids.map((id, position) => ({ id, position }));
}
