# LUT Deluxe V1.3: Teensy VCO bank format

This document is an implementation contract for a **future** DDS audio engine. The existing `Teensy_Morphing_LFO_V1_04.ino` does **not** understand these banks and has not been modified.

## Target assumptions

The current module uses a Teensy 4.0 with two dual MCP4822 12-bit DACs. Existing output conditioning and knob functions remain unchanged. This export system supports these targets:

| Profile | Data type | Output code range |
| --- | --- | --- |
| Original MCP4822 | `uint16_t` | 0..3090 |
| Full-range MCP4822 | `uint16_t` | 0..4095 |
| Future 16-bit DAC | `uint16_t` | 0..65535 |

The original 0..3090 range is retained as the **default** for the dedicated Teensy bank builder. These are DAC codes, not calibrated external output voltages.

## ZIP files

- `<name>_bank.h` — statically allocated C++ `uint16_t` array with dimensions `[band][frame][sample]`, band upper limits, and compile-time dimension metadata. It can be included by the future Teensy firmware.
- `<name>_bank.bin` — flat little-endian **unsigned 16-bit** samples in the same order; **no embedded header**. The JSON metadata is required to parse it.
- `<name>_bank.json` — format version, range, bank dimensions, sample rate, upper pitch of each band, etc.
- `READ_ME.txt` — quick per-export notes.

By default, frames = 16, samples/frame = 512, playback sample rate = 48,000 Hz. Band 0 is the unfiltered, full-spectrum frame. Additional bands are limited conservatively to the highest pitch in each band.

For a 48 kHz output rate, the 10 band maximum pitch values are:

`40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20000 Hz`.

For a pitch `f`, choose the **first filtered band** whose maximum is at least `f` (`index 1..10`), not index zero. Band zero is intended for LFOs, diagnostic comparison, or user-managed filtering.

When a pitch is above the highest exported band, use the last filtered band provisionally, but ensure the firmware clamps pitch to what the output sample rate and hardware can reproduce. A 20 kHz oscillator at 48 kHz is very close to Nyquist, and cannot retain a rich harmonic structure.

### Memory estimate

`bytes = sample_count × frame_count × band_count × 2`.

At the default 48 kHz settings: `512 × 16 × 11 × 2 = 180224 bytes`, approximately **176 KiB** of waveform data (before C++ alignment/other firmware overhead). Statically declared `const` arrays should remain in flash on Teensy; actual linker placement is a firmware/build concern to verify.

## Morphing and normalization

- **Musical banks:** Procedural, phase-coherent harmonic timbre progressions, with 8 families. They don't require A/B capture.
- **Captured A/B banks:** Capture two waves in Oscillator Lab. Choose either sample-by-sample interpolation or a spectral interpolation (magnitudes interpolated, phases interpolated along shortest phase arc). Phase alignment can circularly shift B to reduce phase cancellation.
- **Peak safe:** Sets each base morph frame's largest absolute value to 1. Good default for using full DAC range while keeping zero mean if inputs were zero mean.
- **Full Vpp:** Maps minimum and maximum sample values to -1 and +1, preserving full peak-to-peak span at every frame **but can add DC**. For audio this is not always desirable.
- **RMS target:** Attempts RMS level 0.5, but *limits peak* at 1. It cannot simultaneously guarantee identical RMS and no clipping.
- **Preserve levels:** No rescaling of the synthesized frame.

**The filtered variants are never independently normalized after filtering.** This avoids artificially amplifying high-octave tables just because their upper harmonics were removed.

## Pitch-aware anti-aliasing and limitations

The engine FFT-filters harmonics above `floor((0.47 × output_sample_rate) / band_max_pitch)`. This removes source-table harmonics that would exceed the target bandwidth at any pitch **within** that band. The sample rate here means *output DAC update rate*, not the oscillator frequency.

This technique helps, but does not solve all sources of aliasing. Table interpolation, discontinuous bank switching, DAC stair-stepping, and analogue reconstruction all need consideration in the new Teensy firmware. Crossfading adjacent frequency bands and coherent phase accumulation should be evaluated on hardware. At high pitches only a sine-like fundamental survives.

The 512 table samples are **table resolution**. They do not imply 512 DAC updates per oscillator cycle. The planned firmware should use a fixed-rate DDS phase accumulator so oscillator pitch and update rate are decoupled.

## Future firmware notes (not yet implemented)

The bank header exposes definitions similar to:

```cpp
constexpr uint16_t myBank_SAMPLES = 512;
constexpr uint16_t myBank_FRAMES = 16;
constexpr uint16_t myBank_BANDS = 11;
static const uint32_t myBank_bandUpperHz[11] = {0, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20000};
static const uint16_t myBank[11][16][512] = { /* generated samples */ };
```

These are **illustrative** identifiers. The actual names come from the user's export prefix and export counter. In the new firmware, use a 32-bit phase accumulator, a fixed output timer, and per-channel morph/phase parameters. Select appropriate filtered band by pitch, interpolate samples between adjacent indices, then interpolate between bank frames. Bound the DAC codes before SPI writes. The timing, SPI throughput, analogue response and usable 1V/oct range require bench verification.

No button/LED wiring, external ADC, PSRAM, SD access, or new firmware are included in this release.
