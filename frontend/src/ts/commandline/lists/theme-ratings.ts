import {
  dislikeCurrentTheme,
  getRatableTheme,
  likeCurrentTheme,
} from "../../controllers/theme-ratings";
import { Command } from "../types";

// Keyboard versions of the footer's thumbs up / down for random themes.
export const ThemeRatingCommands: Command[] = [
  {
    id: "likeCurrentTheme",
    display: "Like current theme",
    alias: "thumbs up",
    fa: { icon: "fa-thumbs-up" },
    available: () => getRatableTheme() !== null,
    exec: likeCurrentTheme,
  },
  {
    id: "dislikeCurrentTheme",
    display: "Dislike current theme (never show again)",
    alias: "thumbs down",
    fa: { icon: "fa-thumbs-down" },
    available: () => getRatableTheme() !== null,
    exec: () => void dislikeCurrentTheme(),
  },
];
