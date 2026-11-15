// Generates an upbeat, warm, commercial pop-tech groove (116 BPM, 8-bar seamless loop)
// written as 44.1kHz stereo WAV for video.config.mjs `music` setting.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(HERE, 'ad-groove.wav');

const RATE = 44100;
const BPM = 116;
const BEAT = 60 / BPM;
const SIXTEENTH = BEAT / 4;
const BARS = 8;
const SECONDS = BARS * 4 * BEAT; // 16.551724s seamless circular loop
const FRAMES = Math.round(SECONDS * RATE);
const TAU = Math.PI * 2;

// Warm major-key feel-good progression: Fmaj9 -> G6 -> Em7 -> Am7
const CHORDS = [
  { freqs: [174.61, 220.0, 261.63, 329.63, 392.0], bass: 87.31 },
  { freqs: [196.0, 246.94, 293.66, 329.63, 392.0], bass: 98.0 },
  { freqs: [164.81, 196.0, 246.94, 293.66, 392.0], bass: 82.41 },
  { freqs: [220.0, 261.63, 329.63, 392.0, 493.88], bass: 110.0 },
];

const MELODY_STEPS = [
  0, -1, 2, -1, 3, -1, 4, 2,
  1, -1, 3, -1, 4, 3, 2, -1,
];

const CHORD_STABS = [
  1.0, 0, 0, 0.72, 0, 0, 0.85, 0,
  0, 0, 0.78, 0, 0.65, 0, 0.52, 0,
];

function deterministicNoise(n) {
  let x = (n * 374761393 + 668265263) | 0;
  x = ((x ^ (x >> 13)) * 1274126177) | 0;
  return ((x ^ (x >> 16)) & 0xffff) / 32768 - 1;
}

const bufL = new Float32Array(FRAMES);
const bufR = new Float32Array(FRAMES);

function wrapIdx(i) {
  return ((i % FRAMES) + FRAMES) % FRAMES;
}

function addMono(startSample, len, fn) {
  for (let offset = 0; offset < len; offset++) {
    const dt = offset / RATE;
    const idx = wrapIdx(startSample + offset);
    const v = fn(dt, offset);
    bufL[idx] += v;
    bufR[idx] += v;
  }
}

function addStereo(startSample, len, fn) {
  for (let offset = 0; offset < len; offset++) {
    const dt = offset / RATE;
    const idx = wrapIdx(startSample + offset);
    const [l, r] = fn(dt, offset);
    bufL[idx] += l;
    bufR[idx] += r;
  }
}

