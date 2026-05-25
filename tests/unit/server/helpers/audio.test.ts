import { describe, expect, it } from 'vitest';

import { applyAudioFilters } from '~/server/helpers/audio';

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

function readSamples(buf: Buffer): Int16Array {
    const sampleRate = buf.readUInt32LE(24);
    const dataLen = buf.readUInt32LE(40);
    const out = new Int16Array(dataLen / 2);
    for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(44 + i * 2);
    void sampleRate;
    return out;
}

describe('applyAudioFilters', () => {
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
