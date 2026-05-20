const WAV_FORMAT_PCM = 0x00_01;
const WAV_FORMAT_IMA_ADPCM = 0x00_11;

const IMA_STEP_TABLE = [
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
    50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230,
    253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963,
    1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024,
    3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493,
    10_442, 11_487, 12_635, 13_899, 15_289, 16_818, 18_500, 20_350, 22_385,
    24_623, 27_086, 29_794, 32_767,
] as const;

const IMA_INDEX_TABLE = [
    -1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8,
] as const;

type Biquad = {
    a1: number;
    a2: number;
    b0: number;
    b1: number;
    b2: number;
};

class AudioFile {
    audioFormat = 0;
    bitsPerSample = 0;
    blockAlign = 0;
    byteRate = 0;
    dataLength = 0;
    dataOffset = 0;
    numChannels = 0;
    sampleRate = 0;
    samples: Int16Array = new Int16Array(0);
    samplesPerBlock = 0;

    constructor(file: Buffer) {
        if (file.length < 12) {
            throw new Error('WAV: file too short');
        }
        if (file.toString('ascii', 0, 4) !== 'RIFF') {
            throw new Error('WAV: missing RIFF marker');
        }
        if (file.toString('ascii', 8, 12) !== 'WAVE') {
            throw new Error('WAV: missing WAVE marker');
        }

        let offset = 12;
        let fmtFound = false;
        let dataFound = false;

        while (offset + 8 <= file.length && !(fmtFound && dataFound)) {
            const chunkId = file.toString('ascii', offset, offset + 4);
            const chunkSize = file.readUInt32LE(offset + 4);
            const chunkDataStart = offset + 8;

            if (chunkDataStart + chunkSize > file.length) break;

            if (chunkId === 'fmt ' && chunkSize >= 16) {
                this.audioFormat = file.readUInt16LE(chunkDataStart);
                this.numChannels = file.readUInt16LE(chunkDataStart + 2);
                this.sampleRate = file.readUInt32LE(chunkDataStart + 4);
                this.byteRate = file.readUInt32LE(chunkDataStart + 8);
                this.blockAlign = file.readUInt16LE(chunkDataStart + 12);
                this.bitsPerSample = file.readUInt16LE(chunkDataStart + 14);
                if (
                    this.audioFormat === WAV_FORMAT_IMA_ADPCM &&
                    chunkSize >= 20
                ) {
                    this.samplesPerBlock = file.readUInt16LE(
                        chunkDataStart + 18,
                    );
                }
                fmtFound = true;
            } else if (chunkId === 'data') {
                this.dataOffset = chunkDataStart;
                this.dataLength = chunkSize;
                dataFound = true;
            }

            const advance = chunkSize + (chunkSize & 1);
            offset = chunkDataStart + advance;
        }

        if (!fmtFound) throw new Error('WAV: missing fmt chunk');
        if (!dataFound) throw new Error('WAV: missing data chunk');

        if (this.isLinearPcm16()) {
            const audioData = file.subarray(
                this.dataOffset,
                this.dataOffset + this.dataLength,
            );
            this.samples = new Int16Array(audioData.length >> 1);
            for (let i = 0; i < this.samples.length; i++) {
                this.samples[i] = audioData.readInt16LE(i * 2);
            }
        } else if (
            this.audioFormat === WAV_FORMAT_IMA_ADPCM &&
            this.numChannels === 1 &&
            this.samplesPerBlock > 0
        ) {
            this.samples = decodeImaAdpcmBlocks(
                file,
                this.dataOffset,
                this.dataLength,
                this.blockAlign,
                this.samplesPerBlock,
            );

            this.audioFormat = WAV_FORMAT_PCM;
            this.bitsPerSample = 16;
            this.blockAlign = 2 * this.numChannels;
            this.byteRate = this.sampleRate * this.blockAlign;
            this.dataLength = this.samples.length * 2;
        }
    }

