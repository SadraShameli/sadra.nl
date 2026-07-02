import { describe, expect, it } from 'vitest';

import { applyAudioFilters } from '~/server/helpers/audio';

function makeWav(samples: Int16Array, sampleRate = 16_000): Buffer {
    const dataBytes = samples.length * 2;
    const buffer = Buffer.alloc(44 + dataBytes);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataBytes, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataBytes, 40);
    for (const [index, sample] of samples.entries()) {
        buffer.writeInt16LE(sample, 44 + index * 2);
    }
    return buffer;
}

function readSamples(buffer: Buffer): Int16Array {
    const sampleRate = buffer.readUInt32LE(24);
    const dataLength = buffer.readUInt32LE(40);
    const out = new Int16Array(dataLength / 2);
    for (let index = 0; index < out.length; index++)
        out[index] = buffer.readInt16LE(44 + index * 2);
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
