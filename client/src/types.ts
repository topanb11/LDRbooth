export type Role = "host" | "guest";

export type ServerMessageType =
  | "role"
  | "peer-joined"
  | "peer-left"
  | "signal"
  | "countdown-start"
  | "slot-advance"
  | "session-complete"
  | "session-reset"
  | "error";

export interface ServerMessage {
  type: ServerMessageType;
  role?: Role;
  data?: SignalPayload;
  slot?: number;
  message?: string;
}

export type ClientMessageType = "signal" | "start-snap" | "photo-ack" | "leave" | "restart-session";

export interface ClientMessage {
  type: ClientMessageType;
  data?: SignalPayload;
  slot?: number;
}

export interface SignalPayload {
  kind: "offer" | "answer" | "ice-candidate";
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface CreateRoomResponse {
  code: string;
}