    applyAWeighting() {
        if (this.samples.length === 0 || this.sampleRate <= 0) return;
        const biquads = aWeightingBiquads(this.sampleRate);
        const floats = new Float64Array(this.samples.length);
        for (let i = 0; i < this.samples.length; i++)
            floats[i] = this.samples[i] ?? 0;

        for (const bq of biquads) {
            let x1 = 0;
            let x2 = 0;
            let y1 = 0;
            let y2 = 0;
            for (let i = 0; i < floats.length; i++) {
                const x0 = floats[i] ?? 0;
                const y0 =
                    bq.b0 * x0 +
                    bq.b1 * x1 +
                    bq.b2 * x2 -
                    bq.a1 * y1 -
                    bq.a2 * y2;
                floats[i] = y0;
                x2 = x1;
                x1 = x0;
                y2 = y1;
                y1 = y0;
            }
        }

        for (const [i, float] of floats.entries()) {
            this.samples[i] = clampInt16(Math.round(float));
        }
    }

    getBuffer() {
        const dataBytes = this.samples.length * 2;
        const buffer = Buffer.alloc(44 + dataBytes);

        buffer.write('RIFF', 0);
        buffer.writeUInt32LE(36 + dataBytes, 4);
        buffer.write('WAVE', 8);

        buffer.write('fmt ', 12);
        buffer.writeUInt32LE(16, 16);
        buffer.writeUInt16LE(WAV_FORMAT_PCM, 20);
        buffer.writeUInt16LE(this.numChannels, 22);
        buffer.writeUInt32LE(this.sampleRate, 24);
        buffer.writeUInt32LE(this.byteRate, 28);
        buffer.writeUInt16LE(this.blockAlign, 32);
        buffer.writeUInt16LE(this.bitsPerSample, 34);

        buffer.write('data', 36);
        buffer.writeUInt32LE(dataBytes, 40);

        let offset = 44;
        for (const sample of this.samples) {
            buffer.writeInt16LE(sample, offset);
            offset += 2;
        }

        return buffer;
    }

    isLinearPcm16(): boolean {
        return this.audioFormat === WAV_FORMAT_PCM && this.bitsPerSample === 16;
    }

    normalizeToPeak() {
        let max = 0;
        for (const sample of this.samples) {
            const abs = Math.abs(sample);
            if (abs > max) max = abs;
        }
        if (max === 0) return;

        const scale = 32_767 / max;
        for (let i = 0; i < this.samples.length; i++) {
            this.samples[i] = (this.samples[i] ?? 0) * scale;
        }
    }

    removeDcOffset() {
        if (this.samples.length === 0) return;
        let sum = 0;
        for (const s of this.samples) sum += s;
        const mean = sum / this.samples.length;
        if (Math.abs(mean) < 0.5) return;
        for (let i = 0; i < this.samples.length; i++) {
            const v = (this.samples[i] ?? 0) - mean;
            this.samples[i] = clampInt16(Math.round(v));
        }
    }
}

export function applyAudioFilters(samplesBuffer: Buffer): {
    buffer: Buffer;
    durationSeconds: null | number;
} {
    const audio = new AudioFile(samplesBuffer);
    const durationSeconds = getDurationSeconds(audio);

    if (!audio.isLinearPcm16()) {
        return { buffer: samplesBuffer, durationSeconds };
    }

    audio.removeDcOffset();
    audio.applyAWeighting();
    audio.normalizeToPeak();
    return { buffer: audio.getBuffer(), durationSeconds };
}

