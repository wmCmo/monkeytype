import { getScoresSnapshot } from "./weak-spot";
import { getLoggedKeystrokes, getLoggedResults } from "./weak-spot-log";

// Dev only: posts the weakspot scores, keystroke log and results to the dev
// server, which writes them to frontend/.weakspot/data.json (see
// vite-plugins/weakspot-sync.ts), so they can be analysed from disk.

export async function syncWeakspotData(): Promise<void> {
  if (!import.meta.env.DEV) return;
  const body = JSON.stringify({
    syncedAt: Date.now(),
    scores: getScoresSnapshot(),
    keystrokes: getLoggedKeystrokes(),
    results: getLoggedResults(),
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
