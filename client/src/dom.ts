export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in DOM`);
  return el as T;
}

// Landing view
export const viewLanding = byId<HTMLElement>("view-landing");
export const btnCreate = byId<HTMLButtonElement>("btn-create");
export const btnJoin = byId<HTMLButtonElement>("btn-join");
export const inputCode = byId<HTMLInputElement>("input-code");
export const landingError = byId<HTMLParagraphElement>("landing-error");

// Room / capture view
export const viewRoom = byId<HTMLElement>("view-room");
export const roomCodeLabel = byId<HTMLElement>("room-code-label");
export const statusLabel = byId<HTMLElement>("status-label");
export const btnLeave = byId<HTMLButtonElement>("btn-leave");
export const localVideo = byId<HTMLVideoElement>("local-video");
export const remoteVideo = byId<HTMLVideoElement>("remote-video");
export const localVideoLabel = byId<HTMLElement>("local-video-label");
export const remoteVideoLabel = byId<HTMLElement>("remote-video-label");
export const waitingOverlay = byId<HTMLElement>("waiting-overlay");
export const countdownEl = byId<HTMLElement>("countdown");
export const btnSnap = byId<HTMLButtonElement>("btn-snap");
export const slotProgress = byId<HTMLElement>("slot-progress");
export const gridLeftLabel = byId<HTMLElement>("grid-left-label");
export const gridRightLabel = byId<HTMLElement>("grid-right-label");
export const gridLeft = byId<HTMLElement>("grid-left");
export const gridRight = byId<HTMLElement>("grid-right");

// Result view
export const viewResult = byId<HTMLElement>("view-result");
export const finalCanvas = byId<HTMLCanvasElement>("final-canvas");
export const clipStrip = byId<HTMLElement>("clip-strip");
export const btnDownload = byId<HTMLAnchorElement>("btn-download");
export const btnDownloadGif = byId<HTMLButtonElement>("btn-download-gif");
export const clipExportStatus = byId<HTMLParagraphElement>("clip-export-status");
export const btnRestart = byId<HTMLButtonElement>("btn-restart");
export const themeSelect = byId<HTMLSelectElement>("theme-select");
