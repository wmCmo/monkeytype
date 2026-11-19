import { Config } from "../config/store";
import { getDislikedThemes } from "../states/theme-ratings";
import { getScoresSnapshot } from "./weak-spot";
import { getLoggedKeystrokes, getLoggedResults } from "./weak-spot-log";

// Dev only: posts the weakspot scores, keystroke log and results - and the
// random-theme ratings (liked = favourite themes) - to the dev server, which
// writes them to frontend/.weakspot/data.json (see
// vite-plugins/weakspot-sync.ts), so they can be analysed from disk.

export async function syncWeakspotData(): Promise<void> {
  if (!import.meta.env.DEV) return;
  const body = JSON.stringify({
    syncedAt: Date.now(),
    scores: getScoresSnapshot(),
    keystrokes: getLoggedKeystrokes(),
    results: getLoggedResults(),
    themes: { liked: [...Config.favThemes], disliked: getDislikedThemes() },
  });
  try {
    await fetch("/__weakspot/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch (e) {
    console.debug("weakspot sync failed", e);
  }
}
