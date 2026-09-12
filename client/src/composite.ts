import { state, TOTAL_SLOTS } from "./state.js";
import { finalCanvas, btnDownload, themeSelect } from "./dom.js";
import { THEMES, type Theme } from "./themes.js";

const CELL_W = 300;
const CELL_H = 225;
const GAP = 12;
const PADDING = 20;
const TITLE_H = 60;
const DATE_H = 40;

let photoDownloadUrl: string | null = null;

function currentTheme(): Theme {
  return THEMES.find((t) => t.id === state.selectedThemeId) ?? THEMES[0];
}

export function formatDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}.${mm}.${dd}`;
}

/** Draw the final strip completely before the result view is displayed. */
export async function finalizeSession(): Promise<void> {
  state.sessionDate = new Date();
  await renderFinalComposite();
}

/** Safely redraw the final strip when the selected theme changes. */
export async function renderFinalComposite(): Promise<void> {
  const width = PADDING * 2 + CELL_W * 2 + GAP;
  const height = PADDING * 2 + CELL_H * TOTAL_SLOTS + GAP * (TOTAL_SLOTS - 1) + TITLE_H + DATE_H;
  finalCanvas.width = width;
  finalCanvas.height = height;
  const ctx = finalCanvas.getContext("2d");
  if (!ctx) return;

  const theme = currentTheme();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  if (theme.imagePath) {
    try {
      const background = await loadImage(theme.imagePath);
      ctx.drawImage(background, 0, 0, width, height);
    } catch {
      // The plain white base above is a usable fallback if a theme asset fails.
    }
  }

  ctx.fillStyle = "#ff5da2";
  ctx.font = "bold 32px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("digibooth", width / 2, PADDING + 32);
  await drawPhotoCells(ctx);
  drawDateFooter(ctx);
  await updateDownloadLink();
}

async function drawPhotoCells(ctx: CanvasRenderingContext2D): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (let row = 0; row < TOTAL_SLOTS; row++) {
    jobs.push(drawCell(ctx, state.photosHost[row], 0, row));
    jobs.push(drawCell(ctx, state.photosGuest[row], 1, row));
  }
  await Promise.all(jobs);
}

async function drawCell(ctx: CanvasRenderingContext2D, url: string | null, col: number, row: number): Promise<void> {
  const x = PADDING + col * (CELL_W + GAP);
  const y = PADDING + TITLE_H + row * (CELL_H + GAP);
  ctx.fillStyle = "#eeeeee";
  ctx.fillRect(x, y, CELL_W, CELL_H);
  if (!url) return;
  try {
    const image = await loadImage(url);
    drawCover(ctx, image, x, y, CELL_W, CELL_H);
  } catch {
    // Preserve the placeholder rather than leaving the whole strip unrendered.
  }
}

function drawDateFooter(ctx: CanvasRenderingContext2D): void {
  if (!state.sessionDate) return;
  const gridBottom = PADDING + TITLE_H + CELL_H * TOTAL_SLOTS + GAP * (TOTAL_SLOTS - 1);
  const theme = currentTheme();
  ctx.fillStyle = theme.textColor ?? "#333333";
  ctx.font = "20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(formatDate(state.sessionDate), finalCanvas.width / 2, gridBottom + DATE_H / 2 + 8);
}

async function updateDownloadLink(): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => finalCanvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  if (photoDownloadUrl) URL.revokeObjectURL(photoDownloadUrl);
  photoDownloadUrl = URL.createObjectURL(blob);
  btnDownload.href = photoDownloadUrl;
  btnDownload.download = `digibooth-${new Date().toISOString().slice(0, 10)}.png`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be loaded."));
    image.src = src;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number): void {
  const imgRatio = img.width / img.height;
  const targetRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (imgRatio > targetRatio) {
    sw = img.height * targetRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / targetRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

export function initThemeDropdown(): void {
  themeSelect.innerHTML = "";
  for (const theme of THEMES) {
    const option = document.createElement("option");
    option.value = theme.id;
    option.textContent = theme.name;
    themeSelect.appendChild(option);
  }
  themeSelect.value = state.selectedThemeId;
  themeSelect.addEventListener("change", () => {
    state.selectedThemeId = themeSelect.value;
    void renderFinalComposite();
  });
}
