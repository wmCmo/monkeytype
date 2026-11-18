import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({ mode: "custom", text: [] as string[] }));

vi.mock("../../src/ts/config/store", () => ({
  Config: {
    get mode() {
      return state.mode;
    },
  },
}));
vi.mock("../../src/ts/test/custom-text", () => ({
  getText: () => state.text,
}));

type FocusState = typeof import("../../src/ts/test/weak-spot-focus-state");

// a fresh module = what a page reload gives
async function load(): Promise<FocusState> {
  vi.resetModules();
  return import("../../src/ts/test/weak-spot-focus-state");
}

describe("weak-spot-focus-state", () => {
  beforeEach(() => {
    window.localStorage.clear();
    state.mode = "custom";
    state.text = ["doubt", "crowd"];
  });

  it("keeps the active focus across a reload", async () => {
    const first = await load();
    first.setActiveFocus(["bt", "wd"], ["doubt", "crowd"]);

    const second = await load();
    expect(second.getActiveFocusPatterns()).toEqual(["bt", "wd"]);
  });

  it("doesn't tag a test with different words or another mode", async () => {
    const fs = await load();
    fs.setActiveFocus(["bt", "wd"], ["doubt", "crowd"]);
    state.text = ["something", "else"];
    expect(fs.getActiveFocusPatterns()).toBeUndefined();
    state.text = ["doubt", "crowd"];
    state.mode = "time";
    expect(fs.getActiveFocusPatterns()).toBeUndefined();
  });

  it("clearActiveFocus forgets it, including after a reload", async () => {
    const first = await load();
    first.setActiveFocus(["bt"], ["doubt", "crowd"]);
    first.clearActiveFocus();
    const second = await load();
    expect(second.getActiveFocusPatterns()).toBeUndefined();
  });
});