for (let bar = 0; bar < BARS; bar++) {
  const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
  const barStart = bar * 4 * BEAT;

  // Warm electric-pad cushion across 2 bars
  if (bar % 2 === 0) {
    const padDur = 8 * BEAT;
    addStereo(Math.round(barStart * RATE), Math.round(padDur * RATE), (dt) => {
      const env = Math.min(1, dt / 0.16) * Math.min(1, Math.max(0, (padDur - dt) / 0.22));
      let l = 0;
      let r = 0;
      chord.freqs.forEach((f, idx) => {
        const s = Math.sin(TAU * f * dt) + 0.15 * Math.sin(TAU * f * 2 * dt);
        const pan = idx % 2 ? 0.62 : 0.38;
        l += s * (1 - pan);
        r += s * pan;
      });
      return [l * env * 0.045, r * env * 0.045];
    });
  }

  for (let step = 0; step < 16; step++) {
    const t0 = barStart + step * SIXTEENTH;
    const s0 = Math.round(t0 * RATE);

    // Warm punchy kick
    if (step === 0 || step === 8 || (bar % 2 === 1 && step === 10)) {
      addMono(s0, Math.round(0.22 * RATE), (dt) => {
        const freq = 48 + 88 * Math.exp(-38 * dt);
        const env = Math.min(1, dt / 0.004) * Math.exp(-13 * dt);
        return Math.sin(TAU * freq * dt) * env * 0.34;
      });
    }

    // Soft warm clap/snap on 2 & 4
    if (step === 4 || step === 12) {
      addStereo(s0, Math.round(0.11 * RATE), (dt, offset) => {
        const snapTone = Math.sin(TAU * (1250 - 500 * dt) * dt) * Math.exp(-48 * dt);
        const snapAir = (deterministicNoise(offset + s0) + deterministicNoise(offset + s0 - 1)) * 0.5 * Math.exp(-62 * dt) * 0.4;
        const v = (snapTone * 0.65 + snapAir) * 0.11;
        return [v * 0.92, v * 1.08];
      });
    }

    // Soft offbeat shaker
    if (step % 2 === 1) {
      addStereo(s0, Math.round(0.045 * RATE), (dt, offset) => {
        const n = (deterministicNoise(offset + s0) - 0.35 * deterministicNoise(offset + s0 - 1));
        const env = Math.exp(-82 * dt);
        const accent = step % 4 === 2 ? 0.032 : 0.02;
        const pan = step % 4 === 1 ? 0.36 : 0.64;
        return [n * env * accent * (1 - pan), n * env * accent * pan];
      });
    }

    // Smooth bass groove
    if (step === 0 || step === 3 || step === 6 || step === 8 || step === 11) {
      const f = step === 8 ? chord.bass * 1.5 : chord.bass;
      addMono(s0, Math.round(0.26 * RATE), (dt) => {
        const env = Math.min(1, dt / 0.01) * Math.exp(-6.2 * dt);
        const tone = Math.sin(TAU * f * dt) + 0.32 * Math.sin(TAU * f * 2 * dt);
        return tone * env * 0.19;
      });
    }

    // Warm electric piano chord stabs
    const stabVel = CHORD_STABS[step];
    if (stabVel > 0) {
      addStereo(s0, Math.round(0.45 * RATE), (dt) => {
        const env = Math.min(1, dt / 0.01) * Math.exp(-5.4 * dt);
        let l = 0;
        let r = 0;
        chord.freqs.slice(0, 4).forEach((f, idx) => {
          const ep = Math.sin(TAU * f * dt)
            + 0.32 * Math.sin(TAU * f * 2 * dt) * Math.exp(-9 * dt)
            + 0.10 * Math.sin(TAU * f * 3 * dt) * Math.exp(-15 * dt);
          const pan = 0.25 + (idx / 3) * 0.5;
          l += ep * (1 - pan);
          r += ep * pan;
        });
        const gain = 0.068 * stabVel * env;
        return [l * gain, r * gain];
      });
    }

    // Warm cheerful marimba melody
    const noteIdx = MELODY_STEPS[(step + (bar % 2) * 2) % MELODY_STEPS.length];
    if (noteIdx >= 0) {
      const f = chord.freqs[noteIdx % chord.freqs.length] * (noteIdx >= 3 ? 2 : 1);
      const pan = step % 4 < 2 ? 0.38 : 0.62;
      addStereo(s0, Math.round(0.32 * RATE), (dt) => {
        const env = Math.min(1, dt / 0.006) * Math.exp(-10 * dt);
        const bell = Math.sin(TAU * f * dt)
          + 0.28 * Math.sin(TAU * f * 2 * dt) * Math.exp(-20 * dt);
        const amp = bell * env * 0.105;
        return [amp * (1 - pan), amp * pan];
      });
    }
  }
}

const wav = Buffer.alloc(44 + FRAMES * 4);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + FRAMES * 4, 4);
wav.write('WAVE', 8);
wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(RATE, 24);
wav.writeUInt32LE(RATE * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(FRAMES * 4, 40);

for (let i = 0; i < FRAMES; i++) {
  const l = Math.tanh(bufL[i] * 1.12);
  const r = Math.tanh(bufR[i] * 1.12);
  wav.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
  wav.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
}

fs.writeFileSync(OUT_FILE, wav);
console.log(`Generated ${OUT_FILE} (${SECONDS.toFixed(2)}s seamless loop)`);
