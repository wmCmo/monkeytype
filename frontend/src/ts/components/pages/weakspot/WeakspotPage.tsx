import { Link } from "@tanstack/solid-router";
import { For, JSXElement, Show } from "solid-js";

import { getTheme } from "../../../states/theme";
import { getScoresSnapshot } from "../../../test/weak-spot";
import {
  compareGroups,
  dailyProgress,
  getSystemComparison,
  paceCaretGroup,
  patternTrends,
  PatternTrend,
  wordStats,
  worstSequences,
} from "../../../test/weak-spot-eval";
import {
  getLoggedKeystrokes,
  getLoggedResults,
} from "../../../test/weak-spot-log";
import { ChartJs } from "../../common/ChartJs";
import { H2 } from "../../common/Headers";

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

const byLateMissRate = (a: PatternTrend, b: PatternTrend): number =>
  b.late - a.late;

/**
 * Weakspot training dashboard, from the data this browser logs: daily
 * progress, current weak spots, stubborn and improving patterns, the system
 * and pace caret comparisons, and normal tests. Read once when the page opens.
 */
export function WeakspotPage(): JSXElement {
  const keystrokes = getLoggedKeystrokes();
  const results = getLoggedResults();
  const scores = getScoresSnapshot();

  const days = dailyProgress(keystrokes);
  const weakspotRounds = results.filter((r) => r.funbox.includes("weakspot"));
  const normalTests = results
    .filter((r) => !r.funbox.includes("weakspot"))
    .slice(-10)
    .reverse();
  const systems = getSystemComparison(results, keystrokes);
  const carets = compareGroups(results, keystrokes, paceCaretGroup);
  const worstPairs = worstSequences(scores[2], { limit: 8 });
  const worstTriples = worstSequences(scores[3], { minCount: 4, limit: 8 });
  const trends = [
    ...patternTrends(keystrokes, 2),
    ...patternTrends(keystrokes, 3),
  ];
  const stubborn = trends
    .filter((t) => t.status !== "improving" && t.late >= 0.08)
    .sort(byLateMissRate)
    .slice(0, 10);
  const improved = trends
    .filter((t) => t.status === "improving")
    .sort((a, b) => a.late - a.early - (b.late - b.early))
    .slice(0, 10);
  const words = wordStats(keystrokes)
    .filter((w) => w.typed >= 4 && w.misses > 0)
    .sort((a, b) => b.misses / b.typed - a.misses / a.typed)
    .slice(0, 8);
  const missRate =
    keystrokes.length === 0
      ? 0
      : keystrokes.filter((k) => k[4] === 0).length / keystrokes.length;

  return (
    <div class="content-grid grid gap-8">
      <section>
        <H2 fa={{ icon: "fa-crosshairs" }} text="weakspot" />
        <Show
          when={keystrokes.length > 0}
          fallback={
            <div class="text-sub">
              Nothing logged yet in this browser. Finish a test (turn on the
              weakspot funbox to drill) and come back.{" "}
              <Link to="/">Start typing</Link>
            </div>
          }
        >
          <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <For
              each={
                [
                  ["keystrokes logged", keystrokes.length.toLocaleString()],
                  ["weakspot rounds", String(weakspotRounds.length)],
                  ["miss rate", pct(missRate)],
                  ["days", String(days.length)],
                ] as const
              }
            >
              {([title, value]) => (
                <div class="text-center">
                  <div class="text-sub">{title}</div>
                  <div class="text-4xl">{value}</div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </section>

      <Show when={keystrokes.length > 0}>
        <section>
          <h3 class="pb-2 text-xl text-sub">daily progress</h3>
          <div class="h-56 w-full">
            <ChartJs
              name="WeakspotDaily"
              type="line"
              data={{
                labels: days.map((d) => d.day),
                datasets: [
                  {
                    yAxisID: "miss",
                    label: "miss rate %",
                    data: days.map((d) => d.missRate * 100),
                    borderColor: getTheme().error,
                    backgroundColor: getTheme().error,
                    fill: false,
                    pointRadius: 3,
                  },
                  {
                    yAxisID: "ms",
                    label: "median ms per key",
                    data: days.map((d) => d.medianMs),
                    borderColor: getTheme().main,
                    backgroundColor: getTheme().main,
                    fill: false,
                    pointRadius: 3,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  miss: {
                    axis: "y",
                    position: "left",
                    beginAtZero: true,
                    title: { display: true, text: "miss rate %" },
                  },
                  ms: {
                    axis: "y",
                    position: "right",
                    beginAtZero: true,
                    grid: { display: false },
                    title: { display: true, text: "median ms" },
                  },
                },
                plugins: {
                  tooltip: { intersect: false, mode: "index" },
                },
              }}
            />
          </div>
          <Show when={days.length < 2}>
            <div class="pt-2 text-center text-sub">
              one day so far: the lines fill in as you practise on more days
            </div>
          </Show>
        </section>

        <section class="grid gap-8 md:grid-cols-2">
          <div>
            <h3 class="pb-2 text-xl text-sub">weakest pairs now</h3>
            <table class="w-full">
              <tbody>
                <For each={worstPairs}>
                  {(s) => (
                    <tr>
                      <td class="text-main">{s.sequence}</td>
                      <td>~{pct(s.missRate)} miss</td>
                      <td class="text-right text-sub">{s.count}×</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <div>
            <h3 class="pb-2 text-xl text-sub">weakest triples now</h3>
            <table class="w-full">
              <tbody>
                <For each={worstTriples}>
                  {(s) => (
                    <tr>
                      <td class="text-main">{s.sequence}</td>
                      <td>~{pct(s.missRate)} miss</td>
                      <td class="text-right text-sub">{s.count}×</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </section>

        <section class="grid gap-8 md:grid-cols-2">
          <div>
            <h3 class="pb-2 text-xl text-sub">not improving yet</h3>
            <div class="pb-2 text-sm text-sub">
              miss rate over your first half of attempts → second half
            </div>
            <Show
              when={stubborn.length > 0}
              fallback={<div class="text-sub">nothing stuck so far</div>}
            >
              <table class="w-full">
                <tbody>
                  <For each={stubborn}>
                    {(t) => (
                      <tr>
                        <td class="text-main">{t.sequence}</td>
                        <td>
                          {pct(t.early)} → {pct(t.late)}
                        </td>
                        <td class="text-right text-sub">{t.attempts}×</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </div>
          <div>
            <h3 class="pb-2 text-xl text-sub">clearly improved</h3>
            <div class="pb-2 text-sm text-sub">
              first half → second half, beyond the noise
            </div>
            <Show
              when={improved.length > 0}
              fallback={<div class="text-sub">not enough data yet</div>}
            >
              <table class="w-full">
                <tbody>
                  <For each={improved}>
                    {(t) => (
                      <tr>
                        <td class="text-main">{t.sequence}</td>
                        <td>
                          {pct(t.early)} → {pct(t.late)}
                        </td>
                        <td class="text-right text-sub">{t.attempts}×</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </div>
        </section>

        <section>
          <h3 class="pb-2 text-xl text-sub">words with most misses per try</h3>
          <div class="flex flex-wrap gap-x-6 gap-y-1">
            <For each={words}>
              {(w) => (
                <span>
                  <span class="text-main">{w.word}</span>{" "}
                  <span class="text-sub">
                    {(w.misses / w.typed).toFixed(2)} · {w.typed}×
                  </span>
                </span>
              )}
            </For>
          </div>
        </section>

        <section class="grid gap-8 md:grid-cols-2">
          <div>
            <h3 class="pb-2 text-xl text-sub">word-picking systems</h3>
            <div class="pb-2 text-sm text-sub">
              misses per keystroke; the system that makes you miss most finds
              your weak spots best. Gaps under ~2× the ± are noise
            </div>
            <table class="w-full">
              <tbody>
                <For each={systems}>
                  {(s) => (
                    <tr>
                      <td class="text-main">{s.system}</td>
                      <td>
                        {s.missRate.toFixed(1)}% ±{s.missRateError.toFixed(1)}
                      </td>
                      <td class="text-right text-sub">{s.rounds} rounds</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <div>
            <h3 class="pb-2 text-xl text-sub">by pace caret</h3>
            <div class="pb-2 text-sm text-sub">
              weakspot rounds, logged from 16 Nov 2026 on
            </div>
            <Show
              when={carets.length > 0}
              fallback={<div class="text-sub">none yet</div>}
            >
              <table class="w-full">
                <tbody>
                  <For each={carets}>
                    {(c) => (
                      <tr>
                        <td class="text-main">{c.group}</td>
                        <td>{c.wpm.toFixed(0)} wpm</td>
                        <td>
                          {c.missRate.toFixed(1)}% ±{c.missRateError.toFixed(1)}
                        </td>
                        <td class="text-right text-sub">{c.rounds} rounds</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </div>
        </section>

        <section>
          <h3 class="pb-2 text-xl text-sub">normal tests (weakspot off)</h3>
          <Show
            when={normalTests.length > 0}
            fallback={
              <div class="text-sub">
                none yet: a few 60 s tests with weakspot off show whether the
                drills carry over
              </div>
            }
          >
            <table class="w-full">
              <tbody>
                <For each={normalTests}>
                  {(r) => (
                    <tr>
                      <td class="text-sub">
                        {new Date(r.t).toLocaleString("sv")}
                      </td>
                      <td>
                        {r.mode} {r.mode2}
                      </td>
                      <td class="text-main">{r.wpm.toFixed(0)} wpm</td>
                      <td>{r.acc}%</td>
                      <td class="text-right text-sub">
                        raw {r.rawWpm.toFixed(0)}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        </section>
      </Show>
    </div>
  );
}
