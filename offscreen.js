const DEEPGRAM_URL =
  // Use Deepgram multilingual streaming so each finalized segment can be routed by dominant language.
  "wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&interim_results=true&smart_format=true&endpointing=100";
const MEDIA_RECORDER_TIMESLICE_MS = 100;

let mediaStream = null;
let mediaRecorder = null;
let deepgramSocket = null;
let keepAliveTimer = null;
let currentTabId = null;
let finalTranscript = "";
let interimTranscript = "";
let deepgramApiKey = "";
let playbackAudio = null;
let playbackStream = null;
let segmentCounter = 0;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== "offscreen") {
    return false;
  }

  if (message.type === "OFFSCREEN_START") {
    startOffscreenCapture(message)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error("[LexiconAI] Offscreen start failed", error);
        chrome.runtime.sendMessage({
          type: "OFFSCREEN_ERROR",
          error: error.message || "Offscreen start failed"
        });
        sendResponse({
          ok: false,
          error: error.message || "Offscreen start failed"
        });
      });
    return true;
  }

  if (message.type === "OFFSCREEN_STOP") {
    stopOffscreenCapture()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error("[LexiconAI] Offscreen stop failed", error);
        sendResponse({
          ok: false,
          error: error.message || "Offscreen stop failed"
        });
      });
    return true;
  }

  return false;
});

async function startOffscreenCapture({ streamId, tabId }) {
  if (!streamId) {
    throw new Error("Missing stream ID");
  }

  deepgramApiKey = await loadDeepgramApiKey();

  if (!deepgramApiKey) {
    throw new Error("Set DEEPGRAM_API_KEY in the extension .env file");
  }

  if (mediaRecorder || deepgramSocket) {
    console.log("[LexiconAI] Session already exists, resetting before restart");
    await stopOffscreenCapture();
  }

  currentTabId = tabId;
  finalTranscript = "";
  interimTranscript = "";
  segmentCounter = 0;

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  console.log("[LexiconAI] Got media stream", mediaStream);
  startLocalPlayback(mediaStream);

  deepgramSocket = new WebSocket(DEEPGRAM_URL, ["token", deepgramApiKey]);

  deepgramSocket.onopen = () => {
    console.log("[LexiconAI] Deepgram socket opened");
    startKeepAlive();
    startRecorder();

    chrome.runtime.sendMessage({
      type: "OFFSCREEN_STATUS",
      status: "recording",
      tabId: currentTabId
    });
  };

  deepgramSocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleDeepgramMessage(data);
    } catch (error) {
      console.error("[LexiconAI] Failed to parse Deepgram event", error);
    }
  };

  deepgramSocket.onerror = (event) => {
    console.error("[LexiconAI] Deepgram socket error", event);
    chrome.runtime.sendMessage({
      type: "OFFSCREEN_ERROR",
      error: "Deepgram WebSocket error"
    });
  };

  deepgramSocket.onclose = (event) => {
    console.log("[LexiconAI] Deepgram socket closed", event.code, event.reason);
    stopKeepAlive();
  };
}

