# LUT Deluxe

**Version 1.1 — Waveform and workflow update**

**[▶ LAUNCH LUT DELUXE — OPEN THE LIVE WAVEFORM LAB](https://nordl3.github.io/LUT-Deluxe/)**

[GitHub Pages](https://nordl3.github.io/LUT-Deluxe/) · [Source repository](https://github.com/Nordl3/LUT-Deluxe)

LUT Deluxe is a browser-based waveform design laboratory for Teensy, Arduino, and audio-rate oscillators. It runs entirely in the browser, with no account, server-side processing, or Python installation. The web app is available offline after its assets have been cached by the browser.

## Features

- **LFO Mode:** Familiar sine, triangle, square, ramp up/down controls with modulation, phase, ramp steepness, square duty, modulation fades, and adjustable output range. It preserves the original Jupyter waveform generation calculations and per-table normalization.
- **Oscillator Lab:** Interactive X/Y warp handle, phase distortion, sync repeats, wavefolding, bend, saturation, optional DC removal, and pitch-dependent FFT band limiting.
- **Sound and analysis:** Live browser audio preview, keyboard, configurable repeat frequency, and harmonic spectrum.
- **Wavetable morphing:** Capture A and B and export interpolated multi-frame banks.
- **Exports:** Teensy/Arduino `const uint16_t name[LUT_SIZE]` LUTs (10 truncated integers per row), waveform PNG, matching TXT+PNG ZIP, signed PCM, WAV preview, and wavetable banks.
- **Presets:** 38 built-in sounds organized into LFO, wavefolding, sync, harmonic, and other categories, plus browser-local saves and JSON import/export. Numeric text inputs accompany sliders.
- **Pinned oscilloscope and section navigation:** Scope remains visible while scrolling through controls on desktop; quick links jump to shaping, audition, presets, exports and more.
- **Headroom options:** Auto (full-range LFO, peak-safe oscillator, coherent morph), Full Vpp, Audio Peak, and Bank Preserve. Oscillator audio processing reclaims unused peak headroom after shaping and filtering.
- **Download All:** One ZIP with matching Arduino LUT, waveform PNG, audio WAV, raw signed PCM, signed PCM text, and settings JSON. If A/B captures of matching length exist, wavetable frame TXT files are included too. Individual download formats remain available.

**Default state:** LFO Mode, sine core, 1 cycle/table, 0 phase, sine modulation at 0.25 cycles/table with 0 depth, 4096 samples, 12-bit output, DAC 0–3090, audio preview at 220 Hz, output prefix `myLUT`, and automatic headroom. Reset restores these settings.

## Publish on GitHub Pages

This repository is designed for **static GitHub Pages hosting**. Files belong at the repository root (the same folder as this README).

1. Upload the contents of this project (not a ZIP containing the files) to the [`Nordl3/LUT-Deluxe`](https://github.com/Nordl3/LUT-Deluxe) repository.
2. Open **Settings → Pages** in GitHub.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Choose the `main` branch and `/ (root)` folder, then save.
5. After GitHub reports that the site is published, use **[LUT Deluxe — live app](https://nordl3.github.io/LUT-Deluxe/)**.

The link at the top points to the expected GitHub Pages URL; it will work after the repository's Pages deployment is active. GitHub Pages serves `index.html` automatically, so the live URL does not need to end in `/index.html`.

## Run locally

Opening `index.html` via `file://` may block JavaScript module imports. Use a local web server instead:

```bash
python -m http.server 8000
```

Run that command in the folder containing `index.html`, then visit [http://localhost:8000](http://localhost:8000). Stop the server with Ctrl+C.

## Export notes

- The Arduino array includes the literal `[LUT_SIZE]`. Define `LUT_SIZE` in your sketch to match the number of exported samples.
- Each export increments a number in this browser's local storage. The paired ZIP and Download All ZIP contain matching `.txt` and `.png` basenames.
- Full-range headroom maps the minimum and maximum waveform samples to the configured DAC extremes; it can introduce a DC bias in asymmetric audio waves. Peak-safe headroom maximizes absolute peak without adding DC.
- In the normal Auto mode, a morph between captured waves is not renormalized at each frame, helping avoid unwanted amplitude pumping. Choose another headroom strategy explicitly if required.
- A WAV export is a two-second audition clip with beginning/end fades, whereas raw signed PCM contains a single-cycle wavetable.
- **Sampler mapping is a planned feature, not part of v1.1**. The WAV preview files are not yet pitched, loop-ready multisample libraries. SFZ instrument maps and Ableton-focused key/velocity export will be developed separately.
- Audio-rate distorted waves may alias. The available band-limit processing is tied to the chosen preview frequency and is **not** a replacement for a multi-resolution, pitch-aware wavetable bank.
- The optional `removeDc` checkbox affects Oscillator Lab; LFO mode keeps historical waveform scaling.
- Browser-local saved presets and export counts are not shared across devices. Use JSON import/export for portability.

## Optional Windows portable EXE

The `desktop/` directory contains an optional desktop wrapper based on `pywebview` and a Windows build script. The website is the primary distribution.

On Windows with Python installed, run `desktop/build_windows.bat` from an extracted copy of this project. It installs the required build packages and attempts to produce `dist/LUTDeluxe.exe` using PyInstaller.

The Windows wrapper uses Microsoft Edge WebView2 and a local-only HTTP server; the EXE and its download functionality should be tested on Windows before distribution. **No prebuilt EXE is included here.**

## Project files

| Path | Purpose |
|---|---|
| `index.html` | Web app interface and entry point |
| `styles.css` | Responsive dark-mode styling |
| `app.js` | Controls, audio preview, rendering, presets, and export UI |
| `engine.js` | Waveform maths and file encoders |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline/PWA files and icon |
| `.nojekyll` | Ensures direct static file handling on GitHub Pages |
| `desktop/` | Optional Windows build wrapper |
| `tests/` | Waveform engine unit tests |

To run the JavaScript tests with Node.js:

```bash
node --test tests/engine.test.mjs
```

No build step, npm install, API key, or third-party runtime service is required for the published web app.
