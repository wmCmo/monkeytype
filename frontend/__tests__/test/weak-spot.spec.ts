import { describe, it, expect, vi, beforeEach } from "vitest";
import { Wordset } from "../../src/ts/test/wordset";
import { WeakSpotModel } from "../../src/ts/test/weak-spot-model";

const msSinceLastInput = vi.hoisted(() => ({ value: 100 as number | null }));

vi.mock("../../src/ts/test/events/live-cache", () => ({
  getLiveCachedMsSinceLastInputEvent: () => msSinceLastInput.value,
}));

type WeakSpot = typeof import("../../src/ts/test/weak-spot");

// fresh module per test: scores live in module state
async function load(): Promise<WeakSpot> {
  vi.resetModules();
  return import("../../src/ts/test/weak-spot");
}

/** types `word` letter by letter; `slow` letters take `slowMs`, wrong ones fail */
function type(
  ws: WeakSpot,
  word: string,
  opts: { ms?: number; wrongAt?: number[]; slowAt?: number[] } = {},
): void {
  for (let i = 0; i < word.length; i++) {
    msSinceLastInput.value = opts.slowAt?.includes(i) ? 400 : (opts.ms ?? 100);
    ws.updateScore({
      before: word.slice(0, i),
      expected: word[i] as string,
      isCorrect: !(opts.wrongAt?.includes(i) ?? false),
    });
  }
}

