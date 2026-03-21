(function () {
  if (window.__linguaLensInjected) {
    return;
  }

  window.__linguaLensInjected = true;

  const OVERLAY_ID = "lingualens-overlay";

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) {
      return false;
    }

    if (message.type === "SHOW_OVERLAY") {
      ensureOverlay();
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "UPDATE_SUBTITLE") {
      updateSubtitle(message.text || "", Boolean(message.isFinal));
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "HIDE_OVERLAY") {
      hideOverlay();
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "SHOW_ERROR") {
      showError(message.error || "Unknown error");
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });

  ensureOverlay();

  function ensureOverlay() {
    if (document.getElementById(OVERLAY_ID)) {
      return;
    }

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "lingualens-overlay lingualens-hidden";
    overlay.innerHTML = `
      <div class="lingualens-caption" aria-live="polite">
        <span class="lingualens-text">Listening...</span>
      </div>
    `;

    document.documentElement.appendChild(overlay);
  }

  function updateSubtitle(text, isFinal) {
    const overlay = getOverlay();
    const textNode = overlay.querySelector(".lingualens-text");
    const caption = overlay.querySelector(".lingualens-caption");

    overlay.classList.remove("lingualens-hidden");
    textNode.textContent = text || "Listening...";
    caption.classList.toggle("lingualens-final", isFinal);
  }

  function showError(error) {
    const overlay = getOverlay();
    const textNode = overlay.querySelector(".lingualens-text");
    const caption = overlay.querySelector(".lingualens-caption");

    overlay.classList.remove("lingualens-hidden");
    caption.classList.remove("lingualens-final");
    caption.classList.add("lingualens-error");
    textNode.textContent = `LinguaLens error: ${error}`;
  }

  function hideOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);

    if (!overlay) {
      return;
    }

    overlay.remove();
  }

  function getOverlay() {
    ensureOverlay();
    const overlay = document.getElementById(OVERLAY_ID);
    const caption = overlay.querySelector(".lingualens-caption");
    caption.classList.remove("lingualens-error");
    return overlay;
  }
})();
