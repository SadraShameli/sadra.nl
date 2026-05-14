type Coefficients = {
    A1: number;
    A2: number;
    B1: number;
    B2: number;
};

type DelayStates = {
    W0: number;
    W1: number;
};

class SoundFilter {
    private Coefficients: Coefficients[];
    private DelayStates: DelayStates[];
    private Gain: number;

    constructor(gain: number, coeffs: Coefficients[]) {
        this.Gain = gain;
        this.Coefficients = coeffs;
        this.DelayStates = Array.from({ length: coeffs.length }).fill({
            W0: 0,
            W1: 0,
        }) as DelayStates[];
    }

    static calculateRMS(samples: Int16Array): number {
        let sumSqr = 0;
        for (const sample of samples) {
            const f0 = sample;
            sumSqr += f0 * f0;
        }
        return Math.sqrt(sumSqr / samples.length);
    }

    static filter(
        samples: Int16Array,
        coeffs: Coefficients,
        delays: DelayStates,
    ) {
        const f0 = coeffs.B1;
        const f1 = coeffs.B2;
        const f2 = coeffs.A1;
        const f3 = coeffs.A2;
        let f4 = delays.W0;
        let f5 = delays.W1;

        for (let i = 0; i < samples.length; i++) {
            let f6 = samples[i] ?? 0;
            f6 += f2 * f4;
            f6 += f3 * f5;
            let f7 = f6;
            f7 += f0 * f4;
            f7 += f1 * f5;
            samples[i] = f7;
            f5 = f4;
            f4 = f6;
        }

        delays.W0 = f4;
        delays.W1 = f5;
    }

    static filterRMS(
        samples: Int16Array,
        coeffs: Coefficients,
        delays: DelayStates,
        gain: number,
    ): number {
        const f0 = coeffs.B1;
        const f1 = coeffs.B2;
        const f2 = coeffs.A1;
        const f3 = coeffs.A2;
        let f4 = delays.W0;
        let f5 = delays.W1;
        const f6 = gain;

        let sumSqr = 0;
        for (let i = 0; i < samples.length; i++) {
            let f7 = samples[i] ?? 0;
            f7 += f2 * f4;
            f7 += f3 * f5;
            let f8 = f7;
            const f10 = f6;
            f8 += f0 * f4;
            f8 += f1 * f5;
            const f9 = f8 * f6;
            samples[i] = f9;
            f5 = f4;
            f4 = f10;
            sumSqr += f9 * f9;
        }

        delays.W0 = f4;
        delays.W1 = f5;

        return Math.sqrt(sumSqr / samples.length);
    }

    filter(buffer: Int16Array): number {
        if (this.Coefficients.length === 0) return 0;

        for (let i = 0; i < this.Coefficients.length - 1; i++) {
            const coeff = this.Coefficients[i];
            const delay = this.DelayStates[i];
            if (!coeff || !delay) continue;
            SoundFilter.filter(buffer, coeff, delay);
        }

        const lastCoeff = this.Coefficients.at(-1);
        const lastDelay = this.DelayStates[this.Coefficients.length - 1];
        if (!lastCoeff || !lastDelay) return 0;
        return SoundFilter.filterRMS(buffer, lastCoeff, lastDelay, this.Gain);
    }
}

const DC_Blocker = new SoundFilter(1, [{ A1: 0.9992, A2: 0, B1: -1, B2: 0 }]);

const INMP441 = new SoundFilter(1.001_978_346_546_96, [
    {
        A1: 1.995_178_510_504_166,
        A2: -0.995_184_322_194_091,
        B1: -1.986_920_458_344_451,
        B2: 0.986_963_226_946_616,
    },
]);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const A_weighting = new SoundFilter(0.169_994_948_147_43, [
    {
        A1: -1.060_868_438_509_278,
        A2: -0.163_987_445_885_926,
        B1: -2.000_269_961_331_06,
        B2: 1.000_270_561_427_19,
    },
    {
        A1: 1.208_419_926_363_593,
        A2: -0.273_166_998_428_332,
        B1: 4.359_123_842_031_44,
        B2: 3.091_202_657_838_84,
    },
    {
        A1: 1.982_242_159_753_048,
        A2: -0.982_298_594_928_989,
        B1: -0.709_303_034_897_59,
        B2: -0.290_718_683_935_8,
    },
]);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const C_weighting = new SoundFilter(-0.491_647_169_337_14, [
    {
        A1: 1.994_614_455_993_025_2,
        A2: -0.994_621_707_014_088_3,
        B1: 1.460_438_575_820_470_8,
        B2: 0.527_507_037_381_528_6,
    },
    {
        A1: -1.339_658_560_842_274_9,
        A2: -0.442_145_780_769_455_9,
        B1: 0.237_622_240_493_950_9,
        B2: 0.014_041_120_601_689_4,
    },
    { A1: 0.377_580_004_742_081_8, A2: -0.035_636_575_668_043, B1: -2, B2: 1 },
]);

const WAV_FORMAT_PCM = 0x00_01;

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

    normalize() {
        let max = 0;
        for (const sample of this.samples) {
            const abs = Math.abs(sample);
            if (abs > max) {
                max = abs;
            }
        }
        if (max === 0) return;

        const scaleFactor = 32_767 / max;
        for (let i = 0; i < this.samples.length; i++) {
            this.samples[i] = (this.samples[i] ?? 0) * scaleFactor;
        }
    }
}

export function applyAudioFilters(samplesBuffer: Buffer): Buffer {
    const audio = new AudioFile(samplesBuffer);

    if (!audio.isLinearPcm16()) {
        return samplesBuffer;
    }

    DC_Blocker.filter(audio.samples);
    INMP441.filter(audio.samples);
    audio.normalize();
    return audio.getBuffer();
}
