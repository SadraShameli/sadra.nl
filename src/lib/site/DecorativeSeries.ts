const LCG_MULTIPLIER = 9301;
const LCG_INCREMENT = 49_297;
const LCG_MODULUS = 233_280;

export enum CandleKind {
    Falling = 'falling',
    Last = 'last',
    Rising = 'rising',
}

export enum SignalBarKind {
    Accent = 'accent',
    Live = 'live',
    Quiet = 'quiet',
}

export interface Candle {
    readonly bodyHeight: number;
    readonly bodyTop: number;
    readonly kind: CandleKind;
    readonly wickHeight: number;
    readonly wickTop: number;
}

export interface SignalBar {
    readonly height: number;
    readonly kind: SignalBarKind;
}

export class SeededRandom {
    private state: number;

    constructor(seed: number) {
        this.state = seed;
    }

    next(): number {
        this.state =
            (this.state * LCG_MULTIPLIER + LCG_INCREMENT) % LCG_MODULUS;
        return this.state / LCG_MODULUS;
    }
}

export const CANDLE_BOX_HEIGHT = 300;

export class DecorativeSeries {
    constructor(private readonly seed: number) {}

    candles(count: number): Candle[] {
        const random = new SeededRandom(this.seed);
        const candles: Candle[] = [];
        let price = 200;
        for (let index = 0; index < count; index++) {
            const open = price;
            const drift = index > count * 0.55 ? -3.4 : 0.6;
            const moved = open + (random.next() - 0.5) * 34 + drift;
            const close = Math.max(40, Math.min(260, moved));
            const high = Math.min(open, close) - random.next() * 18 - 2;
            const low = Math.max(open, close) + random.next() * 18 + 2;
            const body = Math.round(Math.abs(close - open));
            candles.push({
                bodyHeight: Math.max(2, body),
                bodyTop: Math.round(Math.min(open, close)),
                kind:
                    index === count - 1
                        ? CandleKind.Last
                        : close < open
                          ? CandleKind.Rising
                          : CandleKind.Falling,
                wickHeight: Math.round(low - high),
                wickTop: Math.round(high),
            });
            price = close;
        }
        return candles;
    }

    signalBars(count: number): SignalBar[] {
        const random = new SeededRandom(this.seed);
        return Array.from({ length: count }, (_, index) => {
            const swell = 0.35 + 0.65 * Math.abs(Math.sin(index / 7));
            return {
                height: Math.round((0.12 + random.next() * 0.88) * swell * 100),
                kind:
                    index === 0
                        ? SignalBarKind.Live
                        : index % 12 === 0
                          ? SignalBarKind.Accent
                          : SignalBarKind.Quiet,
            };
        });
    }

    waveform(count: number): number[] {
        const random = new SeededRandom(this.seed);
        return Array.from({ length: count }, (_, index) => {
            const envelope =
                Math.sin((index / (count - 1)) * Math.PI) * 0.75 + 0.25;
            return Math.round((0.15 + random.next() * 0.85) * envelope * 100);
        });
    }
}
