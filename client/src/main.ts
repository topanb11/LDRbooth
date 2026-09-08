import { state, resetState } from "./state.js";
import { btnRestart } from "./dom.js";
import { initLandingHandlers } from "./landing.js";
import { initSnapButton, initGridPlaceholders } from "./capture.js";
import { initThemeDropdown } from "./composite.js";
import { sendMessage } from "./connection.js";

initLandingHandlers();
initSnapButton();
initThemeDropdown();
initGridPlaceholders();

btnRestart.addEventListener("click", () => {
  try {
    sendMessage({ type: "leave" });
    state.ws?.close();
    state.pc?.close();
    state.localStream?.getTracks().forEach((t) => t.stop());
  } catch (_) {}
  resetState();
  window.location.reload();
});
