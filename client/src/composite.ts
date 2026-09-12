import { state, TOTAL_SLOTS } from "./state.js";
import { finalCanvas, btnDownload, themeSelect } from "./dom.js";
import { THEMES, type Theme } from "./themes.js";

const CELL_W = 300;
const CELL_H = 225;
const GAP = 12;
const PADDING = 20;
const TITLE_H = 60;
const DATE_H = 40;

let sessionDate: Date | null = null;

function currentTheme(): Theme {
  return THEMES.find((t) => t.id === state.selectedThemeId) ?? THEMES[0];
}

function formatDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}.${mm}.${dd}`;
}

/** Call once when the session finishes: stamps today's date on the strip and draws it. */
export function finalizeSession(): void {
  sessionDate = new Date();
  renderFinalComposite();
}

/** Redraws the final strip using the currently selected theme. */
export function renderFinalComposite(): void {
  const width = PADDING * 2 + CELL_W * 2 + GAP;
  const height = PADDING * 2 + CELL_H * TOTAL_SLOTS + GAP * (TOTAL_SLOTS - 1) + TITLE_H + DATE_H;
  finalCanvas.width = width;
  finalCanvas.height = height;
  const ctx = finalCanvas.getContext("2d");
  if (!ctx) return;

  const drawForeground = () => {
    drawTitle(ctx, width);
    drawPhotoCells(ctx);
  };
  const theme = currentTheme();
  if (theme.imagePath) {
    const background = new Image();
    background.onload = () => {
      ctx.drawImage(background, 0, 0, width, height);
      drawForeground();
    };
    background.onerror = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      drawForeground();
    };
    background.src = theme.imagePath;
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    drawForeground();
  }
}

function drawTitle(ctx: CanvasRenderingContext2D, width: number): void {
  ctx.fillStyle = "#ff5da2";
  ctx.font = "bold 32px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("digibooth", width / 2, PADDING + 32);
}

function drawPhotoCells(ctx: CanvasRenderingContext2D): void {
  let pending = TOTAL_SLOTS * 2;
  const done = () => {
    pending -= 1;
    if (pending === 0) {
      drawDateFooter(ctx);
      finalCanvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        btnDownload.href = url;
        btnDownload.download = `digibooth-${new Date().toISOString().slice(0, 10)}.png`;
      }, "image/png");
    }
  };

  const drawCell = (url: string | null, col: number, row: number) => {
    const x = PADDING + col * (CELL_W + GAP);
    const y = PADDING + TITLE_H + row * (CELL_H + GAP);
    ctx.fillStyle = "#eeeeee";
    ctx.fillRect(x, y, CELL_W, CELL_H);
    if (!url) {
      done();
      return;
    }
    const image = new Image();
    image.onload = () => {
      drawCover(ctx, image, x, y, CELL_W, CELL_H);
      done();
    };
    image.src = url;
  };

  for (let row = 0; row < TOTAL_SLOTS; row++) {
    drawCell(state.photosHost[row], 0, row);
    drawCell(state.photosGuest[row], 1, row);
  }
}

function drawDateFooter(ctx: CanvasRenderingContext2D): void {
  if (!sessionDate) return;
  const gridBottom = PADDING + TITLE_H + CELL_H * TOTAL_SLOTS + GAP * (TOTAL_SLOTS - 1);
  const theme = currentTheme();
  ctx.fillStyle = theme.textColor ?? "#333333";
  ctx.font = "20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(formatDate(sessionDate), finalCanvas.width / 2, gridBottom + DATE_H / 2 + 8);
}

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number): void {
  const imageRatio = image.width / image.height;
  const targetRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = image.width;
  let sh = image.height;
  if (imageRatio > targetRatio) {
    sw = image.height * targetRatio;
    sx = (image.width - sw) / 2;
  } else {
    sh = image.width / targetRatio;
    sy = (image.height - sh) / 2;
  }
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
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
    renderFinalComposite();
  });
}
