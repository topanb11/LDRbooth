export interface Theme {
  id: string;
  name: string;
  /**
   * Path to a background image, relative to the site root.
   * `null` means no image — a plain white background.
   */
  imagePath: string | null;
}

// Preset background overlays for the final downloaded photo strip.
// To add a new one: drop an image into client/assets/themes/ and add an
// entry here — the dropdown and the compositor both read from this list.
export const THEMES: Theme[] = [
  { id: "default", name: "Default (White)", imagePath: null },
  { id: "pastel-pink", name: "Pastel Pink", imagePath: "/assets/themes/pastel-pink.svg" },
  { id: "retro-film", name: "Retro Film", imagePath: "/assets/themes/retro-film.svg" },
  { id: "starry-night", name: "Starry Night", imagePath: "/assets/themes/starry-night.svg" },
  { id: "downtown", name: "Downtown", imagePath: "/assets/themes/downtown.jpeg" },
];

export const DEFAULT_THEME_ID = "default";
