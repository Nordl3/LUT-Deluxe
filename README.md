# LUT Deluxe Ultimate — Four-Voice Wavetable Studio

**Release 2.0.0 (local-test build)**. This is a fully local, dependency-free static web application. The release replaces the main page with a coherent four-channel design studio. The older LUT Deluxe 1.3 editor and all its original export tools are retained under **Classic Lab**.

## Start on Windows

Unzip the project and open Command Prompt **in the directory containing `index.html`**:

```cmd
py -m http.server 8000
```

If `py` is not available, use `python -m http.server 8000`. Open **http://localhost:8000** in your browser. Stop the server with Ctrl+C. Do not open the HTML directly from disk because JavaScript module imports require an HTTP origin.

## Studio overview

The four physical DAC channels are **unassigned instruments**. Scene labels are **editable roles**, not fixed outputs. There are 21 deliberately complementary four-output ensembles, including:

- **Harmonic Constellation** — root, just fifth, octave and upper halo.
- **Drawbar Architecture** — 16′, 8′, 5⅓′ and 4′ harmonic relationships.
- **Quadrature Orbit** — same oscillator frequency and shape, at 0°, 90°, 180° and 270° phase offsets.
- **Interleaved Harmonics** — four non-overlapping sets of partials, independently recombinable.
- **Four-Band Spectrum** — four non-overlapping harmonic regions, useful with downstream VCAs/filters/mixer.
- **Fifths & Sevenths** — tuning ratios 1:1, 5:4, 3:2 and 7:4.
- **Reese Conspiracy** — sub foundation and tightly detuned beating oscillators.
- **Vowel Quartet, Crystal Lattice, West Coast Laboratory, Pulse Mathematics, Strings in the Machine, Slow-Motion Galaxy** — additional complementary approaches.
- **Omni • Four voices** — the original Bass/Synth/Keys/Strings inspiration, just one scene.

Each channel has its own family, morph position, gain, relative frequency ratio, cycle phase, octave, semitone, detune, stereo position (browser only), digital low-pass, and level-motion depth/speed (browser only). Outputs are independent and designed to be mixed externally through VCAs and filters. The preview is a separate stereo simulation and **does not imply that the current hardware has new analogue VCAs or routing**.

The main studio includes a scope/spectrum/wavetable view, a four-lane patch mixer, a frequency keyboard, and four-way morph linkage modes: parallel, mirrored, staggered and quarter-cycle orbit.

## Advanced editors

- **Wave Editor** — freehand periodic waveform drawing, additive construction from 32 partial magnitudes and phases, plus waveform selection and shapers.
- **Evolution Lab** — independent start/end values for brightness, wavefold, formants, FM, pulse width, phase warp and saturation, interpolated into 8–128-frame banks. Frame sizes 256, 512, 1024 and 2048 samples.
- **Level management** — automatically restores full peak-to-peak swing after each generated waveform and compensates inter-frame level loss during playback. Optional DC-free peak-normalized and unprocessed modes remain available. Note that maximum Vpp does **not** guarantee the same RMS/loudness between timbres.
- **Audio resynthesis** — import supported audio files and extract periodic waveframes using an approximate supplied fundamental frequency. This is a starting point for wavetable editing, **not** a full pitch tracker or commercial resynthesis suite.
- **Projects** — save/import JSON with all four voice settings, editable partials, drawn waveforms, and imported frames. Browser-local autosave is also supported.

## Exports

- **Four-channel Teensy ZIP** — `.h` C++ banks, four little-endian `.bin` files, four per-transition amplitude-correction `.morph.f32` files, and a JSON manifest with role, phase, pitch-ratio and format metadata. Hardware ranges: 0–3090, 0–4095, or future 16-bit DAC 0–65535. Optional octave-dependent band-limited versions are available. See [ULTIMATE_BANK_FORMAT.md](ULTIMATE_BANK_FORMAT.md).
- **Serum/Vital-oriented wavetable ZIP** — four separate mono packed, 32-bit float WAV files, each containing consecutive 2048-sample frames. Serum-tagged export uses a `clm ` chunk. **Structure tested; import interpretation must still be verified in the actual synths.**
- **Audio WAV** — rendered stereo four-voice audition mix (3, 6 or 12 seconds).
- **Images** — selected wave as 1600×700 PNG or scalable SVG.
- **Classic Lab** — the original single-cycle Arduino TXT, PNG, LUT+PNG ZIP, WAV, PCM and 50 preset exports remain accessible via `classic.html`.

## Hardware boundaries

This release **does not include the new Teensy DDS playback firmware**. The existing V1.04 sketch cannot directly load the new multi-frame bank format, and independent ratios/phase for all DACs will not operate on the existing firmware. These changes are being designed for the future firmware using the existing Teensy 4.0 / two MCP4822 module first.

The current hardware has a shared RATE CV and the proposed browser preview has independently set frequency ratios. Hardware audio bandwidth, reliable 1V/oct tracking, DAC timing and anti-aliasing have **not** been bench-verified. Higher sample rates and multiband exports also consume substantial flash; check the actual Teensy 4.0 firmware/flash budget before use.

## Development and verification

Run `npm test` with Node.js 20+ to run the included waveform, bank, export, harmonic-complement and amplitude-compensation regression tests (29 tests at packaging). The original Classic Lab engine tests are retained. The build is pure HTML/CSS/JavaScript with no npm install step for end users.

Browser automation could not be executed in the restricted build environment because navigation was blocked by administrator policy. Verify the interface and audio/download flows with the local server above before publishing. The release is **not yet a production-verified firmware+hardware combination**.

To publish to [Nordl3/LUT-Deluxe](https://github.com/Nordl3/LUT-Deluxe), upload the extracted **contents** of this folder to the repository root after testing locally. `index.html` is now Ultimate Studio; `classic.html` remains the prior editor.
