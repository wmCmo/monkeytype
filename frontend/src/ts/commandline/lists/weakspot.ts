import { setConfig } from "../../config/setters";
import { Config } from "../../config/store";
import { showNoticeNotification } from "../../states/notifications";
import * as CustomText from "../../test/custom-text";
import * as Funbox from "../../test/funbox/funbox";
import * as TestLogic from "../../test/test-logic";
import { getScoresSnapshot } from "../../test/weak-spot";
import { pickFocusPatterns, pickFocusWords } from "../../test/weak-spot-focus";
import {
  clearActiveFocus,
  saveDrillPace,
  setActiveFocus,
  takeDrillPace,
} from "../../test/weak-spot-focus-state";
import { getLoggedKeystrokes } from "../../test/weak-spot-log";
import { getLanguage } from "../../utils/json-data";
import { Command } from "../types";

// One-step switches between weakspot drilling, focus drilling and a normal
// test, so no setup has to be rebuilt by hand in between.

/**
 * Weakspot drill: english 5k (1k had a single "bt" word, so weakspot kept
 * serving the same few words), 25 words, weakspot funbox, custom pace caret
 * (at the speed from before any focus drill, else the last custom speed),
 * stop on error per letter, no minimum accuracy.
 */
export function applyWeakspotDrill(): void {
  clearActiveFocus();
  const drillPace = takeDrillPace();
  if (drillPace !== null) setConfig("paceCaretCustomSpeed", drillPace);
  setConfig("language", "english_5k");
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
  clearActiveFocus();
  const drillPace = takeDrillPace();
  if (drillPace !== null) setConfig("paceCaretCustomSpeed", drillPace);
  setConfig("language", "english");
  setConfig("mode", "time");
  setConfig("time", 60);
  setConfig("paceCaret", "off");
  setConfig("stopOnError", "off");
  setConfig("minAcc", "off");
  Funbox.setFunbox([]);
  void TestLogic.restartTest();
}

// focus drills run at this share of the weakspot drill's pace
const focusPaceShare = 0.75;
const focusWordCount = 30;

/**
 * Focus drill: the stubborn patterns (pickFocusPatterns) in a list of common
 * words containing them (english 10k, most common first), as custom text
 * shuffled anew each round, at 75% of the drill's pace with stop on error per
 * letter.
 */
export async function applyFocusDrill(): Promise<void> {
  const patterns = pickFocusPatterns(
    getLoggedKeystrokes(),
    getScoresSnapshot()[2],
  );
  if (patterns.length === 0) {
    showNoticeNotification("Not enough typing logged to pick focus patterns");
    return;
  }
  const { words: wordList } = await getLanguage("english_10k");
  const words = pickFocusWords(wordList, patterns, focusWordCount);
  if (words.length === 0) {
    showNoticeNotification(`No words found for ${patterns.join(" ")}`);
    return;
  }

  saveDrillPace(Config.paceCaretCustomSpeed);
  const drillPace = Config.paceCaretCustomSpeed;
  Funbox.setFunbox([]);
  // a new order every round, each word once: a fixed order gets memorised
  CustomText.setMode("shuffle");
  CustomText.setPipeDelimiter(false);
  CustomText.setText(words);
  CustomText.setLimitMode("word");
  CustomText.setLimitValue(words.length);
  setConfig("mode", "custom");
  setConfig("paceCaret", "custom");
  setConfig(
    "paceCaretCustomSpeed",
    Math.max(30, Math.round(drillPace * focusPaceShare)),
  );
  setConfig("stopOnError", "letter");
  setConfig("minAcc", "off");
  setActiveFocus(patterns, words);
  showNoticeNotification(`focus: ${patterns.join(" ")}`);
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
    id: "weakspotFocusDrill",
    display: "Focus drill (stubborn patterns, slow)",
    alias: "focus",
    fa: { icon: "fa-bullseye" },
    exec: () => void applyFocusDrill(),
  },
  {
    id: "weakspotNormalTest",
    display: "Normal test (60s, weakspot off)",
    alias: "normal",
    fa: { icon: "fa-stopwatch" },
    exec: applyNormalTest,
  },
];
