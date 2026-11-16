import { z } from "zod";
import { getLiveCachedMsSinceLastInputEvent } from "./events/live-cache";
import { Wordset } from "./wordset";
import { LocalStorageWithSchema } from "../utils/local-storage-with-schema";
import {
  ModelOptions,
  Order,
  Score,
  StoredEntry,
  WeakSpotModel,
  seedMotionScores,
} from "./weak-spot-model";
import { logKeystroke } from "./weak-spot-log";

// The weakspot funbox: learns from every keypress (weak-spot-model.ts), keeps
// what it learned across reloads, and picks words that hit the weakest spots.
// Every keypress also goes to the local keystroke log (weak-spot-log.ts).

// Choose the highest scoring word from this many random words. Higher values
// target weak sequences harder, lower values give more variety.
const wordSamples = 50;

// A word picked within the last this-many picks is skipped, so a test doesn't
// fill up with the same few words - unless every fresh candidate is far less
// weak (below this share of the best repeat's score), as in a tiny wordset.
const recentWordsToSkip = 8;
const freshWordMinShare = 0.5;

// Scores survive reloads. Trigrams can grow without bound on long use, so
// the store is pruned to the most-observed keys when it gets this big.
const maxStoredKeys = 20000;
const saveDelayMs = 2000;

const model = new WeakSpotModel();

const StoredEntriesSchema = z.array(
  z.tuple([z.string(), z.number(), z.number().int().min(0)]),
);
const StoredScoresSchema = z.object({
  v: z.literal(2),
  1: StoredEntriesSchema,
  2: StoredEntriesSchema,
  3: StoredEntriesSchema,
  m: StoredEntriesSchema,
});
type StoredScores = z.infer<typeof StoredScoresSchema>;

const emptyStore = (): StoredScores => ({ v: 2, 1: [], 2: [], 3: [], m: [] });

const StoredScoresV1Schema = z.object({
  v: z.literal(1),
  1: StoredEntriesSchema,
  2: StoredEntriesSchema,
  3: StoredEntriesSchema,
});

const weakspotLS = new LocalStorageWithSchema({
  key: "weakspotScores",
  schema: StoredScoresSchema,
  fallback: emptyStore(),
  // v1 had no movement scores: keep the letter scores and seed the movements
  // from the stored pairs, so the movement layer works from the first load
  migrate: (value) => {
    const v1 = StoredScoresV1Schema.safeParse(value);
    if (!v1.success) return emptyStore();
    return { ...v1.data, v: 2, m: seedMotionScores(v1.data[1], v1.data[2]) };
  },
});

let loaded = false;
let saveTimeout: ReturnType<typeof setTimeout> | undefined;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  const stored = weakspotLS.get();
  for (const order of [1, 2, 3] as const) {
    for (const [key, average, count] of stored[order]) {
      model.scores[order].set(key, new Score(average, count));
    }
  }
  // pairs but no movements: seed them from the pairs (as the v1 upgrade does)
  const motions =
    stored.m.length === 0 && stored[2].length > 0
      ? seedMotionScores(stored[1], stored[2])
      : stored.m;
  for (const [key, average, count] of motions) {
    model.motionScores.set(key, new Score(average, count));
  }
}

/** Current scores in the stored format, for syncing and inspection. */
export function getScoresSnapshot(): StoredScores {
  ensureLoaded();
  return buildStore();
}

function save(): void {
  weakspotLS.set(buildStore());
}

function buildStore(): StoredScores {
  const entries: [Order, string, Score][] = [];
  for (const order of [1, 2, 3] as const) {
    for (const [key, score] of model.scores[order]) {
      entries.push([order, key, score]);
    }
  }
  // unigrams are always kept; contexts are pruned least-observed first
  if (entries.length > maxStoredKeys) {
    entries.sort((a, b) => {
      if (a[0] === 1 || b[0] === 1) return a[0] - b[0];
      return b[2].count - a[2].count;
    });
    for (const [order, key] of entries.splice(maxStoredKeys)) {
      model.scores[order].delete(key);
    }
  }
  const store = emptyStore();
  for (const [order, key, score] of entries) {
    store[order].push([key, score.average, score.count]);
  }
  for (const [key, score] of model.motionScores) {
    store.m.push([key, score.average, score.count]);
  }
  return store;
}

