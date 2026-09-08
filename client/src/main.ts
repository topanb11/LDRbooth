import { state, resetState, TOTAL_SLOTS } from "./state.js";
import {
  inputCode,
  statusLabel,
  waitingOverlay,
  btnSnap,
  slotProgress,
  btnRestart,
  landingError,
} from "./dom.js";
import { showView } from "./views.js";
import { initLandingHandlers } from "./landing.js";
import { initSnapButton, initGridPlaceholders } from "./capture.js";
import { initThemeDropdown } from "./composite.js";
import { sendMessage } from "./connection.js";

initLandingHandlers();
initSnapButton();
initThemeDropdown();
initGridPlaceholders();

btnRestart.addEventListener("click", () => {
  sendMessage({ type: "leave" });
  state.ws?.close();
  state.pc?.close();
  state.localStream?.getTracks().forEach((t) => t.stop());

  resetState();

  inputCode.value = "";
  statusLabel.textContent = "Waiting for your partner…";
  waitingOverlay.classList.remove("hidden");
  btnSnap.disabled = true;
  slotProgress.textContent = `Photo 1 of ${TOTAL_SLOTS}`;
  initGridPlaceholders();
  landingError.textContent = "";
  showView("landing");
});
