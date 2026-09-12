import { state, TOTAL_SLOTS } from "./state.js";
import { THEMES, type Theme } from "./themes.js";
import { btnDownloadGif, btnDownloadVideo, clipExportStatus, clipStrip } from "./dom.js";
import { formatDate } from "./composite.js";

const CELL_W = 300;
const CELL_H = 225;
const GAP = 12;
const PADDING = 20;
const TITLE_H = 60;
const DATE_H = 40;
const WIDTH = PADDING * 2 + CELL_W * 2 + GAP;
const HEIGHT = PADDING * 2 + CELL_H * TOTAL_SLOTS + GAP * (TOTAL_SLOTS - 1) + TITLE_H + DATE_H;
const CLIP_DURATION_MS = 3_000;

let previewUrls: string[] = [];
const backgroundCache = new Map<string, Promise<HTMLImageElement>>();

function currentTheme(): Theme {
  return THEMES.find((theme) => theme.id === state.selectedThemeId) ?? THEMES[0];
}

export async function renderClipStrip(): Promise<void> {
  clearClipStrip();
  clipStrip.style.backgroundImage = currentTheme().imagePath ? `url("${currentTheme().imagePath}")` : "none";
  const title = document.createElement("div");
  title.className = "clip-strip-title";
  title.textContent = "digibooth";
  clipStrip.appendChild(title);

  const ready: Promise<void>[] = [];
  for (let row = 0; row < TOTAL_SLOTS; row++) {
    ready.push(appendPreviewCell(state.clipsHost[row]));
    ready.push(appendPreviewCell(state.clipsGuest[row]));
  }
  const date = document.createElement("div");
  date.className = "clip-strip-date";
  date.textContent = state.sessionDate ? formatDate(state.sessionDate) : "";
  clipStrip.appendChild(date);
  await Promise.all(ready);
}

function appendPreviewCell(clip: Blob | null): Promise<void> {
  const cell = document.createElement("div");
  cell.className = "clip-cell";
  if (clip) {
    const video = document.createElement("video");
    const url = URL.createObjectURL(clip);
    previewUrls.push(url);
    video.src = url;
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    cell.appendChild(video);
    clipStrip.appendChild(cell);
    return waitForPreview(video).then(() => video.play().catch(() => undefined));
  } else {
    const unavailable = document.createElement("span");
    unavailable.textContent = "Clip unavailable";
    cell.appendChild(unavailable);
  }
  clipStrip.appendChild(cell);
  return Promise.resolve();
}

function waitForPreview(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(done, 2_000);
    function done(): void {
      window.clearTimeout(timeout);
      resolve();
    }
    video.addEventListener("loadeddata", done, { once: true });
    video.addEventListener("error", done, { once: true });
  });
}

export function clearClipStrip(): void {
  for (const url of previewUrls) URL.revokeObjectURL(url);
  previewUrls = [];
  clipStrip.replaceChildren();
  clipStrip.style.backgroundImage = "";
  clipExportStatus.textContent = "";
}

export function initClipExportButtons(): void {
  btnDownloadVideo.addEventListener("click", async () => {
    await exportWithStatus("Preparing video…", "Video ready.", async () => {
      const { blob, extension } = await createVideoStrip();
      downloadBlob(blob, `digibooth-clips-${dateStamp()}.${extension}`);
    });
  });

  btnDownloadGif.addEventListener("click", async () => {
    await exportWithStatus("Preparing GIF — this can take a little while…", "GIF ready.", async () => {
      const blob = await createGifStrip();
      downloadBlob(blob, `digibooth-clips-${dateStamp()}.gif`);
    });
  });
}

async function exportWithStatus(start: string, done: string, work: () => Promise<void>): Promise<void> {
  btnDownloadVideo.disabled = true;
  btnDownloadGif.disabled = true;
  clipExportStatus.textContent = start;
  try {
    await work();
    clipExportStatus.textContent = done;
  } catch (err) {
    console.error(err);
    clipExportStatus.textContent = err instanceof Error ? err.message : "Could not export the moving strip.";
  } finally {
    btnDownloadVideo.disabled = false;
    btnDownloadGif.disabled = false;
  }
}

async function createVideoStrip(): Promise<{ blob: Blob; extension: "webm" | "mp4" }> {
  if (typeof MediaRecorder === "undefined") throw new Error("This browser cannot export video.");
  const { canvas, videos, cleanup } = await createComposition();
  const stream = canvas.captureStream(30);
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((value) =>
    MediaRecorder.isTypeSupported(value)
  );
  if (!mime) {
    cleanup();
    throw new Error("This browser does not support video export.");
  }

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) chunks.push(event.data);
  });
  const finished = new Promise<Blob>((resolve) => {
    recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: mime })), { once: true });
  });

  try {
    recorder.start();
    await playAndDraw(videos, (elapsed) => drawStripFrame(canvas, videos, elapsed));
    recorder.stop();
    return { blob: await finished, extension: mime.includes("mp4") ? "mp4" : "webm" };
  } finally {
    if (recorder.state !== "inactive") recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
    cleanup();
  }
}

