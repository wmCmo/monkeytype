import type { LoggedKeystroke, LoggedResult } from "./weak-spot-log";
import {
  ModelOptions,
  StoredEntry,
  WeakSpotModel,
  incorrectPenalty,
} from "./weak-spot-model";

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
  keystrokes: number;
  misses: number;
  /** misses per keystroke over all the system's rounds, in % */
  missRate: number;
  /**
   * standard error of missRate, treating each round as one sample (keystrokes
   * within a round aren't independent): differences smaller than ~2x this
   * are noise
   */
  missRateError: number;
};

// a keystroke can land a little before the timer starts
const roundStartSlackMs = 500;

/**
 * How often each weakspot word-picking system made you miss, from the rounds
 * where it was picked at random. The system whose words make you miss most is
 * the one finding your weak spots - as long as the systems ran interleaved,
 * on the same language and settings.
 *
 * Misses are counted per keystroke across all of a system's rounds, so a
 * round that failed after two keystrokes counts for two keystrokes, not as a
 * whole round. A round's keystrokes are the logged ones between its start
 * (end time minus its duration) and its end.
 */
export function getSystemComparison(
  results: LoggedResult[],
  keystrokes: LoggedKeystroke[],
): SystemComparison[] {
  return compareGroups(results, keystrokes, (r) => r.system).map(
    ({ group, ...rest }) => ({ system: group, ...rest }),
  );
}

export type GroupComparison = Omit<SystemComparison, "system"> & {
  group: string;
  /** average wpm over the group's rounds */
  wpm: number;
};

/**
 * Rounds grouped by `groupOf` (undefined = left out), compared by misses per
 * keystroke as in getSystemComparison. Sorted by miss rate, highest first.
 */
export function compareGroups(
  results: LoggedResult[],
  keystrokes: LoggedKeystroke[],
  groupOf: (result: LoggedResult) => string | undefined,
): GroupComparison[] {
  type Round = { keys: number; misses: number; wpm: number };
  const byGroup = new Map<string, Round[]>();
  for (const r of results) {
    // failed rounds count too
    const group = groupOf(r);
    if (group === undefined) continue;
    const start = r.t - r.testDuration * 1000 - roundStartSlackMs;
    let keys = 0;
    let misses = 0;
    for (const k of keystrokes) {
      if (k[0] < start || k[0] > r.t) continue;
      keys++;
      if (k[4] === 0) misses++;
    }
    if (keys === 0) continue;
    const round = { keys, misses, wpm: r.wpm };
    const list = byGroup.get(group);
    if (list === undefined) byGroup.set(group, [round]);
    else list.push(round);
  }
  return [...byGroup]
    .map(([group, rounds]) => {
      const keys = rounds.reduce((a, r) => a + r.keys, 0);
      const misses = rounds.reduce((a, r) => a + r.misses, 0);
      const rate = misses / keys;
      // cluster-robust standard error of a ratio, one cluster per round
      const k = rounds.length;
      const spread = rounds.reduce(
        (a, r) => a + (r.misses - rate * r.keys) ** 2,
        0,
      );
      const error = k < 2 ? 0 : Math.sqrt((spread * k) / (k - 1)) / keys;
      return {
        group,
        rounds: k,
        keystrokes: keys,
        misses,
        missRate: rate * 100,
        missRateError: error * 100,
        wpm: rounds.reduce((a, r) => a + r.wpm, 0) / k,
      };
    })
    .sort((a, b) => b.missRate - a.missRate);
}

/**
 * A weakspot round's pace caret as a group name ("caret 90", "caret off",
 * "caret pb"), or undefined for other tests and rounds logged before
 * settings were recorded.
 */
export function paceCaretGroup(result: LoggedResult): string | undefined {
  if (result.system === undefined || result.settings === undefined) {
    return undefined;
  }
  const { paceCaret, paceSpeed } = result.settings;
  return paceCaret === "custom" && paceSpeed !== undefined
    ? `caret ${paceSpeed}`
    : `caret ${paceCaret}`;
}

