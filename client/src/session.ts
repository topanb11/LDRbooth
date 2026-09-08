import type { ServerMessage } from "./types.js";
import { state } from "./state.js";
import {
  roomCodeLabel,
  statusLabel,
  localVideo,
  remoteVideo,
  waitingOverlay,
  btnSnap,
  landingError,
} from "./dom.js";
import { showView } from "./views.js";
import {
  connectSocket,
  ensurePeerConnection,
  createAndSendOffer,
  handleSignal,
} from "./connection.js";
import { applyRoleLabels, runCountdownAndCapture, updateSlotProgress } from "./capture.js";
import { finalizeSession } from "./composite.js";

export async function enterRoom(code: string): Promise<void> {
  state.roomCode = code;
  roomCodeLabel.textContent = code;
  showView("room");

  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });
  } catch {
    showView("landing");
    landingError.textContent = "Camera access is required to use LDRbooth.";
    return;
  }
  localVideo.srcObject = state.localStream;

  connectSocket(code, (msg) => {
    handleServerMessage(msg).catch((err) => console.error(err));
  });
}

async function handleServerMessage(msg: ServerMessage): Promise<void> {
  switch (msg.type) {
    case "role": {
      state.role = msg.role ?? null;
      applyRoleLabels();
      break;
    }

    case "peer-joined": {
      statusLabel.textContent = "Partner connected — setting up video…";
      waitingOverlay.classList.add("hidden");
      await ensurePeerConnection();
      // Deterministic initiator: the host always makes the offer.
      if (state.role === "host") {
        await createAndSendOffer();
      }
      break;
    }

    case "signal": {
      if (msg.data) await handleSignal(msg.data);
      break;
    }

    case "peer-left": {
      state.peerConnected = false;
      statusLabel.textContent = "Your partner disconnected.";
      waitingOverlay.classList.remove("hidden");
      btnSnap.disabled = true;
      remoteVideo.srcObject = null;
      break;
    }

    case "countdown-start": {
      state.currentSlot = msg.slot ?? state.currentSlot;
      await runCountdownAndCapture(state.currentSlot);
      break;
    }

    case "slot-advance": {
      state.currentSlot = msg.slot ?? state.currentSlot;
      updateSlotProgress();
      btnSnap.disabled = !state.peerConnected;
      break;
    }

    case "session-complete": {
      finalizeSession();
      showView("result");
      break;
    }

    case "error": {
      alert(msg.message ?? "Something went wrong.");
      break;
    }
  }
}
