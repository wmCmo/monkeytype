import { LoggedKeystroke, LoggedResult } from "./weak-spot-log";
import { ModelOptions, WeakSpotModel } from "./weak-spot-model";

// Compares weak-spot model variants on a keystroke log by replaying it in
// order: before each keystroke every variant predicts its cost from what it
// has learned so far, then learns from it. A variant that ranks the keystrokes
// that were actually missed above the ones that weren't predicts weak spots
// better. Nothing is trained on the keystroke it is judged on.

export const variants: Record<string, ModelOptions> = {
  "letters only": { context: false, motion: false },
  "+ movement": { context: false, motion: true },
  "+ context": { context: true, motion: false },
  "+ context + movement": { context: true, motion: true },
};

export type VariantScore = {
  variant: string;
  /** keystrokes judged (after warm-up, with a prediction) */
  judged: number;
  misses: number;
  /**
   * Chance that a random missed keystroke was predicted costlier than a
   * random clean one. 0.5 = no better than guessing, 1 = perfect.
   */
  auc: number;
  /** share of all misses that fell in the 10% of keystrokes predicted costliest */
  missesInTop10: number;
};

export function evaluate(
  keystrokes: LoggedKeystroke[],
  options: { warmup?: number; variants?: Record<string, ModelOptions> } = {},
): VariantScore[] {
  const warmup = options.warmup ?? 500;
  const toRun = options.variants ?? variants;
  return Object.entries(toRun).map(([variant, modelOptions]) => {
    const model = new WeakSpotModel(modelOptions);
    const predictions: [number, boolean][] = [];
    keystrokes.forEach(([, before, expected, spacing, correct], i) => {
      const predicted = model.predict(before, expected);
      if (i >= warmup && predicted !== undefined) {
        predictions.push([predicted, correct === 0]);
      }
      model.update({ before, expected, spacing, isCorrect: correct === 1 });
    });
    return {
      variant,
      judged: predictions.length,
      misses: predictions.filter(([, missed]) => missed).length,
      auc: auc(predictions),
      missesInTop10: missesInTop(predictions, 0.1),
    };
  });
}

/** Mann-Whitney AUC, ties counted as half. */
export function auc(predictions: [number, boolean][]): number {
  const sorted = [...predictions].sort((a, b) => a[0] - b[0]);
  let positives = 0;
  let rankSum = 0;
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j]?.[0] === sorted[i]?.[0]) j++;
    const averageRank = (i + 1 + j) / 2; // ranks i+1..j
    for (let k = i; k < j; k++) {
      if (sorted[k]?.[1] === true) {
        positives++;
        rankSum += averageRank;
      }
    }
    i = j;
  }
  const negatives = sorted.length - positives;
  if (positives === 0 || negatives === 0) return 0.5;
  return (
    (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives)
  );
}

function missesInTop(predictions: [number, boolean][], share: number): number {
  const misses = predictions.filter(([, missed]) => missed).length;
  if (misses === 0) return 0;
  const top = [...predictions]
    .sort((a, b) => b[0] - a[0])
    .slice(0, Math.ceil(predictions.length * share));
  return top.filter(([, missed]) => missed).length / misses;
}

export type SystemComparison = {
  system: string;
  rounds: number;
  /** mean of 100 - accuracy over the rounds, in % */
  missRate: number;
  /** standard error of missRate: differences smaller than ~2x this are noise */
  missRateError: number;
  wpm: number;
};

/**
 * How often each weakspot word-picking system made you miss, from the rounds
 * where it was picked at random. The system whose words make you miss most is
 * the one finding your weak spots - as long as the systems ran interleaved,
 * on the same language and settings.
 */
export function getSystemComparison(
  results: LoggedResult[],
): SystemComparison[] {
  const bySystem = new Map<string, LoggedResult[]>();
  for (const r of results) {
    // failed rounds count too: failing a round is the strongest signal
    if (r.system === undefined || r.testDuration <= 0) continue;
    const list = bySystem.get(r.system);
    if (list === undefined) bySystem.set(r.system, [r]);
    else list.push(r);
  }
  return [...bySystem]
    .map(([system, rounds]) => {
      const misses = rounds.map((r) => 100 - r.acc);
      const mean = misses.reduce((a, b) => a + b, 0) / misses.length;
      const variance =
        misses.length < 2
          ? 0
          : misses.reduce((a, b) => a + (b - mean) ** 2, 0) /
            (misses.length - 1);
      return {
        system,
        rounds: rounds.length,
        missRate: mean,
        missRateError: Math.sqrt(variance / misses.length),
        wpm: rounds.reduce((a, r) => a + r.wpm, 0) / rounds.length,
      };
    })
    .sort((a, b) => b.missRate - a.missRate);
}

/** Miss rate and median keystroke time per day, oldest first. */
export function dailyProgress(
  keystrokes: LoggedKeystroke[],
): { day: string; keystrokes: number; missRate: number; medianMs: number }[] {
  const days = new Map<string, LoggedKeystroke[]>();
  for (const k of keystrokes) {
    const day = new Date(k[0]).toLocaleDateString("sv"); // YYYY-MM-DD, local
    const list = days.get(day);
    if (list === undefined) days.set(day, [k]);
    else list.push(k);
  }
  return [...days].map(([day, ks]) => {
    const times = ks.map((k) => k[3]).sort((a, b) => a - b);
    return {
      day,
      keystrokes: ks.length,
      missRate: ks.filter((k) => k[4] === 0).length / ks.length,
      medianMs: times[Math.floor(times.length / 2)] ?? 0,
    };
  });
}
