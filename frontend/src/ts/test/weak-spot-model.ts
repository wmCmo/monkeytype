import { motionClass } from "./weak-spot-motion";

// The weak-spot model: what it learns from each keypress and how it estimates
// the cost of typing a character. No storage or timers here, so the replay in
// weak-spot-eval.ts can run several variants side by side on the same log.
//
// Weak spots are learned per target character AND per context: the same
// letter can be easy after one letter and hard after another ("e" after "h"
// vs "e" after "r"). Each keypress updates three scores for the character the
// user was supposed to type: on its own, after the previous target letter
// (bigram), and after the previous two (trigram). Word start counts as a
// space, so "t" at the start of a word is its own context.
//
// Each keypress also updates the score of the finger movement that led to it
// (see weak-spot-motion.ts) and an overall average. A movement that is harder
// than average raises the estimate of every pair that uses it, so "ny" counts
// as weak before it has been typed much if "bt" and "un" - the same index
// finger jump - are weak.

// Changes how quickly it 'learns' scores - very roughly the score for a key
// is based on last perKeyCount occurrences. Make it smaller to adjust faster.
const perKeyCount = 50;

// Movements and the overall average see every keypress, so they can average
// over more of them and still follow recent progress.
export const perMotionCount = 200;

// How many observations a movement needs before its offset counts in full.
const motionStrength = 20;
export const OVERALL = "*";

// Score penalty (in milliseconds) for getting a letter wrong.
export const incorrectPenalty = 5000;

// How many observations a context needs before it outweighs the shorter
// context it backs off to. With 5, a bigram seen 5 times counts half.
const backoffStrength = 5;

const WORD_START = " ";

export type Order = 1 | 2 | 3;
/** [key, average, count] */
export type StoredEntry = [string, number, number];

export type ModelOptions = {
  /** learn pairs and triples, not only single letters */
  context: boolean;
  /** with context: longest context used, 2 = pairs only, 3 = pairs and triples (default) */
  maxOrder?: 2 | 3;
  /** adjust for the finger movement into each letter */
  motion: boolean;
  /**
   * how a word's characters combine into its score: its weakest spot (the
   * default), or the average (Monkeytype's original weakspot)
   */
  aggregate?: "max" | "mean";
};

export class Score {
  public average: number;
  public count: number;
  constructor(average = 0.0, count = 0) {
    this.average = average;
    this.count = count;
  }

  update(score: number, cap = perKeyCount): void {
    if (this.count < cap) {
      this.count++;
    }
    const adjustRate = 1.0 / this.count;
    // Keep an exponential moving average of the score over time.
    this.average = score * adjustRate + this.average * (1 - adjustRate);
  }
}

/**
 * The contexts of the character at `index` in `text`: the character alone,
 * with the one before it, and with the two before it. Positions before the
 * word count as a word start, and a trigram needs at least one real letter
 * before the character.
 */
function contextKeys(
  chars: string[],
  index: number,
): [string, string, string | undefined] {
  const c = chars[index] as string;
  const prev1 = chars[index - 1] ?? WORD_START;
  const prev2 = index >= 1 ? (chars[index - 2] ?? WORD_START) : undefined;
  return [c, prev1 + c, prev2 === undefined ? undefined : prev2 + prev1 + c];
}

/** Movement scores rebuilt from stored letters and pairs. */
export function seedMotionScores(
  letters: StoredEntry[],
  pairs: StoredEntry[],
): StoredEntry[] {
  const totals = new Map<string, { sum: number; count: number }>();
  const add = (key: string, average: number, count: number): void => {
    const total = totals.get(key) ?? { sum: 0, count: 0 };
    total.sum += average * count;
    total.count += count;
    totals.set(key, total);
  };
  for (const [, average, count] of letters) add(OVERALL, average, count);
  for (const [key, average, count] of pairs) {
    const [from, to] = Array.from(key);
    if (from === undefined || to === undefined) continue;
    const motion = motionClass(from, to);
    if (motion !== undefined) add(motion, average, count);
  }
  return [...totals].map(([key, { sum, count }]) => [
    key,
    count === 0 ? 0 : sum / count,
    Math.min(count, perMotionCount),
  ]);
}

function getOrCreate(map: Map<string, Score>, key: string): Score {
  let entry = map.get(key);
  if (entry === undefined) {
    entry = new Score();
    map.set(key, entry);
  }
  return entry;
}

