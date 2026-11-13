# LUT Deluxe

**Design the wave. Shape the harmonics. Build an instrument.**

### [▶ LAUNCH LUT DELUXE — OPEN THE LIVE STUDIO](https://nordl3.github.io/LUT-Deluxe/)

LUT Deluxe is a browser-based waveform and wavetable design studio for synthesizer enthusiasts, sound designers and anyone who enjoys exploring what an oscillator can do. Create a single cycle, turn it into an evolving wavetable, hear it immediately, then export it for use elsewhere.

**No installation, account, DAW or plug-ins required.** Open the link and start making waves. Sound generation and editing run locally in your browser; your audio and projects aren't uploaded to a server.

It began as a waveform generator for a homemade **four-channel Teensy Eurorack module**, but the goal is broader: make interesting, playable sounds and useful wavetables for hardware, software synths and experiments that don't fit neatly into either category.

## Four voices. One bigger sound.

The **Ultimate Studio** treats four independent outputs as parts of one instrument. They can reinforce each other, occupy different parts of the spectrum, beat against each other, form chords or slowly evolve into something else entirely.

Start with one of **21 four-voice scenes**, then change anything you like:

| Scene | What the four voices do |
| --- | --- |
| **Drawbar Architecture** | Organ-inspired 16′, 8′, 5⅓′ and 4′ relationships. |
| **Interleaved Harmonics** | Different harmonic sets on each output, ready to be recombined. |
| **Four-Band Spectrum** | Split a tone into four spectral regions—ideal for separate VCAs and filters. |
| **Quadrature Orbit** | Four phase-related signals at 0°, 90°, 180° and 270°. |
| **Reese Conspiracy** | Sub-bass foundation and detuned, beating layers. |
| **Fifths & Sevenths** | Four voices using musical frequency ratios. |
| **Vowel Quartet** | Formant-rich tones that change character as they evolve. |
| **Omni · Four Voices** | Bass, synth, keys and strings working together. |

These are **starting points, not fixed channel assignments**. Rename the voices, swap their waveform families, adjust musical ratios and phase, or choose how their morph positions move together. The four outputs can be entirely different—or carefully related.

Imagine sending each output to its own VCA or filter, then mixing them back together. One patch can move from a simple fundamental to an enormous shifting harmonic texture without changing the source waveforms. The browser lets you audition the combination before you wire anything up.

## Make waves worth playing

- **Wave Editor:** Draw your own periodic waves, build them from 32 independently adjustable harmonic amplitudes and phases, and apply waveform shaping.
- **Evolution Lab:** Animate brightness, folding, formants, FM, pulse width, phase warping and saturation across an **8–128-frame** wavetable bank.
- **Complementary morphing:** Move four voices together, in mirrored pairs, in a staggered progression or in an offset orbit.
- **Automatic full-scale waveforms:** Generated waves are brought back to full peak-to-peak range after shaping, so a small edit doesn't mean another round of gain adjustment. Voice mixer levels remain separately adjustable.
- **Hear it as you work:** Audition the four-voice stereo mix with a browser keyboard, frequency control and animated morphing.
- **See what you're making:** Switch between waveform, harmonic spectrum and bank views, with waveform measurements alongside.
- **Audio resynthesis:** Import audio and extract periodic waveframes as starting material for new banks.
- **Save your work:** Export a project JSON and load it again later. The studio also keeps browser-local project state.

Maximum peak-to-peak level is not the same as equal perceived loudness: different waveforms can have very different RMS levels. LUT Deluxe exposes the waveform measurements instead of hiding that distinction.

## Try it

1. **[Open the live studio](https://nordl3.github.io/LUT-Deluxe/)** and choose a scene from **Scene Library**.
2. Press **Listen**. Select each DAC lane to hear how the four parts fit together.
3. Try different waveform families and frequency ratios in the **Voice Inspector**.
4. Open **Wave Editor** to sculpt a single wave, or **Evolution Lab** to develop a complete moving bank.
5. Head to **Export Studio** when you've made something worth keeping.

The **Classic Lab** is also available from the top bar. It retains the original LFO and oscillator editors, waveform presets and single-cycle export tools.

## Take your sounds somewhere else

| Export | What you get |
| --- | --- |
| **Teensy four-channel bank** | ZIP containing C++ headers, binary wave banks, morph-correction data and a project manifest. |
| **Serum / Vital-oriented wavetables** | Four packed mono floating-point WAV banks, using 2,048 samples per frame. |
| **Audio WAV** | A rendered stereo audition of the four-voice arrangement. |
| **PNG / SVG** | High-resolution waveform images for reference or sharing. |
| **Project JSON** | Editable project settings and waveform data for returning to the studio. |
| **Classic Lab exports** | Single-cycle Arduino LUT text, signed PCM, WAV, PNG and paired LUT/image ZIPs. |

The packed WAV exports are designed for wavetable-synth workflows. **Import behaviour has not yet been verified in every Serum/Vital version**, so check the resulting frames in your synth before relying on a bank in a finished project.

## The Eurorack connection

LUT Deluxe grew out of the [Teensy Morphing LFO](https://github.com/Nordl3/Teensy_Morphing_LFO): a homemade four-output Eurorack module with a Teensy microcontroller and two dual-channel DACs. The idea is to design useful control-voltage waves, then push further into musical audio-rate wavetables and sets of related oscillator voices.

The app is also useful **without that module**. Nothing needs to be connected to design, audition, save or export a waveform.

**Hardware compatibility note:** The Ultimate Studio's four-voice ratios, phase relationships and multi-frame banks are designed for a newer Teensy DDS firmware. They are **not directly playable by the original V1.04 firmware**. The analogue VCAs, filters and mixers shown as patching possibilities are external Eurorack equipment, not circuitry inside the existing module. The generated bank formats are documented in [ULTIMATE_BANK_FORMAT.md](ULTIMATE_BANK_FORMAT.md).

---

## Running it locally (optional)

The live version is the easiest way to use LUT Deluxe. To run a downloaded source copy, extract it, open Command Prompt in the folder containing `index.html`, and enter:

```cmd
py -m http.server 8000
```

Then open **http://localhost:8000**. If your Windows installation uses `python` instead of `py`, substitute `python` in the command. Press **Ctrl+C** to stop the server. Opening `index.html` directly from a `file://` path may prevent its JavaScript modules loading.

The project is ordinary HTML, CSS and JavaScript. No build step is needed for the website.

## Optional Windows desktop EXE

The **web version is the main release**. For those who prefer a standalone Windows window, the `desktop/` folder includes a Python/pywebview wrapper and a PyInstaller build script. This creates a local application window around the same interface; it isn't a separate sound engine or a VST plug-in.

With Python and its `py` launcher installed on Windows:

1. Download and extract the repository.
2. Run `desktop\build_windows.bat`.
3. The script installs its Python build dependencies and attempts to create `dist\LUTDeluxe.exe`.

This is an **optional, experimental build path**, not a prebuilt installer. It uses Microsoft Edge WebView2, and the resulting EXE and its file-save dialogs should be tested on the target Windows PC.

Developers can run the included JavaScript regression tests with `npm test` (Node.js 20+). The source is at [github.com/Nordl3/LUT-Deluxe](https://github.com/Nordl3/LUT-Deluxe).