function startRecorder() {
  const mimeType = getSupportedMimeType();

  if (!mimeType) {
    throw new Error("This browser does not support a usable audio MediaRecorder mime type");
  }

  mediaRecorder = new MediaRecorder(mediaStream, {
    mimeType,
    audioBitsPerSecond: 128000
  });

  mediaRecorder.ondataavailable = async (event) => {
    if (!event.data || event.data.size === 0) {
      return;
    }

    if (!deepgramSocket || deepgramSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    const arrayBuffer = await event.data.arrayBuffer();
    deepgramSocket.send(arrayBuffer);
  };

  mediaRecorder.onerror = (event) => {
    console.error("[LexiconAI] MediaRecorder error", event.error);
    chrome.runtime.sendMessage({
      type: "OFFSCREEN_ERROR",
      error: event.error?.message || "MediaRecorder error"
    });
  };

  mediaRecorder.onstop = () => {
    console.log("[LexiconAI] MediaRecorder stopped");
  };

  mediaRecorder.start(MEDIA_RECORDER_TIMESLICE_MS);
  console.log("[LexiconAI] MediaRecorder started with mime type", mimeType);
}

function handleDeepgramMessage(data) {
  console.log("[LexiconAI] Deepgram event", data);

  if (data.type === "Results") {
    const alternative = data.channel?.alternatives?.[0];
    const transcript = alternative?.transcript || "";
    const detectedLanguage = getDominantLanguage(alternative);

    if (!transcript.trim()) {
      return;
    }

    if (data.is_final) {
      finalTranscript = transcript.trim();
      interimTranscript = "";
      emitTranscript(finalTranscript, true, detectedLanguage);
      return;
    }

    interimTranscript = transcript.trim();
    emitTranscript(interimTranscript, false, detectedLanguage);
    return;
  }

  if (data.type === "Metadata") {
    console.log("[LexiconAI] Deepgram metadata received");
    return;
  }

  if (data.type === "UtteranceEnd") {
    return;
  }
}

function emitTranscript(text, isFinal, language) {
  const normalizedText = (text || "").trim();

  if (!normalizedText) {
    return;
  }

  segmentCounter += 1;

  chrome.runtime.sendMessage({
    type: "TRANSCRIPT_UPDATE",
    tabId: currentTabId,
    text: normalizedText,
    isFinal,
    segmentId: segmentCounter,
    language: language || ""
  });
}

async function stopOffscreenCapture() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  mediaRecorder = null;

  if (deepgramSocket && deepgramSocket.readyState === WebSocket.OPEN) {
    try {
      deepgramSocket.send(JSON.stringify({ type: "CloseStream" }));
    } catch (error) {
      console.warn("[LexiconAI] Failed to send Deepgram close message", error);
    }
  }

  if (deepgramSocket) {
    try {
      deepgramSocket.close();
    } catch (error) {
      console.warn("[LexiconAI] Failed to close Deepgram socket", error);
    }
  }

  deepgramSocket = null;
  stopKeepAlive();

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
  }

  mediaStream = null;
  stopLocalPlayback();
  currentTabId = null;
  finalTranscript = "";
  interimTranscript = "";
  segmentCounter = 0;

  await chrome.runtime.sendMessage({
    type: "OFFSCREEN_STATUS",
    status: "stopped"
  });
}

function startKeepAlive() {
  stopKeepAlive();

  keepAliveTimer = setInterval(() => {
    if (deepgramSocket && deepgramSocket.readyState === WebSocket.OPEN) {
      deepgramSocket.send(JSON.stringify({ type: "KeepAlive" }));
    }
  }, 10000);
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

function getSupportedMimeType() {
  const mimeTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus"
  ];

  return mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function startLocalPlayback(stream) {
  stopLocalPlayback();

  playbackStream = new MediaStream(stream.getAudioTracks());
  playbackAudio = new Audio();
  playbackAudio.srcObject = playbackStream;
  playbackAudio.autoplay = true;
  playbackAudio.muted = false;

  const playPromise = playbackAudio.play();

  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch((error) => {
      console.warn("[LexiconAI] Local playback could not start", error);
    });
  }
}

function stopLocalPlayback() {
  if (playbackAudio) {
    playbackAudio.pause();
    playbackAudio.srcObject = null;
  }

  if (playbackStream) {
    playbackStream.getTracks().forEach((track) => track.stop());
  }

  playbackAudio = null;
  playbackStream = null;
}

async function loadDeepgramApiKey() {
  if (deepgramApiKey) {
    return deepgramApiKey;
  }

  const envUrl = chrome.runtime.getURL(".env");
  const response = await fetch(envUrl);

  if (!response.ok) {
    throw new Error("Could not read .env file from extension bundle");
  }

  const envText = await response.text();
  const parsed = parseEnv(envText);
  return parsed.DEEPGRAM_API_KEY || "";
}

function parseEnv(source) {
  const result = {};
  const lines = source.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function getDominantLanguage(alternative) {
  if (!alternative) {
    return "";
  }

  if (Array.isArray(alternative.languages) && alternative.languages.length > 0) {
    return alternative.languages[0] || "";
  }

  const words = Array.isArray(alternative.words) ? alternative.words : [];

  if (words.length === 0) {
    return "";
  }

  const counts = {};

  for (const word of words) {
    const language = word.language || "";

    if (!language) {
      continue;
    }

    counts[language] = (counts[language] || 0) + 1;
  }

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}