export function aWeightingBiquads(sampleRate: number): Biquad[] {
    const fs = sampleRate;
    const c = 2 * fs;

    const f1 = 20.598_997;
    const f2 = 107.652_65;
    const f3 = 737.862_23;
    const f4 = 12_194.217;

    const w1 = c * Math.tan((Math.PI * f1) / fs);
    const w2 = c * Math.tan((Math.PI * f2) / fs);
    const w3 = c * Math.tan((Math.PI * f3) / fs);
    const w4 = c * Math.tan((Math.PI * f4) / fs);

    const sections: Biquad[] = [
        biquadFromAnalog([0, 0, 1], [w1 * w1, 2 * w1, 1], c),
        biquadFromAnalog([0, 0, 1], [w4 * w4, 2 * w4, 1], c),
        biquadFromAnalog([0, 1, 0], [w2, 1, 0], c),
        biquadFromAnalog([0, 1, 0], [w3, 1, 0], c),
    ];

    const normFreq = 1000;
    const omega = (2 * Math.PI * normFreq) / fs;
    const cosw = Math.cos(omega);
    const sinw = Math.sin(omega);

    let mag = 1;
    for (const s of sections) {
        const num =
            s.b0 * s.b0 +
            s.b1 * s.b1 +
            s.b2 * s.b2 +
            2 * cosw * (s.b0 * s.b1 + s.b1 * s.b2) +
            2 * (2 * cosw * cosw - 1) * s.b0 * s.b2;
        const den =
            1 +
            s.a1 * s.a1 +
            s.a2 * s.a2 +
            2 * cosw * (s.a1 + s.a1 * s.a2) +
            2 * (2 * cosw * cosw - 1) * s.a2;
        mag *= Math.sqrt(Math.max(num, 0)) / Math.sqrt(Math.max(den, 1e-30));
    }

    void sinw;
    const gain = mag > 0 ? 1 / mag : 1;
    const first = sections[0];
    if (first) {
        first.b0 *= gain;
        first.b1 *= gain;
        first.b2 *= gain;
    }
    return sections;
}

function biquadFromAnalog(
    b: [number, number, number],
    a: [number, number, number],
    c: number,
): Biquad {
    const c2 = c * c;
    const B0 = b[0] + b[1] * c + b[2] * c2;
    const B1 = 2 * b[0] - 2 * b[2] * c2;
    const B2 = b[0] - b[1] * c + b[2] * c2;

    const A0 = a[0] + a[1] * c + a[2] * c2;
    const A1 = 2 * a[0] - 2 * a[2] * c2;
    const A2 = a[0] - a[1] * c + a[2] * c2;

    return {
        a1: A1 / A0,
        a2: A2 / A0,
        b0: B0 / A0,
        b1: B1 / A0,
        b2: B2 / A0,
    };
}

function clampInt16(value: number): number {
    if (value > 32_767) return 32_767;
    if (value < -32_768) return -32_768;
    return value;
}

function decodeImaAdpcmBlocks(
    file: Buffer,
    dataOffset: number,
    dataLength: number,
    blockAlign: number,
    samplesPerBlock: number,
): Int16Array {
    if (blockAlign < 4 || samplesPerBlock < 1) return new Int16Array(0);

    const blockCount = Math.floor(dataLength / blockAlign);
    const totalSamples = blockCount * samplesPerBlock;
    const out = new Int16Array(totalSamples);

    let outIdx = 0;
    for (let b = 0; b < blockCount; b++) {
        const blockStart = dataOffset + b * blockAlign;

        let predictor = file.readInt16LE(blockStart);
        let index = file.readInt8(blockStart + 2);

        out[outIdx++] = predictor;

        const nibbleBytes = blockAlign - 4;
        const samplesFromNibbles = nibbleBytes * 2;
        const samplesWanted = Math.min(samplesFromNibbles, samplesPerBlock - 1);
        let samplesEmitted = 0;

        for (
            let i = 0;
            i < nibbleBytes && samplesEmitted < samplesWanted;
            i++
        ) {
            const byte = file.readUInt8(blockStart + 4 + i);

            for (let n = 0; n < 2 && samplesEmitted < samplesWanted; n++) {
                const code = (n === 0 ? byte : byte >> 4) & 0x0f;

                const step = IMA_STEP_TABLE[index] ?? 7;
                let diffq = step >> 3;
                if (code & 4) diffq += step;
                if (code & 2) diffq += step >> 1;
                if (code & 1) diffq += step >> 2;
                if (code & 8) diffq = -diffq;

                predictor += diffq;
                if (predictor > 32_767) predictor = 32_767;
                else if (predictor < -32_768) predictor = -32_768;

                const indexDelta = IMA_INDEX_TABLE[code] ?? 0;
                index += indexDelta;
                if (index < 0) index = 0;
                else if (index > 88) index = 88;

                out[outIdx++] = predictor;
                samplesEmitted++;
            }
        }
    }

    return out;
}

function getDurationSeconds(audio: AudioFile): null | number {
    if (audio.sampleRate <= 0 || audio.numChannels <= 0) return null;
    if (audio.samples.length === 0) return null;
    return audio.samples.length / audio.numChannels / audio.sampleRate;
}
