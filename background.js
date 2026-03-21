const OFFSCREEN_PATH = "offscreen.html";
const TRANSLATION_API_URL = "http://localhost:8000/translate";
const TRANSLATION_ENABLED = true;

const state = {
  isRecording: false,
  tabId: null,
  lastTranscript: "",
  lastTranslation: "",
  lastError: "",
  createdAt: null,
  latestSegmentId: 0,
  translationCache: {},
  pendingTranslations: {}
};

chrome.runtime.onInstalled.addListener(() => {
  console.log("[LinguaLens] Extension installed");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  if (message.type === "START_CAPTURE") {
    startCapture()
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error("[LinguaLens] Failed to start capture", error);
        sendResponse({
          ok: false,
          error: error.message || "Failed to start capture"
        });
      });
    return true;
  }

  if (message.type === "STOP_CAPTURE") {
    stopCapture()
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error("[LinguaLens] Failed to stop capture", error);
        sendResponse({
          ok: false,
          error: error.message || "Failed to stop capture"
        });
      });
    return true;
  }

  if (message.type === "GET_STATE") {
    sendResponse({
      ok: true,
      state: getPublicState()
    });
    return false;
  }

  if (message.type === "OFFSCREEN_STATUS") {
    handleOffscreenStatus(message);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "TRANSCRIPT_UPDATE") {
    handleTranscriptUpdate(message);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "OFFSCREEN_ERROR") {
    handleOffscreenError(message);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (state.isRecording && state.tabId === tabId) {
    console.log("[LinguaLens] Active tab closed, stopping session");
    stopCapture().catch((error) => {
      console.error("[LinguaLens] Failed to stop after tab close", error);
    });
  }
});

async function startCapture() {
  if (state.isRecording) {
    return {
      ok: true,
      state: getPublicState(),
      message: "Capture already running"
    };
  }

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab || typeof tab.id !== "number") {
    throw new Error("No active tab found");
  }

  await ensureContentOverlay(tab.id);
  await ensureOffscreenDocument();

  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tab.id
  });

  state.isRecording = true;
  state.tabId = tab.id;
  state.lastTranscript = "";
  state.lastTranslation = "";
  state.lastError = "";
  state.createdAt = Date.now();
  state.latestSegmentId = 0;
  state.pendingTranslations = {};

  await sendMessageToTab(tab.id, { type: "SHOW_OVERLAY" });

  console.log("[LinguaLens] Starting offscreen capture", {
    tabId: tab.id,
    streamId
  });

  const offscreenResponse = await chrome.runtime.sendMessage({
    type: "OFFSCREEN_START",
    target: "offscreen",
    tabId: tab.id,
    streamId
  });

  if (!offscreenResponse?.ok) {
    state.isRecording = false;
    state.tabId = null;
    state.createdAt = null;
    throw new Error(offscreenResponse?.error || "Offscreen start failed");
  }

  return {
    ok: true,
    state: getPublicState()
  };
}

async function stopCapture() {
  if (!state.isRecording && !state.tabId) {
    return {
      ok: true,
      state: getPublicState(),
      message: "No active session"
    };
  }

  const activeTabId = state.tabId;

  try {
    await chrome.runtime.sendMessage({
      type: "OFFSCREEN_STOP",
      target: "offscreen"
    });
  } catch (error) {
    console.warn("[LinguaLens] Offscreen stop message failed", error);
  }

  if (typeof activeTabId === "number") {
    await sendMessageToTab(activeTabId, { type: "HIDE_OVERLAY" });
  }

  state.isRecording = false;
  state.tabId = null;
  state.lastTranscript = "";
  state.lastTranslation = "";
  state.lastError = "";
  state.createdAt = null;
  state.latestSegmentId = 0;
  state.pendingTranslations = {};

  return {
    ok: true,
    state: getPublicState()
  };
}

function handleOffscreenStatus(message) {
  console.log("[LinguaLens] Offscreen status", message.status);

  if (message.status === "stopped") {
    const tabId = state.tabId;
    state.isRecording = false;
    state.tabId = null;
    state.lastTranslation = "";
    state.createdAt = null;
    state.latestSegmentId = 0;
    state.pendingTranslations = {};

    if (typeof tabId === "number") {
      sendMessageToTab(tabId, { type: "HIDE_OVERLAY" }).catch((error) => {
        console.warn("[LinguaLens] Failed to hide overlay after stop", error);
      });
    }
  }
}

