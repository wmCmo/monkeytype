import { setConfig } from "../../config/setters";
import * as Funbox from "../../test/funbox/funbox";
import * as TestLogic from "../../test/test-logic";
import { Command } from "../types";

// One-step switches between weakspot drilling and a normal test, so the
// drill setup doesn't have to be rebuilt by hand after a normal test.

/**
 * Weakspot drill: english 1k, 25 words, weakspot funbox, custom pace caret
 * (at whatever custom speed was last set), stop on error per letter, no
 * minimum accuracy.
 */
export function applyWeakspotDrill(): void {
  setConfig("language", "english_1k");
  setConfig("mode", "words");
  setConfig("words", 25);
  setConfig("paceCaret", "custom");
  setConfig("stopOnError", "letter");
  setConfig("minAcc", "off");
  Funbox.setFunbox(["weakspot"]);
  void TestLogic.restartTest();
}

/**
 * Normal test: english, 60 seconds, no funbox, no pace caret, no stop on
 * error, no minimum accuracy - to check whether the drills carry over.
 */
export function applyNormalTest(): void {
  setConfig("language", "english");
  setConfig("mode", "time");
  setConfig("time", 60);
  setConfig("paceCaret", "off");
  setConfig("stopOnError", "off");
  setConfig("minAcc", "off");
  Funbox.setFunbox([]);
  void TestLogic.restartTest();
}

export const WeakspotCommands: Command[] = [
  {
    id: "weakspotDrill",
    display: "Weakspot drill",
    alias: "drill",
    fa: { icon: "fa-crosshairs" },
    exec: applyWeakspotDrill,
  },
  {
    id: "weakspotNormalTest",
    display: "Normal test (60s, weakspot off)",
    alias: "normal",
    fa: { icon: "fa-stopwatch" },
    exec: applyNormalTest,
  },
];
