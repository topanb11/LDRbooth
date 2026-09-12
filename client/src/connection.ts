import type { ClientMessage, ServerMessage, SignalPayload } from "./types.js";
import { state, ICE_SERVERS, TOTAL_SLOTS } from "./state.js";
import { remoteVideo, statusLabel, btnSnap } from "./dom.js";

// Candidates occasionally arrive before an offer or answer finishes applying.
// Safari rejects that ordering, whereas Chromium browsers often tolerate it.
let pendingIceCandidates: RTCIceCandidateInit[] = [];
let iceCandidateQueue: Promise<void> = Promise.resolve();

export function connectSocket(code: string, onMessage: (msg: ServerMessage) => void): void {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}/ws/${code}`);
  state.ws = ws;

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data) as ServerMessage;
    onMessage(msg);
  });

  ws.addEventListener("close", () => {
    statusLabel.textContent = "Disconnected.";
  });
}

export function sendMessage(msg: ClientMessage): void {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(msg));
  }
}

export async function ensurePeerConnection(): Promise<RTCPeerConnection> {
  if (state.pc) return state.pc;

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  state.pc = pc;

  if (state.localStream) {
    for (const track of state.localStream.getTracks()) {
      pc.addTrack(track, state.localStream);
    }
  }

  pc.addEventListener("icecandidate", (event) => {
    if (event.candidate) {
      sendMessage({
        type: "signal",
        data: { kind: "ice-candidate", candidate: event.candidate.toJSON() },
      });
    }
  });

  pc.addEventListener("track", (event) => {
    if (isSafari()) {
      attachSafariRemoteTrack(event.track);
    } else {
      // Other browsers normally provide the negotiated stream. Retain a
      // track-built fallback for implementations that omit event.streams.
      remoteVideo.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      startRemoteVideo();
    }
  });

  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState === "connected") {
      state.peerConnected = true;
      statusLabel.textContent = "Connected! Ready when you are.";
      btnSnap.disabled = state.currentSlot >= TOTAL_SLOTS;
    } else if (
      pc.connectionState === "disconnected" ||
      pc.connectionState === "failed" ||
      pc.connectionState === "closed"
    ) {
      state.peerConnected = false;
      btnSnap.disabled = true;
    }
  });

  return pc;
}

function isSafari(): boolean {
  const ua = navigator.userAgent;
  return /safari/i.test(ua) && !/(chrome|chromium|crios|fxios|edg|opr|android)/i.test(ua);
}

function attachSafariRemoteTrack(track: MediaStreamTrack): void {
  // Give WebKit a freshly created stream containing only the received video
  // track. This avoids its inconsistent handling of the stream supplied on
  // the RTCTrackEvent.
  remoteVideo.muted = true;
  remoteVideo.autoplay = true;
  remoteVideo.playsInline = true;
  remoteVideo.setAttribute("playsinline", "");
  remoteVideo.setAttribute("webkit-playsinline", "");
  remoteVideo.srcObject = new MediaStream([track]);

  remoteVideo.addEventListener("loadedmetadata", startRemoteVideo, { once: true });
  // Some Safari versions do not dispatch loadedmetadata for an already-live
  // WebRTC track, so make a second playback attempt on the next task.
  window.setTimeout(startRemoteVideo, 0);
}

function startRemoteVideo(): void {
  remoteVideo.play().catch((err) => console.warn("Could not start partner video", err));
}

export async function createAndSendOffer(): Promise<void> {
  const pc = await ensurePeerConnection();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendMessage({ type: "signal", data: { kind: "offer", sdp: offer } });
}

export async function handleSignal(data: SignalPayload): Promise<void> {
  const pc = await ensurePeerConnection();

  if (data.kind === "offer" && data.sdp) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    await flushPendingIceCandidates(pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendMessage({ type: "signal", data: { kind: "answer", sdp: answer } });
  } else if (data.kind === "answer" && data.sdp) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    await flushPendingIceCandidates(pc);
  } else if (data.kind === "ice-candidate" && data.candidate) {
    if (!pc.remoteDescription) {
      pendingIceCandidates.push(data.candidate);
      return;
    }
    await addIceCandidate(pc, data.candidate);
  }
}

async function flushPendingIceCandidates(pc: RTCPeerConnection): Promise<void> {
  const queued = pendingIceCandidates;
  pendingIceCandidates = [];
  for (const candidate of queued) {
    await addIceCandidate(pc, candidate);
  }
}

function addIceCandidate(pc: RTCPeerConnection, candidate: RTCIceCandidateInit): Promise<void> {
  iceCandidateQueue = iceCandidateQueue
    .then(() => pc.addIceCandidate(new RTCIceCandidate(candidate)))
    .catch((err) => console.warn("Failed to add ICE candidate", err));
  return iceCandidateQueue;
}
