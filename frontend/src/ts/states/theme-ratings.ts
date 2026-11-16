import { createSignal } from "solid-js";
import { z } from "zod";

import { LocalStorageWithSchema } from "../utils/local-storage-with-schema";

// Themes rated down while random theme was on: random theme skips them.
// Liked themes are the favourite themes (Config.favThemes), so they keep the
// star and work with random theme "fav". Stays in this browser.

const dislikedThemesLS = new LocalStorageWithSchema({
  key: "dislikedThemes",
  schema: z.array(z.string()),
  fallback: [],
});

const [getDislikedThemes, setDislikedThemesSignal] = createSignal<string[]>(
  dislikedThemesLS.get(),
);

export { getDislikedThemes };

export function isThemeDisliked(name: string): boolean {
  return getDislikedThemes().includes(name);
}

export function setDislikedThemes(names: string[]): void {
  const unique = [...new Set(names)];
  if (dislikedThemesLS.set(unique)) setDislikedThemesSignal(unique);
}