async function createGifStrip(): Promise<Blob> {
  const { canvas, videos, cleanup } = await createComposition();
  const encoder = new GifEncoder(WIDTH, HEIGHT);
  const frames = 24;
  try {
    for (let frame = 0; frame < frames; frame++) {
      const time = (frame / frames) * (CLIP_DURATION_MS / 1000);
      await Promise.all(videos.map((video) => seek(video, time)));
      drawStripFrame(canvas, videos, frame * (CLIP_DURATION_MS / frames));
      encoder.addFrame(canvas.getContext("2d")!.getImageData(0, 0, WIDTH, HEIGHT), 13);
      // Let the browser paint export status between expensive GIF frames.
      await nextFrame();
    }
    return encoder.finish();
  } finally {
    cleanup();
  }
}

async function createComposition(): Promise<{ canvas: HTMLCanvasElement; videos: HTMLVideoElement[]; cleanup: () => void }> {
  const blobs = state.clipsHost.concat(state.clipsGuest);
  if (blobs.some((blob) => !blob)) throw new Error("One or more countdown clips could not be recorded.");

  const videos: HTMLVideoElement[] = [];
  const urls: string[] = [];
  // Arrange the sources in row-major host/guest order, matching the strip.
  for (let row = 0; row < TOTAL_SLOTS; row++) {
    for (const blob of [state.clipsHost[row], state.clipsGuest[row]]) {
      const video = document.createElement("video");
      const url = URL.createObjectURL(blob!);
      urls.push(url);
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      videos.push(video);
    }
  }
  await Promise.all(videos.map(waitForVideo));
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  return {
    canvas,
    videos,
    cleanup: () => {
      videos.forEach((video) => video.pause());
      urls.forEach((url) => URL.revokeObjectURL(url));
    },
  };
}

function waitForVideo(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    video.addEventListener("loadeddata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("A countdown clip could not be read.")), { once: true });
  });
}

async function playAndDraw(videos: HTMLVideoElement[], draw: (elapsed: number) => Promise<void>): Promise<void> {
  await Promise.all(videos.map((video) => video.play().catch(() => undefined)));
  const started = performance.now();
  await new Promise<void>((resolve) => {
    const tick = async () => {
      const elapsed = performance.now() - started;
      await draw(Math.min(elapsed, CLIP_DURATION_MS));
      if (elapsed >= CLIP_DURATION_MS) resolve();
      else requestAnimationFrame(() => void tick());
    };
    void tick();
  });
}

async function drawStripFrame(canvas: HTMLCanvasElement, videos: HTMLVideoElement[], _elapsed: number): Promise<void> {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  await drawBackground(ctx);
  ctx.fillStyle = "#ff5da2";
  ctx.font = "bold 32px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("digibooth", WIDTH / 2, PADDING + 32);
  videos.forEach((video, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const x = PADDING + col * (CELL_W + GAP);
    const y = PADDING + TITLE_H + row * (CELL_H + GAP);
    ctx.fillStyle = "#eeeeee";
    ctx.fillRect(x, y, CELL_W, CELL_H);
    if (video.videoWidth && video.videoHeight) drawCover(ctx, video, x, y, CELL_W, CELL_H);
  });
  const theme = currentTheme();
  ctx.fillStyle = theme.textColor ?? "#333333";
  ctx.font = "20px sans-serif";
  ctx.fillText(dateStamp("."), WIDTH / 2, HEIGHT - PADDING + 8);
}

async function drawBackground(ctx: CanvasRenderingContext2D): Promise<void> {
  const theme = currentTheme();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (!theme.imagePath) return;
  const image = await loadImage(theme.imagePath);
  ctx.drawImage(image, 0, 0, WIDTH, HEIGHT);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = backgroundCache.get(src);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The selected theme could not be loaded."));
    image.src = src;
  });
  backgroundCache.set(src, pending);
  return pending;
}

function drawCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, x: number, y: number, w: number, h: number): void {
  const source = image as HTMLVideoElement;
  const sourceWidth = source.videoWidth;
  const sourceHeight = source.videoHeight;
  const scale = Math.max(w / sourceWidth, h / sourceHeight);
  const sw = w / scale;
  const sh = h / scale;
  // Match the mirrored selfie orientation used by the live camera and stills.
  ctx.save();
  ctx.translate(x + w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(image, (sourceWidth - sw) / 2, (sourceHeight - sh) / 2, sw, sh, 0, y, w, h);
  ctx.restore();
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.02) return Promise.resolve();
  return new Promise((resolve) => {
    video.addEventListener("seeked", () => resolve(), { once: true });
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.01));
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function dateStamp(separator = "-"): string {
  const date = new Date();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}${separator}${mm}${separator}${dd}`;
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** A compact, dependency-free animated GIF encoder using a fixed 3-3-2 palette. */
class GifEncoder {
  private readonly parts: Uint8Array[] = [];

  constructor(width: number, height: number) {
    this.pushText("GIF89a");
    this.pushU16(width);
    this.pushU16(height);
    this.pushByte(0xf7); // global 256-colour table
    this.pushByte(0);
    this.pushByte(0);
    const palette = new Uint8Array(256 * 3);
    for (let i = 0; i < 256; i++) {
      palette[i * 3] = i & 0xe0;
      palette[i * 3 + 1] = (i & 0x1c) << 3;
      palette[i * 3 + 2] = (i & 0x03) << 6;
    }
    this.parts.push(palette);
    // Netscape loop extension: repeat forever.
    this.parts.push(new Uint8Array([0x21, 0xff, 0x0b, ...textBytes("NETSCAPE2.0"), 0x03, 0x01, 0, 0, 0]));
  }

  addFrame(image: ImageData, delayCs: number): void {
    this.parts.push(new Uint8Array([0x21, 0xf9, 0x04, 0x04, delayCs & 0xff, delayCs >> 8, 0, 0]));
    this.parts.push(new Uint8Array([0x2c, 0, 0, 0, 0, image.width & 0xff, image.width >> 8, image.height & 0xff, image.height >> 8, 0]));
    const indexed = new Uint8Array(image.width * image.height);
    for (let pixel = 0, out = 0; pixel < image.data.length; pixel += 4, out++) {
      const alpha = image.data[pixel + 3] / 255;
      const r = Math.round(image.data[pixel] * alpha + 255 * (1 - alpha));
      const g = Math.round(image.data[pixel + 1] * alpha + 255 * (1 - alpha));
      const b = Math.round(image.data[pixel + 2] * alpha + 255 * (1 - alpha));
      indexed[out] = (r & 0xe0) | ((g & 0xe0) >> 3) | ((b & 0xc0) >> 6);
    }
    this.parts.push(new Uint8Array([8]));
    const compressed = lzw(indexed);
    for (let offset = 0; offset < compressed.length; offset += 255) {
      const block = compressed.subarray(offset, Math.min(offset + 255, compressed.length));
      this.parts.push(new Uint8Array([block.length]), block);
    }
    this.parts.push(new Uint8Array([0]));
  }

  finish(): Blob {
    this.parts.push(new Uint8Array([0x3b]));
    // TypeScript's newer typed-array generics are stricter than the browser
    // Blob constructor; every part here is an ordinary immutable byte array.
    return new Blob(this.parts as unknown as BlobPart[], { type: "image/gif" });
  }

  private pushByte(value: number): void {
    this.parts.push(new Uint8Array([value]));
  }

  private pushU16(value: number): void {
    this.parts.push(new Uint8Array([value & 0xff, value >> 8]));
  }

  private pushText(value: string): void {
    this.parts.push(textBytes(value));
  }
}

function lzw(data: Uint8Array): Uint8Array {
  const clear = 256;
  const end = 257;
  let nextCode = 258;
  let codeSize = 9;
  let dictionary = new Map<string, number>();
  const output: number[] = [];
  let bits = 0;
  let bitCount = 0;
  const write = (code: number) => {
    bits |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      output.push(bits & 0xff);
      bits >>= 8;
      bitCount -= 8;
    }
  };
  const reset = () => {
    dictionary = new Map();
    nextCode = 258;
    codeSize = 9;
  };
  write(clear);
  let phrase = String(data[0]);
  for (let i = 1; i < data.length; i++) {
    const value = data[i];
    const combined = `${phrase},${value}`;
    const known = dictionary.get(combined);
    if (known !== undefined) {
      phrase = String(known);
      continue;
    }
    write(Number(phrase));
    if (nextCode < 4096) {
      dictionary.set(combined, nextCode++);
      if (nextCode === 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      write(clear);
      reset();
    }
    phrase = String(value);
  }
  write(Number(phrase));
  write(end);
  if (bitCount) output.push(bits & 0xff);
  return new Uint8Array(output);
}

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
