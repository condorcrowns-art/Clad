# Lunosia — Private Transcription

Transcribe any tab's audio, or your own microphone, **entirely on your own
machine**. No account, no API key, no upload. The audio is turned into text by a
speech model running inside your browser, and the text is stored in your
browser. Nothing is sent anywhere.

This is version 2 — a ground-up rebuild on Manifest V3 with a local Whisper
engine, a side-panel UI, editable transcripts, and five export formats.

---

## Why this exists in this form

Any browser extension can call `webkitSpeechRecognition` and get
speech-to-text in about three lines of code. It is free, it needs no model,
and it works immediately.

It also **streams your microphone to Google's servers**.

For a tool whose entire promise is privacy, that is not a shortcut — it is the
opposite of the product. So Lunosia does the harder thing: it ships an actual
speech model and runs it locally. `tools/validate.mjs` enforces this as a build
invariant; the check fails if `SpeechRecognition` ever appears in the source.

## What it does

- **Capture this tab** — meetings, lectures, videos, podcasts, calls. The tab
  keeps playing audibly while it is captured.
- **Capture your microphone** — dictation, voice notes, interviews.
- **Live transcript** with timestamps, appearing as you speak.
- **Click any line to correct it.** Edits save instantly.
- **Click a timestamp** to jump the video in the tab to that moment.
- **Search** within a transcript, with matches highlighted.
- **Export** to `.txt`, `.md`, `.srt`, `.vtt`, or `.json`.
- **Saved transcripts** persist locally, with rename and delete.
- **Speaker labels**, applied by hand, that survive into every export.
- Keyboard shortcut: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>.

## Install (unpacked)

```bash
npm run setup      # fetches the inference engine (~26 MB, pinned versions)
```

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this `lunosia/` folder
4. Pin Lunosia to the toolbar and click it — the side panel opens

`npm run setup` is a one-time step. The engine — `transformers.js` and the
onnxruntime `.wasm` — is third-party build output totalling ~26 MB, so it is
fetched from pinned npm versions rather than committed. It also keeps GitHub's
secret scanner quiet: it reads the string `Mistral3ForConditionalGeneration`
in the transformers.js model registry as a Mistral API key, which it is not.
The download is byte-reproducible; `--force` refreshes it.

If you were handed a zip of this extension, the engine is already inside it and
you can skip straight to step 1.

The first recording downloads the speech model once (~145 MB for the default
`base` model). After that it works with the network switched off entirely.

## The two engines

| | In-browser Whisper | Local server |
|---|---|---|
| Setup | none | run a server yourself |
| Speed | fast on a GPU, fair on CPU | fast |
| Accuracy | good | best — can run `large-v3` |
| Where audio goes | stays in the tab | stays on loopback (`127.0.0.1`) |

The in-browser engine uses WebGPU when your machine has it and falls back to
WASM otherwise; the panel tells you which one it picked.

For the server engine, point Lunosia at any OpenAI-compatible local endpoint —
[whisper.cpp](https://github.com/ggerganov/whisper.cpp) is the easiest:

```bash
./server -m models/ggml-large-v3.bin --port 8080
```

then set the URL in Settings to `http://127.0.0.1:8080/inference`.

## How it is put together

Manifest V3 forces the work across three contexts, because a service worker has
no DOM, cannot hold a `MediaStream`, and is killed whenever Chrome feels like
it. Each piece does the one thing its context permits:

```
  sidepanel.html ── src/panel.js         UI only: render, edit, search, export
         │                                 (closing it does not stop recording)
         │  chrome.runtime messages
         ▼
       sw.js                             router + capture lifecycle + state
         │                                 state in chrome.storage.session so a
         │  chrome.runtime messages        worker respawn loses nothing
         ▼
  offscreen.html ── offscreen.js         MediaStream, AudioContext @ 16 kHz
         │                                 tab audio is echoed back to the
         │  postMessage (transferable)     speakers so the tab stays audible
         ▼
  worker/asr-worker.js                   Whisper via transformers.js
         └── lib/ort/*.wasm                onnxruntime, vendored, never a CDN
```

**Segmentation is silence-driven, not fixed-window.** Cutting audio every N
seconds regardless of content slices words in half, and Whisper hallucinates
across the seam. Lunosia instead waits for a natural pause (450 ms below an
energy threshold), so every chunk handed to the model is a whole phrase. A
22-second ceiling stops an unbroken monologue from buffering forever, and a
250 ms pre-roll keeps the first consonant of each phrase from being clipped.

**Hallucinations are filtered.** Fed near-silence, Whisper reliably emits
"Thank you.", "Subtitles by the amara.org community", and single tokens
repeated to fill the window. Those are dropped rather than shown as speech.

## Development

```bash
npm test        # exporter unit tests — run in plain node, no browser
npm run validate # manifest, module graph, element ids, privacy invariants
npm run icons    # regenerate icons from source
npm run check    # both
```

The exporters are deliberately free of DOM and `chrome.*` so subtitle
formatting can be verified without a browser. The suite covers the case that
`00:00:01,1000` is not a legal SubRip timestamp — a rounding bug that corrupts
every cue after it, and one these tests caught during the rebuild.

`tools/validate.mjs` is the pre-flight check. Chrome reports extension problems
as one unhelpful red box after you have already clicked Load Unpacked; the
validator finds the usual causes first — a manifest pointing at a file that is
not there, an unresolvable import, an inline handler CSP will block, or an
element id `panel.js` reads that the HTML never declares.

## What it sends over the network

Two things, both optional and neither of them your audio:

1. **The model weights**, once, from Hugging Face. Cached by the browser
   afterwards; the extension then works fully offline.
2. **Nothing else.** There is no telemetry, no analytics, no error reporting,
   no account, and no server belonging to this project.

The `host_permissions` in the manifest list exactly the hosts that first
download can touch, plus loopback for the optional local server.

## Storage

Transcripts live in `chrome.storage.local` on this machine, one record per
session plus a small index so the list renders without deserialising every
transcript. Writes during a live recording are debounced. Settings → shows how
much space transcripts are using.

## Known limits

- Chrome refuses audio capture on `chrome://`, `edge://` and Web Store pages.
  That is a browser restriction, not a bug here.
- Diarisation is manual. Automatic speaker separation needs a second model and
  is not in this version.
- The `small` model is noticeably slow without a GPU; prefer the local server
  engine on older machines.
- Word-level timestamps come from Whisper and drift on long unbroken passages.

## Licence

Yours. Ship it.
