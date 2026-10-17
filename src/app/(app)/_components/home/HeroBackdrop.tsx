import {
    type Candle,
    CANDLE_BOX_HEIGHT,
    CandleKind,
    DecorativeSeries,
    type SignalBar,
    SignalBarKind,
} from '~/lib/site/DecorativeSeries';
import { cn } from '~/lib/utilities';

const CANDLES = new DecorativeSeries(7).candles(44);
const SIGNAL_BARS = new DecorativeSeries(11).signalBars(96);

const CANDLE_BODY_CLASS: Readonly<Record<CandleKind, string>> = {
    [CandleKind.Falling]: 'border-line-strong bg-line',
    [CandleKind.Last]: 'border-camel bg-camel',
    [CandleKind.Rising]: 'border-line-camel bg-transparent',
};

const CANDLE_WICK_CLASS: Readonly<Record<CandleKind, string>> = {
    [CandleKind.Falling]: 'bg-line-strong',
    [CandleKind.Last]: 'bg-camel',
    [CandleKind.Rising]: 'bg-line-strong',
};

const SIGNAL_BAR_CLASS: Readonly<Record<SignalBarKind, string>> = {
    [SignalBarKind.Accent]: 'bg-line-strong',
    [SignalBarKind.Live]: 'bg-camel',
    [SignalBarKind.Quiet]: 'bg-line-faint',
};

const BACKDROP_CLASS =
    'pointer-events-none absolute bottom-0 h-75 w-[64%] animate-rise mask-r-from-50% mask-r-to-100%';

export function CandleBackdrop() {
    return (
        <div
            aria-hidden
            className={cn(
                BACKDROP_CLASS,
                '-left-10 flex items-stretch gap-1.75 opacity-50',
            )}
        >
            {CANDLES.map((candle, index) => (
                <CandleMark candle={candle} key={index} />
            ))}
        </div>
    );
}

export function SignalBackdrop() {
    return (
        <div
            aria-hidden
            className={cn(
                BACKDROP_CLASS,
                '-left-5 flex items-end gap-1 opacity-60',
            )}
        >
            {SIGNAL_BARS.map((bar, index) => (
                <SignalMark bar={bar} key={index} />
            ))}
        </div>
    );
}

function CandleMark({ candle }: { readonly candle: Candle }) {
    return (
        <div className="relative min-w-1 flex-1">
            <div
                className={cn(
                    'absolute left-1/2 w-px',
                    CANDLE_WICK_CLASS[candle.kind],
                )}
                style={{
                    height: percentOfBox(candle.wickHeight),
                    top: percentOfBox(candle.wickTop),
                }}
            />
            <div
                className={cn(
                    'absolute inset-x-0 border',
                    CANDLE_BODY_CLASS[candle.kind],
                )}
                style={{
                    height: percentOfBox(candle.bodyHeight),
                    top: percentOfBox(candle.bodyTop),
                }}
            />
        </div>
    );
}

function percentOfBox(value: number): string {
    return `${String((value / CANDLE_BOX_HEIGHT) * 100)}%`;
}

function SignalMark({ bar }: { readonly bar: SignalBar }) {
    return (
        <span
            className={cn('flex-1 rounded-t-[2px]', SIGNAL_BAR_CLASS[bar.kind])}
            style={{ height: `${String(bar.height)}%` }}
        />
    );
}
