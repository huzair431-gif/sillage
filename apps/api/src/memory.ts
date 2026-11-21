import type { MemoryStatus } from '@sillage/shared';

export const INTERVALS = [1, 3, 7, 14, 30, 60, 90, 120];
export const localDay = (date: Date, timezone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
export const dateOnly = (date: string | Date): string =>
  typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10);
export const addDays = (day: string, count: number): Date => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d;
};
export interface Memory {
  status: MemoryStatus;
  successCount: number;
  failureCount: number;
  reliableStreak: number;
  lastReliableSuccessDate: Date | null;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  lastFailureAt: Date | null;
}
export const emptyMemory = (): Memory => ({
  status: 'NEW',
  successCount: 0,
  failureCount: 0,
  reliableStreak: 0,
  lastReliableSuccessDate: null,
  lastReviewedAt: null,
  nextReviewAt: null,
  lastFailureAt: null,
});
export function review(
  memory: Memory,
  result: { correct: boolean; guessed: boolean; reinforcement: boolean },
  now: Date,
  timezone: string,
): Memory {
  // Un renforcement est un entraînement immédiat, il ne modifie pas la preuve durable.
  if (result.reinforcement) return memory;
  // Une clôture d'examen tardive enrichit l'historique sans effacer un rappel plus récent.
  if (memory.lastReviewedAt && memory.lastReviewedAt > now) {
    return {
      ...memory,
      successCount: memory.successCount + (result.correct ? 1 : 0),
      failureCount: memory.failureCount + (result.correct ? 0 : 1),
    };
  }
  const next = { ...memory, lastReviewedAt: now };
  const today = localDay(now, timezone);
  if (result.correct) next.successCount++;
  else {
    next.failureCount++;
    next.lastFailureAt = now;
  }
  if (!result.correct || result.guessed) {
    next.status = 'FRAGILE';
    next.reliableStreak = 0;
    next.lastReliableSuccessDate = null;
    next.nextReviewAt = addDays(today, 1);
    return next;
  }
  // Les réussites du même jour ou avant l'échéance ne raccourcissent pas les intervalles.
  const eligible =
    (!memory.lastReliableSuccessDate || dateOnly(memory.lastReliableSuccessDate) !== today) &&
    (!memory.nextReviewAt || dateOnly(memory.nextReviewAt) <= today);
  if (eligible) {
    next.reliableStreak++;
    next.lastReliableSuccessDate = addDays(today, 0);
    next.nextReviewAt = addDays(
      today,
      INTERVALS[Math.min(next.reliableStreak - 1, INTERVALS.length - 1)]!,
    );
  }
  next.status =
    next.reliableStreak >= 3
      ? 'MASTERED'
      : next.reliableStreak > 0
        ? 'CONSOLIDATING'
        : memory.status;
  return next;
}
export function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
export interface Candidate {
  id: string;
  notion: string;
  memory: Pick<Memory, 'status' | 'nextReviewAt' | 'lastFailureAt'> | null;
}
export function selectQuestions<T extends Candidate>(
  all: T[],
  count: number,
  mode: string,
  today: string,
  random: () => number,
): T[] {
  const selected: T[] = [];
  const used = new Set<string>();
  const randomized = shuffle(all, random);
  const take = (items: T[], n: number) => {
    for (const q of items) {
      if (n <= 0 || selected.length >= count) break;
      if (used.has(q.id)) continue;
      selected.push(q);
      used.add(q.id);
      n--;
    }
  };
  const due = randomized
    .filter((q) => q.memory?.nextReviewAt && dateOnly(q.memory.nextReviewAt) <= today)
    .sort((a, b) =>
      dateOnly(a.memory!.nextReviewAt!).localeCompare(dateOnly(b.memory!.nextReviewAt!)),
    );
  const weakNotions = new Set(
    all.filter((q) => q.memory?.status === 'FRAGILE').map((q) => q.notion),
  );
  const fragile = randomized
    .filter((q) => q.memory?.status === 'FRAGILE')
    .sort(
      (a, b) =>
        (b.memory?.lastFailureAt?.getTime() ?? 0) - (a.memory?.lastFailureAt?.getTime() ?? 0),
    );
  const fresh = randomized.filter((q) => !q.memory || q.memory.status === 'NEW');
  if (mode === 'REVISION') {
    take(due, Math.ceil(count * 0.5));
    take(fragile, Math.ceil(count * 0.25));
    take(fresh, Math.ceil(count * 0.2));
    take(
      randomized.filter((q) => q.memory?.status === 'MASTERED'),
      Math.max(1, Math.floor(count * 0.05)),
    );
    take(
      [...due, ...fragile, ...randomized.filter((q) => weakNotions.has(q.notion)), ...randomized],
      count,
    );
  } else if (mode === 'DISCOVERY') {
    take(fresh, count);
    take(randomized, count);
  } else take(randomized, count);
  // Mélange des notions tout en gardant les catégories prioritaires sélectionnées.
  const mixed = shuffle(selected, random);
  for (let i = 1; i < mixed.length - 1; i++) {
    if (mixed[i]!.notion === mixed[i - 1]!.notion) {
      const j = mixed.findIndex((q, k) => k > i && q.notion !== mixed[i - 1]!.notion);
      if (j > i) [mixed[i], mixed[j]] = [mixed[j]!, mixed[i]!];
    }
  }
  return mixed;
}
