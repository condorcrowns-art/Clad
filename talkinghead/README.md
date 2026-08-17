# Talking Head

A single-page web app built on the open-source
[TalkingHead](https://github.com/met4citizen/TalkingHead) library by
**met4citizen**. It shows the project's ready-made female avatar (`brunette.glb`,
made with Ready Player Me) and lip-syncs her to **live microphone input**, to
**audio playback**, or to **typed text**.

Everything runs in the browser. There is no build step, no server code, and no
API keys.

```
talkinghead/
  index.html            page + import map (three.js and TalkingHead from jsDelivr)
  css/app.css
  js/config.js          avatar + TalkingHead options, all in one place
  js/audio-engine.js    the shared Web Audio graph (mic, playback, recording)
  js/lipsync-driver.js  spectrum → Oculus visemes, for audio with no transcript
  js/speech.js          browser speech synthesis + TalkingHead's viseme generation
  js/app.js             UI wiring
```

## Running it

ES modules and `getUserMedia` both need a real origin, so open it over HTTP
rather than as a `file://` path:

```bash
cd talkinghead
python3 -m http.server 8000
# then open http://localhost:8000/
```

`localhost` counts as a secure context, so the microphone works there. Anywhere
else, serve it over HTTPS or the browser will refuse to hand over the mic.

The first load pulls three.js, the TalkingHead module and the ~9 MB avatar from
jsDelivr, so it needs a network connection.

## The three modes

### Microphone (live)

The mouth is driven by the sound itself, because live audio comes with no
transcript to generate visemes from. Every frame, `lipsync-driver.js` looks at
where the energy sits in the spectrum and blends the Oculus visemes accordingly:

| Feature | Drives |
| --- | --- |
| loudness | how far the mouth and jaw open |
| energy around the first formant (~600–1300 Hz) | open vowels (`aa`, `E`) vs. closed (`I`, `O`, `U`) |
| energy around the second formant (~1500–3200 Hz) | front vowels (`I`, `E`) vs. back (`O`, `U`) |
| energy above ~4 kHz | sibilants (`SS`) |

The values are written to `head.mtAvatar[…].realtime`, which the library
documents as the way to drive blend shapes from a real-time source: it bypasses
the easing so the mouth tracks the input, and setting the values back to `null`
hands control straight back to TalkingHead's own idle animation. After about a
third of a second of silence the driver does exactly that, so the avatar goes
back to blinking and looking around on her own.

A running peak is used for automatic gain, so quiet laptop microphones and hot
audio files both work; the **sensitivity** and **smoothing** sliders adjust it
further. Microphone audio is analysed only — it is never routed to the speakers,
so there is no feedback loop.

### Playback

Pick any audio file the browser can decode (MP3, WAV, OGG, M4A…), or record a
clip from the microphone and play it back. Playback runs through the same
analyser and the same viseme driver as the live mode; the only difference is
that the audio is also sent to the speakers.

### Text

The Web Speech API provides the voice, and TalkingHead provides the mouth. The
avatar is put into streaming mode with `waitForAudioChunks: false` — documented
as "play lip-sync without audio" — and each word is handed to `streamAudio()`
with a timestamp as the synthesiser reaches it. The library's own English
lip-sync module turns those words into visemes, so the mouth shapes here are the
real thing rather than an approximation of them.

Some voices never emit boundary events. If none has arrived shortly after speech
starts, the whole utterance is scheduled up front from estimated word timings
instead.

The voice list is sorted with English and likely-female voices first, but every
installed voice is selectable. Which voices exist depends entirely on the
operating system and browser.

## Configuration

`js/config.js` holds the avatar and the TalkingHead constructor options. To use
a different model, point `AVATAR.url` at another GLB with a Mixamo-compatible
rig plus ARKit and Oculus viseme blend shapes (see Appendix A of the upstream
README) and set `body` to `'M'` or `'F'`.

The library version lives in two places that must agree: `TALKINGHEAD_VERSION`
in `config.js` and the `talkinghead` entry of the import map in `index.html`.

## Browser support

Chrome, Edge, Firefox and Safari on the desktop. WebGL2 is required. Text mode
needs speech synthesis with a voice installed; the tab reports it if there is
none. Recording needs `MediaRecorder`.

## Credits and licence

* [TalkingHead](https://github.com/met4citizen/TalkingHead) by met4citizen — MIT.
* The `brunette.glb` avatar was created with [Ready Player Me](https://readyplayer.me/)
  and is, per the upstream README, **free for non-commercial use under
  [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)**. Swap it for
  your own model before using this commercially.
* [three.js](https://threejs.org/) — MIT.
