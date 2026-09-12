export interface Theme {
  id: string;
  name: string;
  /**
   * Path to a background image, relative to the site root.
   * `null` means no image — a plain white background.
   */
  imagePath: string | null;
  /** Custom title color for the "digibooth" heading (defaults to pink). */
  titleColor?: string;
  /** Custom text color for the date stamp footer on the photo strip (defaults to dark grey #333333). */
  textColor?: string;
}

// Preset background overlays for the final downloaded photo strip.
export const THEMES: Theme[] = [
  { id: "default", name: "Default (White)", imagePath: null },
  { id: "pastel-pink", name: "Pastel Pink", imagePath: "/assets/themes/pastel-pink.svg" },
  { id: "ocean-wave", name: "Ocean Wave", imagePath: "/assets/themes/ocean-wave.svg", titleColor: "#e8fbff", textColor: "#006680" },
  { id: "film-strip", name: "Film Strip", imagePath: "/assets/themes/film-strip.svg", titleColor: "#ffffff", textColor: "#ffffff" },
  { id: "retro-film", name: "Retro Film", imagePath: "/assets/themes/retro-film.svg", titleColor: "#6b4226" },
  { id: "starry-night", name: "Starry Night", imagePath: "/assets/themes/starry-night.svg", titleColor: "#ffffff", textColor: "#ffffff" },
];

export const DEFAULT_THEME_ID = "default";