describe("weak-spot", () => {
  beforeEach(() => {
    window.localStorage.clear();
    msSinceLastInput.value = 100;
  });

  it("ignores the first keypress of a test (no spacing yet)", async () => {
    const ws = await load();
    msSinceLastInput.value = null;
    ws.updateScore({ before: "", expected: "a", isCorrect: false });
    expect(ws.score("a")).toBe(0);
  });

  it("scores the same letter differently by the letter before it", async () => {
    const ws = await load();
    // "e" after "h" is always fine; "e" after "r" is always missed
    for (let n = 0; n < 30; n++) {
      type(ws, "he");
      type(ws, "re", { wrongAt: [1] });
    }
    expect(ws.score("re")).toBeGreaterThan(ws.score("he") + 1000);
    // the old per-letter score could not tell these apart: both words
    // contain one "e", and "h" and "r" were both typed cleanly
  });

  it("uses two letters of context", async () => {
    const ws = await load();
    // "e" after "th" is missed, "e" after "sh" is fine: same bigram "he"
    for (let n = 0; n < 30; n++) {
      type(ws, "the", { wrongAt: [2] });
      type(ws, "she");
    }
    expect(ws.score("the")).toBeGreaterThan(ws.score("she") + 500);
  });

  it("falls back to the letter's own score in a context never seen", async () => {
    const ws = await load();
    for (let n = 0; n < 30; n++) type(ws, "ab", { wrongAt: [1] });
    // "xb": "x" never typed, "b" never typed after "x" - backs off to "b"
    const b = ws.score("b");
    expect(ws.score("xb")).toBeCloseTo(b, 5);
    expect(b).toBeGreaterThan(1000);
  });

  it("counts slowness, not only mistakes", async () => {
    const ws = await load();
    for (let n = 0; n < 30; n++) {
      type(ws, "ok");
      type(ws, "ik", { slowAt: [1] });
    }
    expect(ws.score("ik")).toBeGreaterThan(ws.score("ok"));
  });

  it("picks the word with the weakest sequence", async () => {
    const ws = await load();
    for (let n = 0; n < 30; n++) {
      type(ws, "he");
      type(ws, "re", { wrongAt: [1] });
    }
    const picks = new Set<string>();
    for (let n = 0; n < 20; n++) {
      picks.add(ws.getWord(new Wordset(["he", "re"])));
    }
    expect(picks).toEqual(new Set(["re"]));
  });

  it("ranks a long word with the weak sequence above a short word with a shaky letter", async () => {
    const ws = await load();
    for (let n = 0; n < 30; n++) {
      type(ws, "never", { wrongAt: [3] }); // "e" after "ev" missed
      type(ws, "a", { slowAt: [0] }); // "a" slow but never missed
    }
    expect(ws.score("never")).toBeGreaterThan(ws.score("a"));
  });

  it("doesn't fill a test with the same few words", async () => {
    const ws = await load();
    // more "ve" words than the 8 recent picks that are skipped
    const vocab = [
      "never",
      "even",
      "level",
      "ever",
      "seven",
      "over",
      "very",
      "give",
      "have",
      "move",
      "leave",
      "eleven",
    ];
    for (let n = 0; n < 30; n++) {
      for (const w of vocab) type(ws, w, { wrongAt: [w.indexOf("ve") + 1] });
    }
    const set = new Wordset([...vocab, "cat", "dog", "sun"]);
    const picks = Array.from({ length: 40 }, () => ws.getWord(set));
    // every pick drills "ve", and no word comes back within 8 picks
    expect(picks.every((p) => p.includes("ve"))).toBe(true);
    for (let i = 8; i <= picks.length; i++) {
      const window = picks.slice(i - 8, i);
      expect(new Set(window).size).toBe(8);
    }
  });

  it("carries a weak finger movement over to pairs never typed", async () => {
    const ws = await load();
    for (let n = 0; n < 30; n++) {
      // n, y, d and o are typed cleanly, but never as "ny" or "nd"
      type(ws, "no");
      type(ws, "yo");
      type(ws, "do");
      // one index finger jumping bottom <-> top keeps missing
      type(ws, "bt", { wrongAt: [1] });
      type(ws, "un", { wrongAt: [1] });
    }
    // "ny" is that same jump (right index); "nd" switches hands
    expect(ws.score("ny")).toBeGreaterThan(ws.score("nd") + 1000);
  });

  it("upgrades saved v1 scores, seeding movements from the pairs", async () => {
    window.localStorage.setItem(
      "weakspotScores",
      JSON.stringify({
        v: 1,
        1: [
          ["b", 100, 10],
          ["t", 2600, 10],
        ],
        2: [["bt", 5100, 10]],
        3: [],
      }),
    );
    const ws = await load();
    expect(ws.score("bt")).toBeGreaterThan(4000);
    const motions = new Map(ws.getMotionScores().map((e) => [e[0], e]));
    expect(motions.get("sf:2")?.[1]).toBeCloseTo(5100);
    expect(motions.get("*")?.[1]).toBeCloseTo(1350);
  });

  it("seeds movements when saved scores have pairs but no movements", async () => {
    window.localStorage.setItem(
      "weakspotScores",
      JSON.stringify({
        v: 2,
        1: [["t", 2600, 10]],
        2: [["bt", 5100, 10]],
        3: [],
        m: [],
      }),
    );
    const ws = await load();
    const motions = new Map(ws.getMotionScores().map((e) => [e[0], e]));
    expect(motions.get("sf:2")?.[1]).toBeCloseTo(5100);
  });

  it("picks a random system at the first word of a round and keeps it", async () => {
    const ws = await load();
    const names = Object.keys(ws.selectionSystems);
    const random = vi.spyOn(Math, "random");
    random.mockReturnValue(0); // first system for the round pick
    ws.getWord(new Wordset(["a", "b"]), 0);
    expect(ws.getCurrentSystem()).toBe(names[0]);
    random.mockReturnValue(0.99); // later words don't re-pick
    ws.getWord(new Wordset(["a", "b"]), 1);
    expect(ws.getCurrentSystem()).toBe(names[0]);
    ws.getWord(new Wordset(["a", "b"]), 0);
    expect(ws.getCurrentSystem()).toBe(names[names.length - 1]);
    random.mockRestore();
  });

  it("rotates only systems that take a word's weakest spot", async () => {
    const ws = await load();
    expect(Object.keys(ws.selectionSystems).sort()).toEqual([
      "context",
      "context+movement",
    ]);
    for (const options of Object.values(ws.selectionSystems)) {
      expect(options.aggregate ?? "max").toBe("max");
    }
  });

  it("the mean aggregate (the retired original system) averages a word's letters", () => {
    const model = new WeakSpotModel({ context: false, motion: false });
    for (let n = 0; n < 30; n++) {
      // "z" always missed, "o" clean, "q" always slow but never missed
      for (const [i, c] of Array.from("zoo").entries()) {
        model.update({
          before: "zoo".slice(0, i),
          expected: c,
          spacing: 100,
          isCorrect: c !== "z",
        });
      }
      model.update({
        before: "",
        expected: "q",
        spacing: 400,
        isCorrect: true,
      });
    }
    // one missed "z" (~5100 ms) among 20 clean "o"s (~100 ms) averages ~340,
    // under "q" (400); its weakest spot is far above
    const longWord = `z${"o".repeat(20)}`;
    const mean = { context: false, motion: false, aggregate: "mean" } as const;
    expect(model.score(longWord, mean)).toBeLessThan(model.score("qq", mean));
    expect(model.score(longWord)).toBeGreaterThan(model.score("qq"));
  });

  it("keeps scores across a reload", async () => {
    const first = await load();
    for (let n = 0; n < 30; n++) type(first, "re", { wrongAt: [1] });
    const before = first.score("re");
    first.flushScores();

    const second = await load();
    expect(second.score("re")).toBeCloseTo(before, 5);
  });

  it("resetScores forgets everything, including storage", async () => {
    const first = await load();
    for (let n = 0; n < 10; n++) type(first, "re", { wrongAt: [1] });
    first.flushScores();
    first.resetScores();
    expect(first.score("re")).toBe(0);

    const second = await load();
    expect(second.score("re")).toBe(0);
  });
});
