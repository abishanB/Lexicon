const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const sourceLanguageSelect = document.getElementById("sourceLanguage");
const captionSizeInput = document.getElementById("captionSize");
const captionOpacityInput = document.getElementById("captionOpacity");
const captionSizeValue = document.getElementById("captionSizeValue");
const captionOpacityValue = document.getElementById("captionOpacityValue");
const textColorSelect = document.getElementById("textColor");
const positionSelect = document.getElementById("position");
const fontStyleSelect = document.getElementById("fontStyle");
const textShadowSelect = document.getElementById("textShadow");
const DEFAULT_SETTINGS = {
  sourceLanguage: "fr",
  captionSize: 24,
  captionOpacity: 84,
  textColor: "white",
  position: "bottom",
  fontStyle: "normal",
  textShadow: "none"
};

startBtn.addEventListener("click", async () => {
  setStatus("Starting transcription...");

  try {
    const response = await chrome.runtime.sendMessage({ type: "START_CAPTURE" });

    if (!response?.ok) {
      throw new Error(response?.error || "Failed to start capture");
    }

    updateFromState(response.state);
  } catch (error) {
    console.error("[LexiconAI] Start failed", error);
    setStatus(`Error: ${error.message}`);
  }
});

stopBtn.addEventListener("click", async () => {
  setStatus("Stopping transcription...");

  try {
    const response = await chrome.runtime.sendMessage({ type: "STOP_CAPTURE" });

    if (!response?.ok) {
      throw new Error(response?.error || "Failed to stop capture");
    }

    updateFromState(response.state);
  } catch (error) {
    console.error("[LexiconAI] Stop failed", error);
    setStatus(`Error: ${error.message}`);
  }
});

sourceLanguageSelect.addEventListener("change", handleSettingsChange);
captionSizeInput.addEventListener("input", handleSettingsChange);
captionOpacityInput.addEventListener("input", handleSettingsChange);
textColorSelect.addEventListener("change", handleSettingsChange);
positionSelect.addEventListener("change", handleSettingsChange);
fontStyleSelect.addEventListener("change", handleSettingsChange);
textShadowSelect.addEventListener("change", handleSettingsChange);

refreshState();
loadSettings();

async function refreshState() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    updateFromState(response?.state);
  } catch (error) {
    console.error("[LexiconAI] Failed to load state", error);
    setStatus("Unable to load extension state");
  }
}

function updateFromState(state) {
  if (!state) {
    setStatus("Idle");
    return;
  }

  if (state.lastError) {
    setStatus(`Error: ${state.lastError}`);
    return;
  }

  if (state.isRecording) {
    const languageNames = {
      "fr": "French",
      "ja": "Japanese",
      "es": "Spanish",
      "de": "German"
    };
    const selectedLanguage = languageNames[state.selectedSourceLanguage] || "French";
    setStatus(`Recording ${selectedLanguage} audio and streaming to Deepgram`);
    return;
  }

  setStatus("Idle");
}

function setStatus(text) {
  statusEl.textContent = text;
}

async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
    const settings = {
      sourceLanguage: stored.sourceLanguage || DEFAULT_SETTINGS.sourceLanguage,
      captionSize: Number(stored.captionSize) || DEFAULT_SETTINGS.captionSize,
      captionOpacity: Number(stored.captionOpacity) || DEFAULT_SETTINGS.captionOpacity,
      textColor: stored.textColor || DEFAULT_SETTINGS.textColor,
      position: stored.position || DEFAULT_SETTINGS.position,
      fontStyle: stored.fontStyle || DEFAULT_SETTINGS.fontStyle,
      textShadow: stored.textShadow || DEFAULT_SETTINGS.textShadow
    };

    sourceLanguageSelect.value = settings.sourceLanguage;
    captionSizeInput.value = String(settings.captionSize);
    captionOpacityInput.value = String(settings.captionOpacity);
    textColorSelect.value = settings.textColor;
    positionSelect.value = settings.position;
    fontStyleSelect.value = settings.fontStyle;
    textShadowSelect.value = settings.textShadow;
    updateSettingsLabels(settings);
  } catch (error) {
    console.error("[LexiconAI] Failed to load settings", error);
    updateSettingsLabels(DEFAULT_SETTINGS);
  }
}

async function handleSettingsChange() {
  const settings = {
    sourceLanguage: sourceLanguageSelect.value,
    captionSize: Number(captionSizeInput.value),
    captionOpacity: Number(captionOpacityInput.value),
    textColor: textColorSelect.value,
    position: positionSelect.value,
    fontStyle: fontStyleSelect.value,
    textShadow: textShadowSelect.value
  };

  updateSettingsLabels(settings);

  try {
    await chrome.storage.local.set(settings);
  } catch (error) {
    console.error("[LexiconAI] Failed to save settings", error);
  }
}

function updateSettingsLabels(settings) {
  captionSizeValue.textContent = `${settings.captionSize}px`;
  captionOpacityValue.textContent = `${settings.captionOpacity}%`;
}