function handleTranscriptUpdate(message) {
  state.lastTranscript = message.text || "";
  state.latestSegmentId = Math.max(state.latestSegmentId, Number(message.segmentId) || 0);

  if (typeof state.tabId !== "number") {
    return;
  }

  const payload = {
    type: "UPDATE_SUBTITLE",
    originalText: message.text || "",
    translatedText: "",
    isFinal: Boolean(message.isFinal),
    segmentId: Number(message.segmentId) || 0
  };

  sendMessageToTab(state.tabId, payload).catch((error) => {
    console.warn("[LinguaLens] Failed to forward transcript", error);
  });

  if (!message.isFinal || !message.text || !TRANSLATION_ENABLED) {
    return;
  }

  translateFinalTranscript(message.text, payload.segmentId).catch((error) => {
    console.warn("[LinguaLens] Translation request failed", error);
  });
}

function handleOffscreenError(message) {
  console.error("[LinguaLens] Offscreen error", message.error);
  state.lastError = message.error || "Unknown error";
  state.isRecording = false;

  if (typeof state.tabId === "number") {
    sendMessageToTab(state.tabId, {
      type: "SHOW_ERROR",
      error: state.lastError
    }).catch((error) => {
      console.warn("[LinguaLens] Failed to show error on page", error);
    });
  }
}

function getPublicState() {
  return {
    isRecording: state.isRecording,
    tabId: state.tabId,
    lastTranscript: state.lastTranscript,
    lastTranslation: state.lastTranslation,
    lastError: state.lastError,
    createdAt: state.createdAt
  };
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    return;
  }

  console.log("[LinguaLens] Creating offscreen document");

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["USER_MEDIA"],
    justification: "Capture tab audio and stream it to Deepgram for live transcription."
  });
}

async function hasOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });

  return contexts.length > 0;
}

async function ensureContentOverlay(tabId) {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["styles.css"]
    });
  } catch (error) {
    console.warn("[LinguaLens] CSS injection warning", error);
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

async function sendMessageToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    console.warn("[LinguaLens] Tab message failed", { tabId, message, error });
    return null;
  }
}

async function translateFinalTranscript(originalText, segmentId) {
  const normalizedText = originalText.trim();

  if (!normalizedText) {
    return;
  }

  if (state.translationCache[normalizedText]) {
    state.lastTranslation = state.translationCache[normalizedText];
    await sendTranslatedSubtitle(normalizedText, state.lastTranslation, segmentId);
    return;
  }

  if (state.pendingTranslations[normalizedText]) {
    const translatedText = await state.pendingTranslations[normalizedText];
    state.lastTranslation = translatedText;
    await sendTranslatedSubtitle(normalizedText, translatedText, segmentId);
    return;
  }

  // Translation is isolated here so it can be disabled or swapped later without touching Deepgram flow.
  state.pendingTranslations[normalizedText] = requestTranslation(normalizedText);

  try {
    const translatedText = await state.pendingTranslations[normalizedText];

    if (!translatedText) {
      console.warn("[LinguaLens] Translation backend returned an empty response");
      return;
    }

    state.translationCache[normalizedText] = translatedText;
    state.lastTranslation = translatedText;
    await sendTranslatedSubtitle(normalizedText, translatedText, segmentId);
  } finally {
    delete state.pendingTranslations[normalizedText];
  }
}

async function sendTranslatedSubtitle(originalText, translatedText, segmentId) {
  if (typeof state.tabId !== "number") {
    return;
  }

  if (segmentId < state.latestSegmentId) {
    console.log("[LinguaLens] Skipping stale translation result", { segmentId, latest: state.latestSegmentId });
    return;
  }

  await sendMessageToTab(state.tabId, {
    type: "UPDATE_SUBTITLE",
    originalText,
    translatedText,
    isFinal: true,
    segmentId
  });
}

async function requestTranslation(text) {
  const response = await fetch(TRANSLATION_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    throw new Error(`Translation backend error: ${response.status}`);
  }

  const payload = await response.json();
  return (payload.translatedText || "").trim();
}
