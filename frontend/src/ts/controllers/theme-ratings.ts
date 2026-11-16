import { ThemeName } from "@monkeytype/schemas/configs";

import { setConfig } from "../config/setters";
import { Config } from "../config/store";
import { showNoticeNotification } from "../states/notifications";
import { getRandomTheme } from "../states/theme";
import { getDislikedThemes, setDislikedThemes } from "../states/theme-ratings";
import { randomizeTheme, refreshRandomThemeList } from "./theme-controller";

// Rating the theme random theme picked: thumbs-up adds it to the favourite
// themes, thumbs-down hides it from random theme for good and moves on.

/** The built-in theme random theme is showing, or null (off, or a custom theme). */
export function getRatableTheme(): ThemeName | null {
  if (Config.randomTheme === "off" || Config.randomTheme === "custom") {
    return null;
  }
  const name = getRandomTheme()?.name;
  if (name === undefined || name === "custom") return null;
  return name;
}

const display = (name: string): string => name.replace(/_/g, " ");

export function likeCurrentTheme(): void {
  const theme = getRatableTheme();
  if (theme === null) return;
  setDislikedThemes(getDislikedThemes().filter((t) => t !== theme));
  if (!Config.favThemes.includes(theme)) {
    setConfig("favThemes", [...Config.favThemes, theme]);
  }
  showNoticeNotification(`liked ${display(theme)}`);
}

export async function dislikeCurrentTheme(): Promise<void> {
  const theme = getRatableTheme();
  if (theme === null) return;
  setDislikedThemes([...getDislikedThemes(), theme]);
  if (Config.favThemes.includes(theme)) {
    setConfig(
      "favThemes",
      Config.favThemes.filter((t) => t !== theme),
    );
  }
  showNoticeNotification(`${display(theme)} won't come up again`);
  await refreshRandomThemeList();
  await randomizeTheme();
}

/** Lets a disliked theme come up again. */
export function undislikeTheme(name: string): void {
  setDislikedThemes(getDislikedThemes().filter((t) => t !== name));
  void refreshRandomThemeList();
}
