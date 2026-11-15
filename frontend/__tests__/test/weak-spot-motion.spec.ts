import { describe, it, expect } from "vitest";
import { motionClass } from "../../src/ts/test/weak-spot-motion";

describe("weak-spot-motion", () => {
  it.each([
    ["b", "t", "sf:2"], // left index, bottom to top
    ["u", "n", "sf:2"], // right index, top to bottom
    ["f", "r", "sf:1"],
    ["t", "r", "sf:0"],
    ["v", "e", "adj:2"], // left index bottom, left middle top
    ["a", "s", "adj:0"],
    ["a", "f", "far:0"],
    ["t", "h", "alt"],
    ["l", "l", "repeat"],
    ["T", "h", "alt"], // case doesn't matter
  ])("%s -> %s is %s", (from, to, expected) => {
    expect(motionClass(from, to)).toBe(expected);
  });

  it("has no movement for keys off the letter block", () => {
    expect(motionClass(" ", "a")).toBeUndefined();
    expect(motionClass("a", "1")).toBeUndefined();
    expect(motionClass("é", "a")).toBeUndefined();
  });
});
