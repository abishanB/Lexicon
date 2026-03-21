const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");

startBtn.addEventListener("click", async () => {
  setStatus("Starting transcription...");

  try {
    const response = await chrome.runtime.sendMessage({ type: "START_CAPTURE" });

    if (!response?.ok) {
      throw new Error(response?.error || "Failed to start capture");
    }

    updateFromState(response.state);
  } catch (error) {
    console.error("[LinguaLens] Start failed", error);
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
    console.error("[LinguaLens] Stop failed", error);
    setStatus(`Error: ${error.message}`);
  }
});

refreshState();

async function refreshState() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    updateFromState(response?.state);
  } catch (error) {
    console.error("[LinguaLens] Failed to load state", error);
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
    setStatus("Recording active tab audio and streaming to Deepgram");
    return;
  }

  setStatus("Idle");
}

function setStatus(text) {
  statusEl.textContent = text;
}
