"""
LDRbooth backend.

Responsibilities:
- Create/track rooms (max 2 participants each).
- Relay WebRTC signaling messages (offer/answer/ICE) between the two peers.
- Keep both peers' photobooth "slot" (which of the 4 photo rows is active)
  in lock-step, so a snap taken by either person happens for both at once.

No image data ever passes through the server: each browser captures both its
own local video frame *and* the peer's remote video frame (received via
WebRTC) locally, so both clients independently end up with the full set of
photos and can build the same final composite image.
"""
import json
import random
import string
from pathlib import Path
from typing import Dict, Optional, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent
CLIENT_DIR = BASE_DIR / "client"
DIST_DIR = CLIENT_DIR / "dist"

def ensure_frontend_built():
    if not (DIST_DIR / "main.js").exists():
        import subprocess
        print("dist/main.js not found. Automatically compiling TypeScript frontend...")
        try:
            subprocess.run(["npm", "install"], cwd=str(CLIENT_DIR), check=True)
            subprocess.run(["npm", "run", "build"], cwd=str(CLIENT_DIR), check=True)
            print("Frontend TypeScript compiled successfully!")
        except Exception as err:
            print(f"Warning: Could not auto-compile frontend TypeScript: {err}")

ensure_frontend_built()

TOTAL_SLOTS = 4  # 4 rows; combined with the 2 people that's a 2x4 grid

app = FastAPI(title="digibooth")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Room:
    def __init__(self, code: str):
        self.code = code
        self.connections: Dict[str, WebSocket] = {}  # "host" | "guest" -> ws
        self.current_slot = 0
        self.countdown_active = False
        self.acks_for_slot: Set[str] = set()

    @property
    def is_full(self) -> bool:
        return len(self.connections) >= 2

    @staticmethod
    def other_role(role: str) -> str:
        return "guest" if role == "host" else "host"


rooms: Dict[str, Room] = {}


def generate_room_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    # Avoid visually-ambiguous characters.
    alphabet = "".join(c for c in alphabet if c not in "0O1I")
    while True:
        code = "".join(random.choices(alphabet, k=5))
        if code not in rooms:
            return code


class CreateRoomResponse(BaseModel):
    code: str


@app.post("/api/rooms", response_model=CreateRoomResponse)
def create_room() -> CreateRoomResponse:
    code = generate_room_code()
    rooms[code] = Room(code)
    return CreateRoomResponse(code=code)


@app.get("/api/rooms/{code}")
def room_status(code: str) -> dict:
    room = rooms.get(code)
    if room is None:
        return {"exists": False}
    return {"exists": True, "players": len(room.connections), "full": room.is_full}


async def send_json(ws: WebSocket, payload: dict) -> None:
    await ws.send_text(json.dumps(payload))


async def broadcast(room: Room, payload: dict) -> None:
    for ws in list(room.connections.values()):
        try:
            await send_json(ws, payload)
        except Exception:
            pass


@app.websocket("/ws/{code}")
async def room_socket(websocket: WebSocket, code: str) -> None:
    await websocket.accept()

    room = rooms.get(code)
    if room is None:
        await send_json(websocket, {"type": "error", "message": "Room not found."})
        await websocket.close()
        return

    if room.is_full:
        await send_json(websocket, {"type": "error", "message": "Room is full."})
        await websocket.close()
        return

    role = "host" if "host" not in room.connections else "guest"
    room.connections[role] = websocket
    other_role = Room.other_role(role)

    await send_json(websocket, {"type": "role", "role": role})

    if other_role in room.connections:
        await send_json(websocket, {"type": "peer-joined"})
        await send_json(room.connections[other_role], {"type": "peer-joined"})

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "signal":
                target_ws = room.connections.get(other_role)
                if target_ws is not None:
                    await send_json(target_ws, {"type": "signal", "data": msg.get("data")})

            elif msg_type == "start-snap":
                if (
                    not room.countdown_active
                    and room.current_slot < TOTAL_SLOTS
                    and room.is_full
                ):
                    room.countdown_active = True
                    room.acks_for_slot = set()
                    await broadcast(room, {"type": "countdown-start", "slot": room.current_slot})

            elif msg_type == "photo-ack":
                slot = msg.get("slot")
                if slot == room.current_slot:
                    room.acks_for_slot.add(role)
                    if len(room.acks_for_slot) >= len(room.connections):
                        room.current_slot += 1
                        room.countdown_active = False
                        room.acks_for_slot = set()
                        if room.current_slot >= TOTAL_SLOTS:
                            await broadcast(room, {"type": "session-complete"})
                        else:
                            await broadcast(
                                room, {"type": "slot-advance", "slot": room.current_slot}
                            )

            elif msg_type == "restart-session":
                room.current_slot = 0
                room.countdown_active = False
                room.acks_for_slot = set()
                await broadcast(room, {"type": "session-reset"})

            elif msg_type == "leave":
                break

    except WebSocketDisconnect:
        pass
    finally:
        if room.connections.get(role) is websocket:
            del room.connections[role]
        remaining_ws = room.connections.get(other_role)
        if remaining_ws is not None:
            try:
                await send_json(remaining_ws, {"type": "peer-left"})
            except Exception:
                pass
        if not room.connections:
            rooms.pop(code, None)


# Serve the frontend last, so it doesn't shadow the /api and /ws routes above.
app.mount("/", StaticFiles(directory=str(CLIENT_DIR), html=True), name="client")
