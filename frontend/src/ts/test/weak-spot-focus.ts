import type { LoggedKeystroke } from "./weak-spot-log";
import { PatternTrend, patternTrends, worstSequences } from "./weak-spot-eval";
import type { StoredEntry } from "./weak-spot-model";

// Focus drill: the few letter patterns that are not improving, practised in
// a word list of their own, slowly. Weakspot spreads its words over every
// weak spot; this is for the stubborn ones it has not fixed.

/** Patterns a focus drill picks at most. */
export const maxFocusPatterns = 4;

/**
 * The patterns to focus on: pairs and single letters that are not improving
 * and still missed at least 8% of the time, ranked by late miss rate weighted
 * by how many attempts back it up. A letter is skipped when a chosen pair
 * already contains it. Without enough history: the weakest stored pairs.
 */
export function pickFocusPatterns(
  keystrokes: LoggedKeystroke[],
  storedPairs: StoredEntry[],
): string[] {
  const weight = (t: PatternTrend): number => t.late * Math.log(t.attempts);
  const stuck = [
    ...patternTrends(keystrokes, 2),
    ...patternTrends(keystrokes, 1),
  ]
    .filter((t) => t.status !== "improving" && t.late >= 0.08)
    .sort((a, b) => weight(b) - weight(a));

  const picked: string[] = [];
  for (const { sequence } of stuck) {
    if (picked.length >= maxFocusPatterns) break;
    const isLetter = Array.from(sequence).length === 1;
    if (isLetter && picked.some((p) => p.includes(sequence))) continue;
    picked.push(sequence);
  }
  if (picked.length > 0) return picked;
  return worstSequences(storedPairs, { limit: maxFocusPatterns }).map(
    (s) => s.sequence,
  );
}

// Monkeytype's word lists run most common first: taking the first few words
// per pattern keeps the drill on words you know ("doubt", not "obtund")
const commonWordsPerPattern = 12;

/**
 * A word list for the patterns: plain lowercase words of 3-12 letters
 * containing one of them - the most common few per pattern - taken in turn
 * from each pattern so every pattern gets about the same share, and repeated
 * when a pattern has few words. Patterns with no words at all are left out.
 * `words` is expected most common first, as Monkeytype's lists are.
 */
export function pickFocusWords(
  words: string[],
  patterns: string[],
  count: number,
  random: () => number = Math.random,
): string[] {
  const usable = words.filter(
    (w) => w.length >= 3 && w.length <= 12 && /^[a-z]+$/.test(w),
  );
  const pools = patterns
    .map((p) =>
      shuffle(
        usable.filter((w) => w.includes(p)).slice(0, commonWordsPerPattern),
        random,
      ),
    )
    .filter((pool) => pool.length > 0);
  if (pools.length === 0) return [];
  const picked: string[] = [];
  for (let i = 0; picked.length < count; i++) {
    const pool = pools[i % pools.length] as string[];
    picked.push(pool[Math.floor(i / pools.length) % pool.length] as string);
  }
  return shuffle(picked, random);
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
