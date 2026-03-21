# LinguaLens

LinguaLens is a hackathon-friendly Chrome extension MVP that captures the active tab's audio, streams it to Deepgram for live transcription, and renders the transcript as a floating subtitle overlay on the current page.

## What This MVP Does

- Captures audio from the active Chrome tab
- Streams audio to Deepgram over WebSocket
- Shows live interim transcript updates
- Shows final transcript updates
- Renders subtitles directly on the current webpage

## What It Does Not Do Yet

- Translation
- Language filtering
- Language detection
- Transcript history
- Persisted settings

## Files

- `manifest.json`: MV3 manifest
- `background.js`: service worker that coordinates the session
- `offscreen.html`: offscreen document shell
- `offscreen.js`: audio capture and Deepgram live transcription
- `popup.html`: extension popup UI
- `popup.js`: popup controls
- `content.js`: floating subtitle overlay
- `styles.css`: subtitle styling
- `.env`: local runtime config for the Deepgram key

## Setup

1. Open `.env`.
2. Replace `REPLACE_WITH_YOUR_DEEPGRAM_API_KEY` with your real Deepgram API key.
3. Open Chrome and go to `chrome://extensions`.
4. Enable `Developer mode`.
5. Click `Load unpacked`.
6. Select this folder.

## How To Run

1. Open a tab that is actively playing spoken audio.
2. Click the LinguaLens extension icon.
3. Press `Start`.
4. Grant any Chrome permissions if prompted.
5. Watch the subtitle overlay appear near the bottom of the page.
6. Press `Stop` to end capture and remove the overlay.

## Testing Notes

- This MVP only captures the current active tab's audio.
- If nothing appears, check:
  - the page console
  - the service worker console
  - the offscreen document console
- The extension uses `MediaRecorder` with WebM/Opus audio chunks for simplicity.
- Depending on the page and Chrome version, tab-audio capture behavior can vary slightly.

## Debugging

- Popup logs: right-click the popup and inspect it
- Service worker logs: open the extension details page, then inspect the service worker
- Content script logs: inspect the active webpage
- Offscreen logs: inspect extension pages from Chrome's extension debugging tools

## TODO

- Move the Deepgram API key into a safer configuration flow
- Add transcript buffering for smoother multi-sentence captions
- Add language selection and detection
- Add translation
- Add a better session state model for popup updates
- Add reconnection logic for transient WebSocket failures

## Practical MV3 Notes

This MVP uses a background service worker plus an offscreen document because long-running media capture and WebSocket work are not a good fit for a service worker alone. The service worker gets the tab capture stream ID, and the offscreen document turns that into a real media stream for recording and transcription.

## Deepgram Key Location

The Deepgram API key lives in `.env` at the root of the extension:

```env
DEEPGRAM_API_KEY=your_real_key_here
```

You can also use `.env.example` as a template.
