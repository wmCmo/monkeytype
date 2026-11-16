import { JSXElement, Show } from "solid-js";

import {
  dislikeCurrentTheme,
  getRatableTheme,
  likeCurrentTheme,
} from "../../../controllers/theme-ratings";
import { getThemeIndicator } from "../../../states/core";
import { Fa } from "../../common/Fa";

/**
 * Thumbs up / down for the theme random theme picked. Up adds it to the
 * favourites; down hides it from random theme and moves to the next one.
 */
export function ThemeRating(): JSXElement {
  // the indicator updates whenever the shown theme or the favourites change
  const theme = (): string | null => {
    getThemeIndicator();
    return getRatableTheme();
  };

  return (
    <Show when={theme()}>
      <div class="flex items-center">
        <button
          type="button"
          class="textButton"
          aria-label={
            getThemeIndicator().isFavorite
              ? "In your liked themes"
              : "Like this theme (adds it to favourites)"
          }
          data-balloon-pos="up"
          onClick={() => likeCurrentTheme()}
        >
          <Fa
            icon="fa-thumbs-up"
            fixedWidth
            class={getThemeIndicator().isFavorite ? "text-main" : undefined}
          />
        </button>
        <button
          type="button"
          class="textButton"
          aria-label="Dislike: never show this theme again"
          data-balloon-pos="up"
          onClick={() => void dislikeCurrentTheme()}
        >
          <Fa icon="fa-thumbs-down" fixedWidth />
        </button>
      </div>
    </Show>
  );
}
