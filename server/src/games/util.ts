export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 按分数排名（同分并列），第一 +3、第二 +2、第三 +1 */
export function rankPoints(points: Record<string, number>, ids: string[]) {
  const sorted = [...ids].sort((x, y) => points[y] - points[x]);
  let rank = 0;
  return sorted.map((id, i) => {
    if (i === 0 || points[id] !== points[sorted[i - 1]]) rank = i + 1;
    return { id, points: points[id], rank, bonus: [3, 2, 1][rank - 1] ?? 0 };
  });
}

export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length >= 1 && t.length <= max ? t : null;
}
