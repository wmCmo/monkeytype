// Weakspot training report from the data the dev server syncs after each test
// (frontend/.weakspot/data.json, see vite-plugins/weakspot-sync.ts).
//
//   pnpm weakspot            from frontend/
//   pnpm weakspot --days 7   only the last 7 days of keystrokes and results

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  compareGroups,
  dailyProgress,
  paceCaretGroup,
  evaluate,
  focusSummary,
  getSystemComparison,
  wordStats,
  worstSequences,
} from "../src/ts/test/weak-spot-eval";
import type {
  LoggedKeystroke,
  LoggedResult,
} from "../src/ts/test/weak-spot-log";
import type { StoredEntry } from "../src/ts/test/weak-spot-model";

type Synced = {
  syncedAt: number;
  scores: {
    1: StoredEntry[];
    2: StoredEntry[];
    3: StoredEntry[];
    m: StoredEntry[];
  };
  keystrokes: LoggedKeystroke[];
  results: LoggedResult[];
};

const file = fileURLToPath(new URL("../.weakspot/data.json", import.meta.url));
if (!existsSync(file)) {
  console.log(
    `No synced data at ${file}.\nStart the dev server and finish a test: it syncs after every test.`,
  );
  process.exit(1);
}
const data = JSON.parse(readFileSync(file, "utf8")) as Synced;

const daysArg = process.argv.indexOf("--days");
const since =
  daysArg === -1
    ? 0
    : Date.now() - Number(process.argv[daysArg + 1]) * 24 * 60 * 60 * 1000;
const keystrokes = data.keystrokes.filter((k) => k[0] >= since);
const results = data.results.filter((r) => r.t >= since);

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const time = (t: number): string =>
  new Date(t).toLocaleString("sv", { hour12: false });
const heading = (title: string): void => console.log(`\n## ${title}`);

console.log(`# Weakspot report`);
console.log(
  `synced ${time(data.syncedAt)} · ${keystrokes.length} keystrokes · ${results.length} results`,
);

heading("Daily progress");
for (const d of dailyProgress(keystrokes)) {
  console.log(
    `${d.day}  ${String(d.keystrokes).padStart(5)} keys  miss ${pct(d.missRate).padStart(5)}  median ${d.medianMs} ms`,
  );
}

heading("Normal tests (weakspot off)");
const normal = results.filter((r) => !r.funbox.includes("weakspot"));
if (normal.length === 0) console.log("none yet");
for (const r of normal.slice(-10)) {
  console.log(
    `${time(r.t)}  ${r.mode} ${r.mode2}  ${r.wpm.toFixed(0)} wpm  raw ${r.rawWpm.toFixed(0)}  acc ${r.acc}%${r.valid ? "" : "  (invalid)"}`,
  );
}

heading("Weakspot systems (misses per keystroke)");
for (const c of getSystemComparison(results, keystrokes)) {
  console.log(
    `${c.system.padEnd(18)} ${String(c.rounds).padStart(3)} rounds  ${String(c.keystrokes).padStart(5)} keys  miss ${c.missRate.toFixed(1)}% ± ${c.missRateError.toFixed(1)}`,
  );
}

heading("Weakspot rounds by pace caret (misses per keystroke)");
const byCaret = compareGroups(results, keystrokes, paceCaretGroup);
if (byCaret.length === 0) {
  console.log("none yet (settings are logged from 16 Nov 2026 on)");
}
for (const c of byCaret) {
  console.log(
    `${c.group.padEnd(12)} ${String(c.rounds).padStart(3)} rounds  ${c.wpm.toFixed(0).padStart(3)} wpm  miss ${c.missRate.toFixed(1)}% ± ${c.missRateError.toFixed(1)}`,
  );
}

heading("Focus drill (stubborn patterns, inside focus rounds)");
const focus = focusSummary(results, keystrokes);
if (focus.length === 0) console.log("none yet");
for (const f of focus) {
  console.log(
    `${f.pattern.padEnd(4)} ${String(f.rounds).padStart(3)} rounds  ${String(f.attempts).padStart(4)} tries  early ${pct(f.early)} → late ${pct(f.late)}`,
  );
}

heading("Worst pairs now");
for (const s of worstSequences(data.scores[2])) {
  console.log(
    `${s.sequence.padEnd(4)} ${Math.round(s.score).toString().padStart(5)} ms  ~${pct(s.missRate)} miss  (${s.count}×)`,
  );
}

heading("Worst triples now");
for (const s of worstSequences(data.scores[3], { minCount: 4 })) {
  console.log(
    `${s.sequence.padEnd(4)} ${Math.round(s.score).toString().padStart(5)} ms  ~${pct(s.missRate)} miss  (${s.count}×)`,
  );
}

heading("Finger movements now");
const overall = data.scores.m.find(([k]) => k === "*")?.[1] ?? 0;
for (const [key, score, count] of [...data.scores.m].sort(
  (a, b) => b[1] - a[1],
)) {
  if (key === "*") continue;
  console.log(
    `${key.padEnd(7)} ${Math.round(score).toString().padStart(5)} ms  ${score > overall ? "+" : ""}${Math.round(score - overall)} vs average  (${count}×)`,
  );
}

heading("Words with most misses per attempt (typed 4+ times)");
for (const w of wordStats(keystrokes)
  .filter((w) => w.typed >= 4 && w.misses > 0)
  .sort((a, b) => b.misses / b.typed - a.misses / a.typed)
  .slice(0, 10)) {
  const where = Object.entries(w.missedAt)
    .sort((a, b) => b[1] - a[1])
    .map(([at, n]) => `${at}×${n}`)
    .join(" ");
  console.log(
    `${w.word.padEnd(12)} ${(w.misses / w.typed).toFixed(2)} per attempt  (${w.typed}×; ${where})`,
  );
}

heading("Model versions (replay, AUC: 0.5 = guessing)");
for (const v of evaluate(keystrokes)) {
  console.log(
    `${v.variant.padEnd(22)} AUC ${v.auc.toFixed(3)}  (${v.judged} judged, ${v.misses} misses)`,
  );
}
