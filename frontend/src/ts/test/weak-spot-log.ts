import { z } from "zod";
import { LocalStorageWithSchema } from "../utils/local-storage-with-schema";

// A local log of raw keystrokes and test results, so weak-spot models can be
// compared by replaying what was actually typed (weak-spot-eval.ts) and so
// progress can be tracked without an account. Stays in this browser.

// ~40 bytes per keystroke as JSON: 40k keystrokes is ~1.6 MB of the ~5 MB
// localStorage budget.
const maxKeystrokes = 40000;
const maxResults = 2000;
// keystrokes are buffered and written in batches, not on every keypress
const flushEvery = 500;

/** [time (ms epoch), up to 2 target chars before, expected char, ms since previous input, correct (1/0)] */
const KeystrokeSchema = z.tuple([
  z.number(),
  z.string(),
  z.string(),
  z.number(),
  z.union([z.literal(0), z.literal(1)]),
]);
export type LoggedKeystroke = z.infer<typeof KeystrokeSchema>;

const ResultSchema = z.object({
  t: z.number(),
  mode: z.string(),
  mode2: z.string(),
  wpm: z.number(),
  rawWpm: z.number(),
  acc: z.number(),
  consistency: z.number(),
  testDuration: z.number(),
  language: z.string(),
  funbox: z.array(z.string()),
  /** false for tests Monkeytype marks invalid or failed */
  valid: z.boolean(),
  /** the weakspot word-picking system that ran this round, if weakspot was on */
  system: z.string().optional(),
  /** the patterns a focus drill round drilled */
  focus: z.array(z.string()).optional(),
  /** practice settings in effect (logged from 16 Nov 2026 on) */
  settings: z
    .object({
      paceCaret: z.string(),
      /** custom pace caret speed, when paceCaret is "custom" */
      paceSpeed: z.number().optional(),
      stopOnError: z.string(),
      /** minimum accuracy %, when on */
      minAcc: z.number().optional(),
    })
    .optional(),
});
export type LoggedResult = z.infer<typeof ResultSchema>;

const keystrokesLS = new LocalStorageWithSchema({
  key: "weakspotKeystrokes",
  schema: z.array(KeystrokeSchema),
  fallback: [],
});

const resultsLS = new LocalStorageWithSchema({
  key: "weakspotResults",
  schema: z.array(ResultSchema),
  fallback: [],
});

let pending: LoggedKeystroke[] = [];

export function logKeystroke(keypress: {
  before: string;
  expected: string;
  spacing: number;
  isCorrect: boolean;
}): void {
  pending.push([
    Date.now(),
    Array.from(keypress.before).slice(-2).join(""),
    keypress.expected,
    Math.round(keypress.spacing),
    keypress.isCorrect ? 1 : 0,
  ]);
  if (pending.length >= flushEvery) flushLog();
}

/** Writes buffered keystrokes to storage. */
export function flushLog(): void {
  if (pending.length === 0) return;
  const all = [...keystrokesLS.get(), ...pending];
  pending = [];
  keystrokesLS.set(all.slice(-maxKeystrokes));
}

export function logResult(result: LoggedResult): void {
  flushLog();
  resultsLS.set([...resultsLS.get(), result].slice(-maxResults));
}

export function getLoggedKeystrokes(): LoggedKeystroke[] {
  return [...keystrokesLS.get(), ...pending];
}

export function getLoggedResults(): LoggedResult[] {
  return resultsLS.get();
}

export function clearLog(): void {
  pending = [];
  keystrokesLS.remove();
  resultsLS.remove();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushLog);
}