export type WordStat = {
  word: string;
  /** times the word was typed to the end */
  typed: number;
  misses: number;
  /** the letter missed, after the one before it ("st" = the "t" after "s"); "␣" = the space */
  missedAt: Record<string, number>;
};

/**
 * Words rebuilt from the keystroke log: a word starts at a keystroke with no
 * letters before it and ends at a correct space. A retry of the same letter
 * (stop on error) counts its miss but isn't added to the word twice. Words
 * cut off by a restart are dropped. Approximate: a missed space can merge two
 * words into one.
 */
export function wordStats(keystrokes: LoggedKeystroke[]): WordStat[] {
  const stats = new Map<string, WordStat>();
  type Current = { word: string; misses: number; missedAt: string[] };
  let current: Current | undefined;
  let retryKey: string | undefined;
  const finish = (complete: boolean): void => {
    if (complete && current !== undefined && current.word.length > 0) {
      const stat = stats.get(current.word) ?? {
        word: current.word,
        typed: 0,
        misses: 0,
        missedAt: {},
      };
      stat.typed++;
      stat.misses += current.misses;
      for (const at of current.missedAt) {
        stat.missedAt[at] = (stat.missedAt[at] ?? 0) + 1;
      }
      stats.set(current.word, stat);
    }
    current = undefined;
    retryKey = undefined;
  };
  for (const [, before, expected, , correct] of keystrokes) {
    const key = `${before}|${expected}`;
    const isRetry = retryKey === key;
    if (before === "" && expected !== " " && !isRetry) {
      finish(false);
      current = { word: "", misses: 0, missedAt: [] };
    }
    current ??= { word: "", misses: 0, missedAt: [] };
    if (expected === " ") {
      if (correct === 1) {
        finish(true);
      } else {
        current.misses++;
        current.missedAt.push("␣");
        retryKey = key;
      }
      continue;
    }
    if (correct === 0) {
      current.misses++;
      current.missedAt.push(`${before.slice(-1)}${expected}`);
      retryKey = key;
    } else {
      retryKey = undefined;
    }
    if (!isRetry) current.word += expected;
  }
  return [...stats.values()];
}

export type WeakSequence = {
  sequence: string;
  /** current score: average ms, plus 5000 per miss */
  score: number;
  count: number;
  /** rough share of attempts missed, from the score */
  missRate: number;
};

/**
 * The worst learned sequences of one length (2 = pairs, 3 = triples) from
 * stored scores, ignoring ones seen fewer than `minCount` times and ones that
 * start at a word boundary.
 */
export function worstSequences(
  entries: StoredEntry[],
  options: { minCount?: number; limit?: number } = {},
): WeakSequence[] {
  const minCount = options.minCount ?? 5;
  return entries
    .filter(([key, , count]) => count >= minCount && !key.includes(" "))
    .sort((a, b) => b[1] - a[1])
    .slice(0, options.limit ?? 10)
    .map(([sequence, score, count]) => ({
      sequence,
      score,
      count,
      missRate: Math.max(0, Math.min(1, (score - 120) / incorrectPenalty)),
    }));
}

export type RoundTarget = {
  sequence: string;
  /** times the round asked for this pair (retries after a miss included) */
  attempts: number;
  misses: number;
};

/**
 * Which of the weakest pairs a round's keystrokes hit, and how they went:
 * the pairs in `weakPairs` that came up at least twice, most frequent first.
 */
export function roundTargets(
  roundKeystrokes: LoggedKeystroke[],
  weakPairs: string[],
  limit = 5,
): RoundTarget[] {
  const wanted = new Set(weakPairs);
  const targets = new Map<string, RoundTarget>();
  for (const [, before, expected, , correct] of roundKeystrokes) {
    const pair = `${before.slice(-1)}${expected}`;
    if (!wanted.has(pair)) continue;
    const target = targets.get(pair) ?? {
      sequence: pair,
      attempts: 0,
      misses: 0,
    };
    target.attempts++;
    if (correct === 0) target.misses++;
    targets.set(pair, target);
  }
  return [...targets.values()]
    .filter((t) => t.attempts >= 2)
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, limit);
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
