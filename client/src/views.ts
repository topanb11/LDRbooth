import { viewLanding, viewRoom, viewResult } from "./dom.js";

export type ViewName = "landing" | "room" | "result";

export function showView(view: ViewName): void {
  viewLanding.classList.toggle("hidden", view !== "landing");
  viewRoom.classList.toggle("hidden", view !== "room");
  viewResult.classList.toggle("hidden", view !== "result");
}
