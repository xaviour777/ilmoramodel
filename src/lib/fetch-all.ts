// Supabase sends at most 1,000 rows per request. This reads every page of a query.
// `page(from, to)` must build a fresh query with .range(from, to) and a stable .order(...).
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, max = 100000): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; from < max; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}
