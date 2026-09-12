import type { ClientMessage, ServerMessage, SignalPayload } from "./types.js";
import { state, ICE_SERVERS, TOTAL_SLOTS } from "./state.js";
import { remoteVideo, statusLabel, btnSnap } from "./dom.js";

let pendingIceCandidates: RTCIceCandidateInit[] = [];

export function connectSocket(code: string, onMessage: (msg: ServerMessage) => void): void {
  // A reconnect must not leave an old socket delivering stale signaling.
  state.ws?.close();
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}/ws/${code}`);
  state.ws = ws;

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data) as ServerMessage;
    onMessage(msg);
  });

  ws.addEventListener("close", () => {
    if (state.ws === ws) {
      state.ws = null;
      statusLabel.textContent = "Disconnected.";
    }
  });
}

/** Dispose peer-specific state while preserving the user's local camera stream. */
export function resetPeerConnection(): void {
  pendingIceCandidates = [];
  if (state.pc) {
    state.pc.onicecandidate = null;
    state.pc.ontrack = null;
    state.pc.close();
  }
  state.pc = null;
  state.peerConnected = false;
  remoteVideo.srcObject = null;
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
    remoteVideo.srcObject = event.streams[0] ?? null;
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
    await addPendingIceCandidates(pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendMessage({ type: "signal", data: { kind: "answer", sdp: answer } });
  } else if (data.kind === "answer" && data.sdp) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    await addPendingIceCandidates(pc);
  } else if (data.kind === "ice-candidate" && data.candidate) {
    // ICE candidates can arrive before the offer/answer. Queue them instead
    // of rejecting the connection on reconnects or slower networks.
    if (!pc.remoteDescription) {
      pendingIceCandidates.push(data.candidate);
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.warn("Failed to add ICE candidate", err);
    }
  }
}

async function addPendingIceCandidates(pc: RTCPeerConnection): Promise<void> {
  const candidates = pendingIceCandidates;
  pendingIceCandidates = [];
  for (const candidate of candidates) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn("Failed to add queued ICE candidate", err);
    }
  }
}
