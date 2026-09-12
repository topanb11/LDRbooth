import { state, TOTAL_SLOTS, COUNTDOWN_SECONDS } from "./state.js";
import {
  localVideo,
  remoteVideo,
  localVideoLabel,
  remoteVideoLabel,
  gridLeftLabel,
  gridRightLabel,
  gridLeft,
  gridRight,
  countdownEl,
  btnSnap,
  slotProgress,
} from "./dom.js";
import { sendMessage } from "./connection.js";

// The grid is always laid out host-left / guest-right, so both participants
// end up with an identical final image regardless of who is viewing.
export function applyRoleLabels(): void {
  if (state.role === "host") {
    localVideoLabel.textContent = "You";
    remoteVideoLabel.textContent = "Partner";
    gridLeftLabel.textContent = "You";
    gridRightLabel.textContent = "Partner";
  } else {
    localVideoLabel.textContent = "You";
    remoteVideoLabel.textContent = "Partner";
    gridLeftLabel.textContent = "Partner";
    gridRightLabel.textContent = "You";
  }
}

export function initSnapButton(): void {
  btnSnap.addEventListener("click", () => {
    btnSnap.disabled = true;
    sendMessage({ type: "start-snap" });
  });
}

export async function runCountdownAndCapture(slot: number): Promise<void> {
  btnSnap.disabled = true;
  countdownEl.classList.remove("hidden");

  // Record the exact countdown interval from both views. The browser keeps the
  // blobs locally; they are later composed into one animated strip.
  const localRecording = startRecording(state.localStream);
  const remoteRecording = startRecording(remoteVideo.srcObject as MediaStream | null);

  for (let n = COUNTDOWN_SECONDS; n >= 1; n--) {
    countdownEl.textContent = String(n);
    await sleep(1000);
  }
  countdownEl.classList.add("hidden");

  const localFrame = captureFrame(localVideo);
  const remoteFrame = remoteVideo.srcObject ? captureFrame(remoteVideo) : null;
  const [localClip, remoteClip] = await Promise.all([localRecording.stop(), remoteRecording.stop()]);

  if (state.role === "host") {
    state.photosHost[slot] = localFrame;
    state.photosGuest[slot] = remoteFrame;
    state.clipsHost[slot] = localClip;
    state.clipsGuest[slot] = remoteClip;
  } else {
    state.photosGuest[slot] = localFrame;
    state.photosHost[slot] = remoteFrame;
    state.clipsGuest[slot] = localClip;
    state.clipsHost[slot] = remoteClip;
  }

  renderGridThumbnail(slot);
  sendMessage({ type: "photo-ack", slot });
}

interface StreamRecording {
  stop(): Promise<Blob | null>;
}

function startRecording(stream: MediaStream | null): StreamRecording {
  if (!stream || typeof MediaRecorder === "undefined") return { stop: async () => null };

  const supportedMime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find(
    (mime) => MediaRecorder.isTypeSupported(mime)
  );
  if (!supportedMime) return { stop: async () => null };

  const chunks: BlobPart[] = [];
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: supportedMime, videoBitsPerSecond: 2_500_000 });
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    recorder.start();
  } catch (err) {
    console.warn("Could not record countdown clip", err);
    return { stop: async () => null };
  }

  return {
    stop: () =>
      new Promise((resolve) => {
        recorder.addEventListener(
          "stop",
          () => resolve(chunks.length ? new Blob(chunks, { type: supportedMime }) : null),
          { once: true }
        );
        if (recorder.state === "inactive") resolve(null);
        else recorder.stop();
      }),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function captureFrame(video: HTMLVideoElement): string {
  const canvas = document.createElement("canvas");
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  // Mirror horizontally to match what's shown on screen (selfie view).
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

export function updateSlotProgress(): void {
  const n = Math.min(state.currentSlot + 1, TOTAL_SLOTS);
  slotProgress.textContent = `Photo ${n} of ${TOTAL_SLOTS}`;
}

function renderGridThumbnail(slot: number): void {
  setThumb(gridLeft, slot, state.photosHost[slot]);
  setThumb(gridRight, slot, state.photosGuest[slot]);
  updateSlotProgress();
}

function setThumb(container: HTMLElement, slot: number, url: string | null): void {
  let cell = container.children[slot] as HTMLElement | undefined;
  if (!cell) {
    cell = document.createElement("div");
    cell.className = "thumb";
    container.appendChild(cell);
  }
  cell.innerHTML = "";
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    cell.appendChild(img);
  }
}

// Pre-populate the empty slot placeholders per column on load / restart.
export function initGridPlaceholders(): void {
  gridLeft.innerHTML = "";
  gridRight.innerHTML = "";
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    setThumb(gridLeft, i, null);
    setThumb(gridRight, i, null);
  }
}
