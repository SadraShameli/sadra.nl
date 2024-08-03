type Coefficients = {
    B1: number;
    B2: number;
    A1: number;
    A2: number;
};

type DelayStates = {
    W0: number;
    W1: number;
};

class SoundFilter {
    private Gain: number;
    private Coefficients: Coefficients[];
    private DelayStates: DelayStates[];

    constructor(gain: number, coeffs: Coefficients[]) {
        this.Gain = gain;
        this.Coefficients = coeffs;
        this.DelayStates = new Array(coeffs.length).fill({
            W0: 0.0,
            W1: 0.0,
        }) as DelayStates[];
    }

    filter(buffer: Int16Array): number {
        if (this.Coefficients.length < 1) return 0.0;

        for (let i = 0; i < this.Coefficients.length - 1; i++)
            SoundFilter.filter(buffer, this.Coefficients[i]!, this.DelayStates[i]!);

        return SoundFilter.filterRMS(
            buffer,
            this.Coefficients[this.Coefficients.length - 1]!,
            this.DelayStates[this.Coefficients.length - 1]!,
            this.Gain,
        );
    }

    static calculateRMS(samples: Int16Array): number {
        let sumSqr = 0.0;
        for (const sample of samples) {
            const f0 = sample;
            sumSqr += f0 * f0;
        }
        return Math.sqrt(sumSqr / samples.length);
    }

    static filter(samples: Int16Array, coeffs: Coefficients, delays: DelayStates) {
        const f0 = coeffs.B1;
        const f1 = coeffs.B2;
        const f2 = coeffs.A1;
        const f3 = coeffs.A2;
        let f4 = delays.W0;
        let f5 = delays.W1;

        for (let i = 0; i < samples.length; i++) {
            let f6 = samples[i]!;
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

    static filterRMS(samples: Int16Array, coeffs: Coefficients, delays: DelayStates, gain: number): number {
        const f0 = coeffs.B1;
        const f1 = coeffs.B2;
        const f2 = coeffs.A1;
        const f3 = coeffs.A2;
        let f4 = delays.W0;
        let f5 = delays.W1;
        const f6 = gain;

        let sumSqr = 0.0;
        for (let i = 0; i < samples.length; i++) {
            let f7 = samples[i]!;
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
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DC_Blocker = new SoundFilter(1.0, [{ B1: -1.0, B2: 0.0, A1: 0.9992, A2: 0 }]);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const INMP441 = new SoundFilter(1.00197834654696, [
    {
        B1: -1.986920458344451,
        B2: 0.986963226946616,
        A1: 1.995178510504166,
        A2: -0.995184322194091,
    },
]);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const A_weighting = new SoundFilter(0.16999494814743, [
    {
        B1: -2.00026996133106,
        B2: 1.00027056142719,
        A1: -1.060868438509278,
        A2: -0.163987445885926,
    },
    {
        B1: 4.35912384203144,
        B2: 3.09120265783884,
        A1: 1.208419926363593,
        A2: -0.273166998428332,
    },
    {
        B1: -0.70930303489759,
        B2: -0.2907186839358,
        A1: 1.982242159753048,
        A2: -0.982298594928989,
    },
]);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const C_weighting = new SoundFilter(-0.49164716933714, [
    {
        B1: 1.4604385758204708,
        B2: 0.5275070373815286,
        A1: 1.9946144559930252,
        A2: -0.9946217070140883,
    },
    {
        B1: 0.2376222404939509,
        B2: 0.0140411206016894,
        A1: -1.3396585608422749,
        A2: -0.4421457807694559,
    },
    { B1: -2.0, B2: 1.0, A1: 0.3775800047420818, A2: -0.035636575668043 },
]);

class AudioFile {
    chunkId: string;
    chunkSize: number;
    format: string;
    subchunk1Id: string;
    subchunk1Size: number;
    audioFormat: number;
    numChannels: number;
    sampleRate: number;
    byteRate: number;
    blockAlign: number;
    bitsPerSample: number;
    subchunk2Id: string;
    subchunk2Size: number;
    samples: Int16Array;

    constructor(file: Buffer) {
        this.chunkId = file.toString('ascii', 0, 4);
        this.chunkSize = file.readUInt32LE(4);
        this.format = file.toString('ascii', 8, 12);
        this.subchunk1Id = file.toString('ascii', 12, 16);
        this.subchunk1Size = file.readUInt32LE(16);
        this.audioFormat = file.readUInt16LE(20);
        this.numChannels = file.readUInt16LE(22);
        this.sampleRate = file.readUInt32LE(24);
        this.byteRate = file.readUInt32LE(28);
        this.blockAlign = file.readUInt16LE(32);
        this.bitsPerSample = file.readUInt16LE(34);
        this.subchunk2Id = file.toString('ascii', 36, 40);
        this.subchunk2Size = file.readUInt32LE(40);

        const dataStart = 44;
        const dataLength = this.subchunk2Size;
        const audioData = file.subarray(dataStart, dataStart + dataLength);

        this.samples = new Int16Array(dataLength / 2);
        for (let i = 0; i < this.samples.length; i++) {
            this.samples[i] = audioData.readInt16LE(i * 2);
        }
    }

    getBuffer() {
        const buffer = Buffer.alloc(44 + this.subchunk2Size);

        buffer.write('RIFF', 0);
        buffer.writeUInt32LE(this.chunkSize, 4);
        buffer.write('WAVE', 8);

        buffer.write('fmt ', 12);
        buffer.writeUInt32LE(16, 16);
        buffer.writeUInt16LE(1, 20);
        buffer.writeUInt16LE(this.numChannels, 22);
        buffer.writeUInt32LE(this.sampleRate, 24);
        buffer.writeUInt32LE(this.byteRate, 28);
        buffer.writeUInt16LE(this.blockAlign, 32);
        buffer.writeUInt16LE(this.bitsPerSample, 34);

        buffer.write('data', 36);
        buffer.writeUInt32LE(this.subchunk2Size, 40);

        let offset = 44;
        for (const sample of this.samples) {
            buffer.writeInt16LE(sample, offset);
            offset += 2;
        }

        return buffer;
    }

    normalize() {
        let max = 0;
        for (const sample of this.samples) {
            if (Math.abs(sample) > max) {
                max = sample;
            }
        }

        const scaleFactor = 32767.0 / max;
        for (let i = 0; i < this.samples.length; i++) {
            this.samples[i] = this.samples[i]! * scaleFactor;
        }
    }
}

export function applyAudioFilters(samplesBuffer: Buffer): Buffer {
    const audio = new AudioFile(samplesBuffer);
    DC_Blocker.filter(audio.samples);
    INMP441.filter(audio.samples);
    audio.normalize();
    return audio.getBuffer();
}
