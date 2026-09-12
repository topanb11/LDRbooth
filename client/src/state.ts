import type { Role } from "./types.js";
import { DEFAULT_THEME_ID } from "./themes.js";

export const TOTAL_SLOTS = 4; // 4 rows per person -> 2 columns x 4 rows = 8 photos total
export const COUNTDOWN_SECONDS = 3;
export const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export interface AppState {
  role: Role | null;
  roomCode: string | null;
  ws: WebSocket | null;
  pc: RTCPeerConnection | null;
  localStream: MediaStream | null;
  currentSlot: number;
  peerConnected: boolean;
  // Photos are always keyed by role, so the final grid layout (host left,
  // guest right) is identical no matter which browser renders it.
  photosHost: (string | null)[];
  photosGuest: (string | null)[];
  /** Timestamp stamped on the completed photo strip. */
  sessionDate: Date | null;
  selectedThemeId: string;
}

function freshState(): AppState {
  return {
    role: null,
    roomCode: null,
    ws: null,
    pc: null,
    localStream: null,
    currentSlot: 0,
    peerConnected: false,
    photosHost: new Array(TOTAL_SLOTS).fill(null),
    photosGuest: new Array(TOTAL_SLOTS).fill(null),
    sessionDate: null,
    selectedThemeId: DEFAULT_THEME_ID,
  };
}

export const state: AppState = freshState();

/** Resets every field in place, so other modules' `import { state }` binding stays valid. */
export function resetState(): void {
  Object.assign(state, freshState());
}
