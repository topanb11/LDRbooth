import type { CreateRoomResponse } from "./types.js";
import { btnCreate, btnJoin, inputCode, landingError } from "./dom.js";
import { enterRoom } from "./session.js";

export function initLandingHandlers(): void {
  btnCreate.addEventListener("click", async () => {
    clearError();
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      if (!res.ok) throw new Error("Could not create room.");
      const body = (await res.json()) as CreateRoomResponse;
      await enterRoom(body.code);
    } catch (err) {
      showError(errMsg(err));
    }
  });

  btnJoin.addEventListener("click", async () => {
    clearError();
    const code = inputCode.value.trim().toUpperCase();
    if (code.length !== 5) {
      showError("Room codes are 5 characters.");
      return;
    }
    try {
      const res = await fetch(`/api/rooms/${code}`);
      const body = await res.json();
      if (!body.exists) {
        showError("That room doesn't exist.");
        return;
      }
      if (body.full) {
        showError("That room is already full.");
        return;
      }
      await enterRoom(code);
    } catch (err) {
      showError(errMsg(err));
    }
  });
}

function showError(msg: string): void {
  landingError.textContent = msg;
}
function clearError(): void {
  landingError.textContent = "";
}
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
