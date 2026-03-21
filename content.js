(function () {
  if (window.__linguaLensInjected) {
    return;
  }

  window.__linguaLensInjected = true;

  const OVERLAY_ID = "lingualens-overlay";
  const FINAL_SUBTITLE_HOLD_MS = 3000;
  let currentSegmentId = 0;
  let holdUntil = 0;

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
      updateSubtitle({
        originalText: message.originalText || "",
        translatedText: message.translatedText || "",
        isFinal: Boolean(message.isFinal),
        segmentId: Number(message.segmentId) || 0
      });
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
        <span class="lingualens-original">Listening...</span>
        <span class="lingualens-translation lingualens-hidden"></span>
      </div>
    `;

    document.documentElement.appendChild(overlay);
  }

  function updateSubtitle({ originalText, translatedText, isFinal, segmentId }) {
    if (segmentId && segmentId < currentSegmentId) {
      return;
    }

    if (!isFinal && Date.now() < holdUntil) {
      return;
    }

    if (segmentId) {
      currentSegmentId = segmentId;
    }

    const overlay = getOverlay();
    const originalNode = overlay.querySelector(".lingualens-original");
    const translationNode = overlay.querySelector(".lingualens-translation");
    const caption = overlay.querySelector(".lingualens-caption");

    overlay.classList.remove("lingualens-hidden");
    originalNode.textContent = originalText || "Listening...";
    caption.classList.toggle("lingualens-final", isFinal);

    if (isFinal && translatedText) {
      holdUntil = Date.now() + FINAL_SUBTITLE_HOLD_MS;
      translationNode.textContent = translatedText;
      translationNode.classList.remove("lingualens-hidden");
    } else {
      if (isFinal) {
        holdUntil = Date.now() + FINAL_SUBTITLE_HOLD_MS;
      }
      translationNode.textContent = "";
      translationNode.classList.add("lingualens-hidden");
    }
  }

  function showError(error) {
    const overlay = getOverlay();
    const originalNode = overlay.querySelector(".lingualens-original");
    const translationNode = overlay.querySelector(".lingualens-translation");
    const caption = overlay.querySelector(".lingualens-caption");

    overlay.classList.remove("lingualens-hidden");
    caption.classList.remove("lingualens-final");
    caption.classList.add("lingualens-error");
    originalNode.textContent = `LinguaLens error: ${error}`;
    translationNode.textContent = "";
    translationNode.classList.add("lingualens-hidden");
  }

  function hideOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);

    if (!overlay) {
      return;
    }

    currentSegmentId = 0;
    holdUntil = 0;
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
