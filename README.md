# LexiconAI

Real-time AI-powered subtitles and translation for any browser tab.

LexiconAI is a Chrome extension that captures audio from your active tab, transcribes it live using **Deepgram Nova-2**, and translates finalized transcripts from French to English using **Argos Translate** — all in real time.

## How It Works

```
Tab Audio
  │
  ▼
Chrome tabCapture API ──► Offscreen Document
                              │
                              │  audio chunks every 250ms
                              ▼
                        Deepgram Nova-2 (WebSocket)
                              │
                              │  interim + final transcripts
                              ▼
                        Background Service Worker
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
            Interim results       Final results
            (show French)         (send to backend)
                                        │
                                        ▼
                                  FastAPI + Argos Translate
                                  (French → English, offline)
                                        │
                                        ▼
                                  Content Script
                                  (subtitle overlay on page)
```

## The AI

**Deepgram Nova-2** — A cloud-based end-to-end deep neural network for speech-to-text. Unlike traditional systems that process audio in stages (phonemes → words → grammar), Nova-2 converts raw audio waveforms directly to text, making it faster and more accurate. We use their streaming WebSocket API for sub-second latency.

**Argos Translate** — An open-source neural machine translation library built on the OpenNMT framework. It runs entirely locally — no cloud API, no extra cost, no data leaving the machine. The model translates finalized French transcripts to English through a local FastAPI backend.

## Features

- Live speech-to-text transcription via Deepgram streaming API
- Real-time French → English translation via Argos Translate
- Floating subtitle overlay rendered directly on the webpage
- Interim results update live as the AI refines its predictions
- Works on any tab playing audio (YouTube, meetings, podcasts, etc.)

## Prerequisites

- Google Chrome
- [Deepgram API key](https://deepgram.com) (free tier available)
- Python 3.9+

## Setup

### 1. Configure the Deepgram API key

Copy the example env file and add your key:

```bash
cp .env.example .env
```

Edit `.env` and replace the placeholder with your real Deepgram API key:

```env
DEEPGRAM_API_KEY=your_real_key_here
```

### 2. Set up the translation backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Install the Argos French → English model:

```bash
python -c "
from argostranslate import package
package.update_package_index()
pkg = next(p for p in package.get_available_packages()
           if p.from_code == 'fr' and p.to_code == 'en')
download_path = pkg.download()
package.install_from_path(download_path)
"
```

Start the backend:

```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### 3. Load the Chrome extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this project folder

## Usage

1. Open a tab playing spoken audio (e.g. a French YouTube video)
2. Click the **LexiconAI** extension icon in the toolbar
3. Press **Start**
4. Subtitles appear at the bottom of the page:
   - Interim results show the French transcript updating in real time
   - Final results show French + English translation side by side
5. Press **Stop** to end the session

## Architecture

| Component | File(s) | Role |
|-----------|---------|------|
| **Popup** | `popup.html`, `popup.js` | Start/Stop UI and status display |
| **Background** | `background.js` | Service worker that coordinates all components via Chrome message passing |
| **Offscreen Document** | `offscreen.html`, `offscreen.js` | Captures tab audio with MediaRecorder, streams to Deepgram over WebSocket |
| **Content Script** | `content.js`, `styles.css` | Injects floating subtitle overlay into the active webpage |
| **Translation Backend** | `backend/main.py` | FastAPI server running Argos Translate for French → English |
| **Config** | `manifest.json`, `.env` | Extension manifest (MV3) and API key configuration |

### Why an offscreen document?

Chrome Manifest V3 uses service workers for the background script, but service workers are ephemeral — Chrome can kill them at any time. Long-running tasks like audio capture and WebSocket connections would break. The offscreen document is a hidden page that stays alive to handle media work.

## Debugging

| What | How |
|------|-----|
| Popup logs | Right-click the popup → Inspect |
| Service worker logs | `chrome://extensions` → LexiconAI → "Inspect views: service worker" |
| Content script logs | Open DevTools (F12) on the active webpage |
| Offscreen document logs | `chrome://extensions` → inspect extension pages |
| Backend logs | Check the terminal running `uvicorn` |
| Backend health check | `GET http://localhost:8000/health` |

## Tech Stack

- **Chrome Extension** (Manifest V3) — JavaScript, HTML, CSS
- **Deepgram Nova-2** — real-time speech-to-text AI (cloud, WebSocket)
- **Argos Translate** — neural machine translation (local, Python)
- **FastAPI** — Python backend framework
- **MediaRecorder API** — browser audio capture (WebM/Opus)
