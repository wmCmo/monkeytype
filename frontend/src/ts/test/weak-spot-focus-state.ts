import { z } from "zod";

import { Config } from "../config/store";
import { LocalStorageWithSchema } from "../utils/local-storage-with-schema";
import * as CustomText from "./custom-text";

// Which patterns the current focus drill is on, so results can be tagged
// with them, and the weakspot drill's pace caret speed to return to (focus
// drills run slower, on the same custom speed setting).

let active: { patterns: string[]; text: string } | null = null;

export function setActiveFocus(patterns: string[], words: string[]): void {
  active = { patterns, text: words.join(" ") };
}

export function clearActiveFocus(): void {
  active = null;
}

/**
 * The focus patterns if the test being run is the focus drill's word list
 * (custom mode, same text), else undefined.
 */
export function getActiveFocusPatterns(): string[] | undefined {
  if (active === null || Config.mode !== "custom") return undefined;
  if (CustomText.getText().join(" ") !== active.text) return undefined;
  return active.patterns;
}

const drillPaceLS = new LocalStorageWithSchema({
  key: "weakspotDrillPace",
  schema: z.number().nullable(),
  fallback: null,
});

/** Remembers the drill's pace speed before a focus drill slows it down. */
export function saveDrillPace(speed: number): void {
  if (drillPaceLS.get() === null) drillPaceLS.set(speed);
}

/** The drill's pace speed from before the focus drill, once; null if none. */
export function takeDrillPace(): number | null {
  const speed = drillPaceLS.get();
  if (speed !== null) drillPaceLS.set(null);
  return speed;
}
