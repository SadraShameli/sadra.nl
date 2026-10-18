import { describe, expect, it } from 'vitest';

import { applyAudioFilters } from '~/server/helpers/audio';

function makeImaAdpcmWav(
    blockAlign: number,
    samplesPerBlock: number,
    dataBytes: number,
): Buffer {
    const buffer = Buffer.alloc(48 + dataBytes);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(40 + dataBytes, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(20, 16);
    buffer.writeUInt16LE(0x00_11, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(16_000, 24);
    buffer.writeUInt32LE(8000, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(4, 34);
    buffer.writeUInt16LE(2, 36);
    buffer.writeUInt16LE(samplesPerBlock, 38);
    buffer.write('data', 40);
    buffer.writeUInt32LE(dataBytes, 44);
    return buffer;
}

function makeWav(samples: Int16Array): Buffer {
    const dataBytes = samples.length * 2;
    const buffer = Buffer.alloc(44 + dataBytes);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataBytes, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(16_000, 24);
    buffer.writeUInt32LE(16_000 * 2, 28);
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
    const dataLength = buffer.readUInt32LE(40);
    const out = new Int16Array(dataLength / 2);
    for (let index = 0; index < out.length; index++)
        out[index] = buffer.readInt16LE(44 + index * 2);
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

    it('rejects an ADPCM header that claims more samples than its blocks hold', () => {
        const wav = makeImaAdpcmWav(4, 65_535, 60);
        expect(wav.length).toBe(108);
        expect(() => applyAudioFilters(wav)).toThrow(
            'WAV: ADPCM block holds fewer samples than its header claims',
        );
    });

    it('decodes an ADPCM header whose block size matches its sample count', () => {
        const wav = makeImaAdpcmWav(8, 9, 16);
        const out = applyAudioFilters(wav);
        expect(out.durationSeconds).toBeCloseTo(18 / 16_000, 6);
    });
});
