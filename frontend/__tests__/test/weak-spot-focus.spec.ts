import { describe, it, expect } from "vitest";
import {
  pickFocusPatterns,
  pickFocusWords,
} from "../../src/ts/test/weak-spot-focus";
import { focusSummary } from "../../src/ts/test/weak-spot-eval";
import type {
  LoggedKeystroke,
  LoggedResult,
} from "../../src/ts/test/weak-spot-log";

/** `n` attempts of `pair`, 5 s apart, missed where `missedAt(i)` */
function pairAttempts(
  pair: string,
  n: number,
  missedAt: (i: number) => boolean,
  start = 0,
): LoggedKeystroke[] {
  return Array.from({ length: n }, (_, i) => [
    start + i * 5000,
    pair[0] as string,
    pair[1] as string,
    100,
    missedAt(i) ? 0 : 1,
  ]);
}

describe("weak-spot-focus", () => {
  it("picks pairs that are not improving, worst and best-backed first", () => {
    const log = [
      ...pairAttempts("bt", 100, (i) => i % 4 === 0), // 25% throughout
      ...pairAttempts("wd", 40, (i) => i % 5 === 0, 1e6), // 20% throughout
      ...pairAttempts("ho", 60, (i) => i < 20, 2e6), // fixed: improving
      ...pairAttempts("an", 80, () => false, 3e6), // never missed
    ];
    expect(pickFocusPatterns(log, [])).toEqual(["bt", "wd"]);
  });

  it("skips a letter when a picked pair already contains it", () => {
    // "sq" is stuck, and so is "q" overall - "q" only adds "qu"'s misses
    const log = [
      ...pairAttempts("sq", 80, (i) => i % 4 === 0),
      ...pairAttempts("qu", 80, (i) => i % 10 === 0, 1e6),
    ];
    const picked = pickFocusPatterns(log, []);
    expect(picked).toContain("sq");
    expect(picked).not.toContain("q");
  });

  it("falls back to the weakest stored pairs without enough history", () => {
    expect(
      pickFocusPatterns(
        [],
        [
          ["bt", 3000, 20],
          ["ve", 900, 20],
        ],
      ),
    ).toEqual(["bt", "ve"]);
  });

  it("builds a word list of common words with an even share per pattern", () => {
    const words = [
      "doubt",
      "debt",
      "subtle",
      "obtain",
      "crowd",
      "it's", // not plain letters
      "ab", // too short
      ...Array.from({ length: 20 }, (_, i) => `rarebt${"x".repeat(i % 5)}`),
    ];
    const list = pickFocusWords(words, ["bt", "wd", "zz"], 10, () => 0.5);
    expect(list).toHaveLength(10);
    // "zz" has no words and is dropped; "bt" and "wd" get 5 each
    expect(list.filter((w) => w.includes("wd"))).toHaveLength(5);
    expect(list.filter((w) => w === "crowd")).toHaveLength(5); // repeated
    // only the 12 most common "bt" words (the list is most common first)
    const commonBt = new Set(
      words
        .filter((w) => w.includes("bt") && /^[a-z]{3,12}$/.test(w))
        .slice(0, 12),
    );
    const btPicked = list.filter((w) => w.includes("bt"));
    expect(btPicked).toHaveLength(5);
    expect(btPicked.every((w) => commonBt.has(w))).toBe(true);
  });

  it("returns no words when no pattern has any", () => {
    expect(pickFocusWords(["cat"], ["bt"], 10)).toEqual([]);
  });

  it("focusSummary reports each focused pattern inside focus rounds", () => {
    const keystrokes = [
      ...pairAttempts("bt", 10, (i) => i < 4, 1000), // 4 misses early, then clean
      [99_000, "", "q", 100, 0] as LoggedKeystroke,
    ];
    const round = (t: number, duration: number): LoggedResult => ({
      t,
      mode: "custom",
      mode2: "custom",
      wpm: 70,
      rawWpm: 72,
      acc: 95,
      consistency: 80,
      testDuration: duration,
      language: "english_1k",
      funbox: [],
      valid: true,
      focus: ["bt", "q"],
    });
    const [bt, q] = focusSummary([round(100_000, 100)], keystrokes);
    expect(bt).toMatchObject({
      pattern: "bt",
      rounds: 1,
      attempts: 10,
      early: 0.8,
      late: 0,
    });
    expect(q).toMatchObject({ pattern: "q", attempts: 11 - 10 });
  });
});