export class WeakSpotModel {
  // One map per context length. Separate maps (rather than one map keyed by
  // the joined string) keep multi-code-unit characters from colliding.
  readonly scores: Record<Order, Map<string, Score>> = {
    1: new Map(),
    2: new Map(),
    3: new Map(),
  };
  // movement classes, plus OVERALL for every keypress
  readonly motionScores = new Map<string, Score>();

  readonly options: ModelOptions;

  constructor(options: ModelOptions = { context: true, motion: true }) {
    this.options = options;
  }

  update(keypress: {
    /** the target word's characters typed so far, by position */
    before: string;
    /** the character the user was supposed to type */
    expected: string;
    /** ms since the previous input */
    spacing: number;
    isCorrect: boolean;
  }): void {
    const score =
      keypress.spacing + (keypress.isCorrect ? 0 : incorrectPenalty);
    const chars = [...Array.from(keypress.before), keypress.expected];
    contextKeys(chars, chars.length - 1).forEach((key, i) => {
      if (key === undefined) return;
      getOrCreate(this.scores[(i + 1) as Order], key).update(score);
    });
    const prev = chars[chars.length - 2];
    const motion =
      prev === undefined ? undefined : motionClass(prev, keypress.expected);
    for (const key of motion === undefined ? [OVERALL] : [OVERALL, motion]) {
      getOrCreate(this.motionScores, key).update(score, perMotionCount);
    }
  }

  /**
   * How much harder (positive) or easier than an average keypress the
   * movement into the character at `index` is, shrunk toward 0 while it has
   * little data.
   */
  private motionOffset(chars: string[], index: number): number {
    const prev = chars[index - 1];
    if (prev === undefined) return 0;
    const motion = motionClass(prev, chars[index] as string);
    if (motion === undefined) return 0;
    const motionScore = this.motionScores.get(motion);
    const overall = this.motionScores.get(OVERALL);
    if (motionScore === undefined || overall === undefined) return 0;
    const weight = motionScore.count / (motionScore.count + motionStrength);
    return weight * (motionScore.average - overall.average);
  }

  /**
   * Estimated cost of typing the character at `index` in its context, or
   * undefined if the character itself has never been typed.
   */
  estimate(
    chars: string[],
    index: number,
    options: ModelOptions = this.options,
  ): number | undefined {
    const [uni, bi, tri] = contextKeys(chars, index);
    const uniScore = this.scores[1].get(uni);
    if (uniScore === undefined) return undefined;
    // the letter, adjusted for how hard the movement into it is
    const letter = options.motion
      ? Math.max(0, uniScore.average + this.motionOffset(chars, index))
      : uniScore.average;
    if (!options.context) return letter;
    const biEstimate = backoff(this.scores[2].get(bi), letter);
    if (tri === undefined || options.maxOrder === 2) return biEstimate;
    return backoff(this.scores[3].get(tri), biEstimate);
  }

  /** Estimate for the next keypress, before it happens. */
  predict(before: string, expected: string): number | undefined {
    const chars = [...Array.from(before), expected];
    return this.estimate(chars, chars.length - 1);
  }

  /**
   * A word's score is its weakest spot: the costliest character in its
   * context. Averaging instead would let one shaky letter make a short word
   * ("a", "it") outrank a long word that contains the weak sequence.
   * `options` scores with a different variant over the same learned data.
   */
  score(word: string, options: ModelOptions = this.options): number {
    const chars = Array.from(word);
    let worst = 0.0;
    let total = 0.0;
    let counted = 0;
    for (let i = 0; i < chars.length; i++) {
      const value = this.estimate(chars, i, options);
      if (value === undefined) continue;
      if (value > worst) worst = value;
      total += value;
      counted++;
    }
    if (options.aggregate === "mean") {
      return counted === 0 ? 0.0 : total / counted;
    }
    return worst;
  }

  clear(): void {
    for (const order of [1, 2, 3] as const) this.scores[order].clear();
    this.motionScores.clear();
  }
}

/**
 * Blends a context's score toward the shorter context's estimate until the
 * context has been seen often enough to stand on its own.
 */
function backoff(score: Score | undefined, fallback: number): number {
  if (score === undefined) return fallback;
  return (
    (score.count * score.average + backoffStrength * fallback) /
    (score.count + backoffStrength)
  );
}
