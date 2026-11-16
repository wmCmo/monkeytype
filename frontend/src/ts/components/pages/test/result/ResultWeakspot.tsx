import { Link } from "@tanstack/solid-router";
import { createMemo, For, JSXElement, Show } from "solid-js";

import { CompletedResult } from "../../../../states/test";
import {
  getCurrentSystem,
  getScoresSnapshot,
} from "../../../../test/weak-spot";
import { roundTargets, worstSequences } from "../../../../test/weak-spot-eval";
import { getLoggedKeystrokes } from "../../../../test/weak-spot-log";
import { cn } from "../../../../utils/cn";

type Props = {
  result: CompletedResult;
};

// a keystroke can land a little before the timer starts
const roundStartSlackMs = 500;

/**
 * After a weakspot round: which system picked the words, which of your
 * weakest letter pairs the round drilled, and how you did on each.
 */
export function ResultWeakspot(props: Props): JSXElement {
  const round = createMemo(() => {
    if (!props.result.funbox.includes("weakspot")) return null;
    const end = props.result.timestamp;
    const start = end - props.result.testDuration * 1000 - roundStartSlackMs;
    const keystrokes = getLoggedKeystrokes().filter(
      (k) => k[0] >= start && k[0] <= end,
    );
    const weakPairs = worstSequences(getScoresSnapshot()[2], {
      limit: 15,
    }).map((s) => s.sequence);
    return {
      system: getCurrentSystem(),
      targets: roundTargets(keystrokes, weakPairs),
    };
  });

  return (
    <Show when={round()}>
      {(r) => (
        <div class="mb-4 grid justify-center gap-1 text-center">
          <div class="text-sub">
            weakspot · <span class="text-text">{r().system}</span> ·{" "}
            <Link to="/weakspot">dashboard</Link>
          </div>
          <Show
            when={r().targets.length > 0}
            fallback={
              <div class="text-sub">none of your weakest pairs came up</div>
            }
          >
            <div class="flex flex-wrap justify-center gap-x-4 gap-y-1">
              <span class="text-sub">drilled</span>
              <For each={r().targets}>
                {(t) => (
                  <span>
                    <span class="text-main">{t.sequence}</span>{" "}
                    <span
                      class={cn("text-sub", { "text-error": t.misses > 0 })}
                    >
                      {t.attempts - t.misses}/{t.attempts}
                    </span>
                  </span>
                )}
              </For>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}
