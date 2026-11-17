import { describe, it, expect } from "vitest";
import {
  auc,
  collapseAttempts,
  compareGroups,
  dailyProgress,
  evaluate,
  getSystemComparison,
  paceCaretGroup,
  patternTrends,
  roundTargets,
  wordStats,
  worstSequences,
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

  it("compares systems by misses per keystroke, matching keystrokes to rounds by time", () => {
    const results: LoggedResult[] = [];
    const keystrokes: LoggedKeystroke[] = [];
    let now = 1_000_000;
    // a round of `keys` keystrokes 100 ms apart, `misses` of them missed
    const round = (
      system: string | undefined,
      keys: number,
      misses: number,
    ): void => {
      const start = now;
      for (let i = 0; i < keys; i++) {
        keystrokes.push([now, "", "a", 100, i < misses ? 0 : 1]);
        now += 100;
      }
      results.push({
        t: now,
        mode: "words",
        mode2: "25",
        wpm: 80,
        rawWpm: 82,
        acc: 100 - (100 * misses) / keys,
        consistency: 70,
        testDuration: (now - start) / 1000,
        language: "english_1k",
        funbox: system === undefined ? [] : ["weakspot"],
        valid: false,
        system,
      });
      now += 10_000; // a pause between rounds
    };
    round("original", 100, 2);
    round("original", 2, 1); // failed after 2 keystrokes: 50% of a tiny round
    round("context", 100, 6);
    round("context", 100, 8);
    round(undefined, 100, 50); // not a weakspot round: ignored

    const comparison = getSystemComparison(results, keystrokes);
    expect(comparison.map((c) => c.system)).toEqual(["context", "original"]);
    const [context, original] = comparison;
    expect(context?.missRate).toBeCloseTo(7); // 14 / 200
    // averaged per round, "original" would be (2% + 50%) / 2 = 26%
    expect(original?.missRate).toBeCloseTo((3 / 102) * 100);
    expect(original?.rounds).toBe(2);
    expect(original?.keystrokes).toBe(102);
    expect(context?.missRateError).toBeGreaterThan(0);
  });

  it("dailyProgress groups by local day", () => {
    const log = makeLog(["ab", "ab"], (_, c) => c === "b");
    const [day] = dailyProgress(log);
    expect(day?.keystrokes).toBe(4);
    expect(day?.missRate).toBe(0.5);
  });

  it("wordStats rebuilds words, counting a retried letter once in the word", () => {
    const t = 1;
    const log: LoggedKeystroke[] = [
      // "list" with the "t" missed twice, then right (stop on error)
      [t, "", "l", 100, 1],
      [t, "l", "i", 100, 1],
      [t, "li", "s", 100, 1],
      [t, "is", "t", 100, 0],
      [t, "is", "t", 100, 0],
      [t, "is", "t", 100, 1],
      [t, "st", " ", 100, 1],
      // "list" again, clean
      [t, "", "l", 100, 1],
      [t, "l", "i", 100, 1],
      [t, "li", "s", 100, 1],
      [t, "is", "t", 100, 1],
      [t, "st", " ", 100, 1],
      // "lis" cut off by a restart: dropped
      [t, "", "l", 100, 1],
      [t, "l", "i", 100, 0],
    ];
    const stats = wordStats(log);
    expect(stats).toHaveLength(1);
    expect(stats[0]).toEqual({
      word: "list",
      typed: 2,
      misses: 2,
      missedAt: { st: 2 },
    });
  });

  it("worstSequences skips rare and word-start sequences", () => {
    const worst = worstSequences([
      ["bt", 3000, 10],
      [" a", 4000, 10], // word start
      ["ve", 900, 20],
      ["zq", 5000, 2], // too rare
    ]);
    expect(worst.map((w) => w.sequence)).toEqual(["bt", "ve"]);
    expect(worst[0]?.missRate).toBeCloseTo((3000 - 120) / 5000);
  });

  it("roundTargets lists the weak pairs a round hit, with misses", () => {
    const log: LoggedKeystroke[] = [
      [1, "", "s", 100, 1],
      [1, "s", "t", 100, 0], // "st" missed, then retried
      [1, "s", "t", 100, 1],
      [1, "st", "a", 100, 1],
      [1, "ta", "y", 100, 1],
      [1, "", "b", 100, 1],
      [1, "b", "t", 100, 1], // "bt" only once: below the minimum
      [1, "", "l", 100, 1],
      [1, "l", "i", 100, 1],
      [1, "li", "s", 100, 1],
      [1, "is", "t", 100, 1],
    ];
    expect(roundTargets(log, ["st", "bt", "ve"])).toEqual([
      { sequence: "st", attempts: 3, misses: 1 },
    ]);
  });

  it("groups weakspot rounds by pace caret", () => {
    const base: LoggedResult = {
      t: 2000,
      mode: "words",
      mode2: "25",
      wpm: 90,
      rawWpm: 92,
      acc: 95,
      consistency: 80,
      testDuration: 1,
      language: "english_1k",
      funbox: ["weakspot"],
      valid: true,
      system: "context",
    };
    const caret = (paceCaret: string, paceSpeed?: number): LoggedResult => ({
      ...base,
      settings: { paceCaret, paceSpeed, stopOnError: "letter" },
    });
    expect(paceCaretGroup(caret("custom", 90))).toBe("caret 90");
    expect(paceCaretGroup(caret("off"))).toBe("caret off");
    expect(paceCaretGroup(base)).toBeUndefined(); // before settings were logged
    expect(
      paceCaretGroup({ ...caret("off"), system: undefined }),
    ).toBeUndefined();

    const keystrokes: LoggedKeystroke[] = [
      [1500, "", "a", 100, 1],
      [1600, "a", "b", 100, 0],
    ];
    const [group] = compareGroups(
      [caret("custom", 100)],
      keystrokes,
      paceCaretGroup,
    );
    expect(group).toMatchObject({
      group: "caret 100",
      rounds: 1,
      keystrokes: 2,
      misses: 1,
      wpm: 90,
    });
  });

  it("collapseAttempts merges stop-on-error retries into one attempt", () => {
    const attempts = collapseAttempts([
      [1000, "s", "t", 100, 0],
      [1100, "s", "t", 100, 0],
      [1200, "s", "t", 100, 1], // retries of the same "t": one missed attempt
      [1300, "st", "a", 100, 1],
      [9000, "s", "t", 100, 1], // a later "st": a new attempt
    ]);
    expect(attempts.map((a) => [a.before, a.expected, a.missed])).toEqual([
      ["s", "t", true],
      ["st", "a", false],
      ["s", "t", false],
    ]);
  });

  it("patternTrends tells improving pairs from stuck ones", () => {
    const log: LoggedKeystroke[] = [];
    let t = 0;
    for (let i = 0; i < 40; i++) {
      // "gn": missed in the first 20 tries, clean after; "sq": 1 in 4 throughout
      log.push([(t += 5000), "g", "n", 100, i < 20 ? 0 : 1]);
      log.push([(t += 5000), "s", "q", 100, i % 4 === 0 ? 0 : 1]);
    }
    const trends = new Map(patternTrends(log, 2).map((p) => [p.sequence, p]));
    expect(trends.get("gn")).toMatchObject({
      early: 1,
      late: 0,
      status: "improving",
    });
    expect(trends.get("sq")?.status).toBe("no clear change");
    expect(trends.get("sq")?.late).toBeCloseTo(0.25);
  });

  it("roundTargets counts single letters too, once per keystroke", () => {
    const log: LoggedKeystroke[] = [
      [1, "", "q", 100, 0], // word-start "q": pair key is "q" too - counted once
      [1, "", "q", 100, 1],
      [1, "q", "u", 100, 1],
      [1, "s", "q", 100, 1], // "q" inside a word
      [1, "", "b", 100, 1],
      [1, "b", "t", 100, 0],
      [1, "b", "t", 100, 1],
    ];
    expect(roundTargets(log, ["q", "bt"], 4)).toEqual([
      { sequence: "q", attempts: 3, misses: 1 },
      { sequence: "bt", attempts: 2, misses: 1 },
    ]);
  });
});
