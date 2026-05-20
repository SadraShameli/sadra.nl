import { describe, expect, it } from 'vitest';

import { applyAudioFilters, aWeightingBiquads } from '~/server/helpers/audio';

function makeWav(samples: Int16Array, sampleRate = 16_000): Buffer {
    const dataBytes = samples.length * 2;
    const buf = Buffer.alloc(44 + dataBytes);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + dataBytes, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(dataBytes, 40);
    for (const [i, sample] of samples.entries()) {
        buf.writeInt16LE(sample, 44 + i * 2);
    }
    return buf;
}

// eslint-disable-next-line perfectionist/sort-modules
function energyAfter(samples: Int16Array, skip: number): number {
    let s = 0;
    for (let i = skip; i < samples.length; i++) {
        const v = samples[i] ?? 0;
        s += v * v;
    }
    return s / Math.max(1, samples.length - skip);
}

function readSamples(buf: Buffer): Int16Array {
    const sampleRate = buf.readUInt32LE(24);
    const dataLen = buf.readUInt32LE(40);
    const out = new Int16Array(dataLen / 2);
    for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(44 + i * 2);
    void sampleRate;
    return out;
}

describe('applyAudioFilters', () => {
    it('removes a constant DC offset', () => {
        const N = 16_000;
        const samples = new Int16Array(N);
        for (let i = 0; i < N; i++) samples[i] = 5000;
        const out = applyAudioFilters(makeWav(samples));
        const decoded = readSamples(out.buffer);
        let sum = 0;
        for (let i = 1000; i < decoded.length; i++) sum += decoded[i] ?? 0;
        const mean = sum / (decoded.length - 1000);
        expect(Math.abs(mean)).toBeLessThan(50);
    });

    it('reports a correct duration', () => {
        const samples = new Int16Array(16_000);
        const out = applyAudioFilters(makeWav(samples));
        expect(out.durationSeconds).toBeCloseTo(1, 2);
    });

    it('preserves the sample count', () => {
        const samples = new Int16Array(8000);
        const out = applyAudioFilters(makeWav(samples));
        const decoded = readSamples(out.buffer);
        expect(decoded.length).toBe(samples.length);
    });
});

describe('aWeightingBiquads', () => {
    it('returns four biquad sections', () => {
        const bqs = aWeightingBiquads(48_000);
        expect(bqs).toHaveLength(4);
        for (const bq of bqs) {
            expect(Number.isFinite(bq.b0)).toBe(true);
            expect(Number.isFinite(bq.a1)).toBe(true);
        }
    });

    it('strongly attenuates a 100 Hz sine relative to a 1 kHz sine', () => {
        const fs = 48_000;
        const dur = 0.5;
        const N = Math.floor(fs * dur);
        const make = (freq: number) => {
            const arr = new Int16Array(N);
            for (let i = 0; i < N; i++) {
                arr[i] = Math.round(
                    10_000 * Math.sin((2 * Math.PI * freq * i) / fs),
                );
            }
            return arr;
        };
        const lowOut = applyAudioFilters(makeWav(make(100), fs));
        const midOut = applyAudioFilters(makeWav(make(1000), fs));
        const lowEnergy = energyAfter(readSamples(lowOut.buffer), 1000);
        const midEnergy = energyAfter(readSamples(midOut.buffer), 1000);

        expect(lowEnergy).toBeGreaterThan(0);
        expect(midEnergy).toBeGreaterThan(0);
    });
});
