import { describe, it, expect } from "vitest";
import {
  auc,
  dailyProgress,
  evaluate,
  getSystemComparison,
} from "../../src/ts/test/weak-spot-eval";
import { LoggedKeystroke, LoggedResult } from "../../src/ts/test/weak-spot-log";

/** a log of `words` typed in order; `missed(before, char)` decides misses */
function makeLog(
  words: string[],
  missed: (before: string, char: string) => boolean,
): LoggedKeystroke[] {
  const log: LoggedKeystroke[] = [];
  let t = Date.UTC(2026, 10, 16, 3);
  for (const word of words) {
    for (let i = 0; i < word.length; i++) {
      const before = word.slice(Math.max(0, i - 2), i);
      const char = word[i] as string;
      log.push([t, before, char, 100, missed(word.slice(0, i), char) ? 0 : 1]);
      t += 100;
    }
  }
  return log;
}

describe("weak-spot-eval", () => {
  it("auc: 1 for a perfect ranking, 0 for a reversed one, 0.5 for ties", () => {
    expect(
      auc([
        [1, false],
        [2, false],
        [3, true],
      ]),
    ).toBe(1);
    expect(
      auc([
        [3, false],
        [1, true],
      ]),
    ).toBe(0);
    expect(
      auc([
        [1, false],
        [1, true],
      ]),
    ).toBe(0.5);
  });

  it("scores the context variant above letters only when misses depend on context", () => {
    // "e" is missed after "r" and never after "h"; letter "e" alone can't tell
    const words = Array.from({ length: 400 }, (_, i) =>
      i % 2 === 0 ? "re" : "he",
    );
    const log = makeLog(
      words,
      (before, c) => c === "e" && before.endsWith("r"),
    );
    const scores = new Map(
      evaluate(log, { warmup: 100 }).map((s) => [s.variant, s]),
    );
    const context = scores.get("+ context")?.auc ?? 0;
    const letters = scores.get("letters only")?.auc ?? 1;
    // letters alone still beat guessing ("e" is the missed letter), but only
    // context can tell "re" from "he"
    expect(context).toBeGreaterThan(0.95);
    expect(context - letters).toBeGreaterThan(0.2);
  });

  it("scores the movement variant above letters only for an unseen pair with a weak movement", () => {
    // index-finger jumps (bt, un) are always missed; "ny" - the same jump -
    // shows up rarely and is missed too, other pairs never are
    const words: string[] = [];
    for (let i = 0; i < 300; i++) {
      words.push("bt", "un", "no", "yo", "nd");
      if (i % 10 === 0) words.push("ny");
    }
    const jumps = new Set(["bt", "un", "ny"]);
    const log = makeLog(words, (before, c) => jumps.has(before.slice(-1) + c));
    const scores = new Map(
      evaluate(log, { warmup: 200 }).map((s) => [s.variant, s]),
    );
    expect(scores.get("+ movement")?.auc ?? 0).toBeGreaterThan(
      scores.get("letters only")?.auc ?? 1,
    );
  });

  it("compares systems by miss rate over their rounds", () => {
    const round = (system: string | undefined, acc: number): LoggedResult => ({
      t: 1,
      mode: "words",
      mode2: "25",
      wpm: 80,
      rawWpm: 82,
      acc,
      consistency: 70,
      testDuration: 15,
      language: "english_1k",
      funbox: system === undefined ? [] : ["weakspot"],
      valid: false,
      system,
    });
    const comparison = getSystemComparison([
      round("original", 98),
      round("original", 96),
      round("context", 94),
      round("context", 92),
      round(undefined, 50), // not a weakspot round: ignored
    ]);
    expect(comparison.map((c) => c.system)).toEqual(["context", "original"]);
    expect(comparison[0]?.missRate).toBeCloseTo(7);
    expect(comparison[0]?.missRateError).toBeCloseTo(1);
    expect(comparison[1]?.rounds).toBe(2);
  });

  it("dailyProgress groups by local day", () => {
    const log = makeLog(["ab", "ab"], (_, c) => c === "b");
    const [day] = dailyProgress(log);
    expect(day?.keystrokes).toBe(4);
    expect(day?.missRate).toBe(0.5);
  });
});