function scheduleSave(): void {
  if (saveTimeout !== undefined) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveTimeout = undefined;
    save();
  }, saveDelayMs);
}

export function updateScore(options: {
  /** the target word's characters typed so far, by position (not what the user typed) */
  before: string;
  /** the character the user was supposed to type */
  expected: string;
  isCorrect: boolean;
}): void {
  const spacing = getLiveCachedMsSinceLastInputEvent();
  if (spacing === null) {
    return;
  }
  ensureLoaded();
  const keypress = { ...options, spacing };
  model.update(keypress);
  logKeystroke(keypress);
  scheduleSave();
}

/** The weakest spot in `word`, in ms (see WeakSpotModel.score). */
export function score(word: string): number {
  ensureLoaded();
  return model.score(word);
}

// Word-picking systems compared head to head: each weakspot round picks one at
// random, the result log records which, and getSystemComparison() in
// weak-spot-eval.ts compares how often each made you miss. All of them score
// with the same learned data; only how they read it differs.
//
// Retired: "original" (Monkeytype's original weakspot - single letters, word =
// average letter, { context: false, motion: false, aggregate: "mean" }). In
// the comparison it made its user miss least (3.3% vs 4.3-4.7% per keystroke
// over ~3,500 keystrokes) by favouring short easy words: rounds of ~115
// keystrokes against ~160-180 for the others.
export const selectionSystems: Record<string, ModelOptions> = {
  // pairs and triples, word = weakest spot
  context: { context: true, motion: false },
  // ... plus finger movement
  "context+movement": { context: true, motion: true },
};

let currentSystem = "context+movement";

/** The system picking this round's words. */
export function getCurrentSystem(): string {
  return currentSystem;
}

function pickSystem(): void {
  const names = Object.keys(selectionSystems);
  currentSystem =
    names[Math.floor(Math.random() * names.length)] ?? currentSystem;
}

const recentWords: string[] = [];

export function getWord(wordset: Wordset, wordIndex?: number): string {
  ensureLoaded();
  // the first word of a test starts a round with a fresh random system
  if (wordIndex === 0) pickSystem();
  const options = selectionSystems[currentSystem];
  let best: { word: string; score: number } | undefined;
  let bestRecent: { word: string; score: number } | undefined;
  for (let i = 0; i < wordSamples; i++) {
    const word = wordset.randomWord("normal");
    const candidate = { word, score: model.score(word, options) };
    if (recentWords.includes(word)) {
      if (bestRecent === undefined || candidate.score > bestRecent.score) {
        bestRecent = candidate;
      }
    } else if (best === undefined || candidate.score > best.score) {
      best = candidate;
    }
  }
  const useRepeat =
    bestRecent !== undefined &&
    (best === undefined || best.score < bestRecent.score * freshWordMinShare);
  const picked = (useRepeat ? bestRecent : best)?.word ?? "";
  recentWords.push(picked);
  if (recentWords.length > recentWordsToSkip) recentWords.shift();
  return picked;
}

/** Learned movement scores, for inspecting progress: [class, average ms, count]. */
export function getMotionScores(): StoredEntry[] {
  ensureLoaded();
  return [...model.motionScores].map(([key, s]) => [key, s.average, s.count]);
}

/** Forgets every learned score, in memory and in storage. */
export function resetScores(): void {
  model.clear();
  if (saveTimeout !== undefined) clearTimeout(saveTimeout);
  saveTimeout = undefined;
  weakspotLS.remove();
  loaded = true;
}

/** Writes pending scores now instead of after the save delay. */
export function flushScores(): void {
  if (saveTimeout === undefined) return;
  clearTimeout(saveTimeout);
  saveTimeout = undefined;
  save();
}
