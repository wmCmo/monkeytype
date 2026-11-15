import { describe, it, expect, vi, beforeEach } from "vitest";

type Log = typeof import("../../src/ts/test/weak-spot-log");

async function load(): Promise<Log> {
  vi.resetModules();
  return import("../../src/ts/test/weak-spot-log");
}

const result = {
  t: 1,
  mode: "words",
  mode2: "25",
  wpm: 90,
  rawWpm: 92,
  acc: 97,
  consistency: 80,
  testDuration: 15,
  language: "english_1k",
  funbox: ["weakspot"],
  valid: true,
};

describe("weak-spot-log", () => {
  beforeEach(() => window.localStorage.clear());

  it("logs keystrokes with two letters of context", async () => {
    const log = await load();
    log.logKeystroke({
      before: "lev",
      expected: "e",
      spacing: 101.6,
      isCorrect: false,
    });
    log.logKeystroke({
      before: "",
      expected: "a",
      spacing: 90,
      isCorrect: true,
    });
    const [first, second] = log.getLoggedKeystrokes();
    expect(first?.slice(1)).toEqual(["ev", "e", 102, 0]);
    expect(second?.slice(1)).toEqual(["", "a", 90, 1]);
  });

  it("writes buffered keystrokes when a result is logged", async () => {
    const first = await load();
    first.logKeystroke({
      before: "",
      expected: "a",
      spacing: 90,
      isCorrect: true,
    });
    first.logResult(result);

    const second = await load();
    expect(second.getLoggedKeystrokes()).toHaveLength(1);
    expect(second.getLoggedResults()).toEqual([result]);
  });

  it("clearLog empties both logs", async () => {
    const log = await load();
    log.logKeystroke({
      before: "",
      expected: "a",
      spacing: 90,
      isCorrect: true,
    });
    log.logResult(result);
    log.clearLog();
    expect(log.getLoggedKeystrokes()).toEqual([]);
    expect(log.getLoggedResults()).toEqual([]);
  });
});
