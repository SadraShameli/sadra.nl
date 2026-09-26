export enum InstrumentSymbol {
    ES = 'ES',
    MNQ = 'MNQ',
    NQ = 'NQ',
}

export enum Underlying {
    Nasdaq100 = 'nasdaq100',
    SP500 = 'sp500',
}

export interface InstrumentSpec {
    readonly isMicro: boolean;
    readonly label: string;
    readonly pointValue: number;
    readonly symbol: InstrumentSymbol;
    readonly tickSize: number;
    readonly tickValue: number;
    readonly underlying: Underlying;
}

export const INSTRUMENTS: Readonly<Record<InstrumentSymbol, InstrumentSpec>> = {
    [InstrumentSymbol.ES]: {
        isMicro: false,
        label: 'E-mini S&P 500',
        pointValue: 50,
        symbol: InstrumentSymbol.ES,
        tickSize: 0.25,
        tickValue: 12.5,
        underlying: Underlying.SP500,
    },
    [InstrumentSymbol.MNQ]: {
        isMicro: true,
        label: 'Micro E-mini Nasdaq-100',
        pointValue: 2,
        symbol: InstrumentSymbol.MNQ,
        tickSize: 0.25,
        tickValue: 0.5,
        underlying: Underlying.Nasdaq100,
    },
    [InstrumentSymbol.NQ]: {
        isMicro: false,
        label: 'E-mini Nasdaq-100',
        pointValue: 20,
        symbol: InstrumentSymbol.NQ,
        tickSize: 0.25,
        tickValue: 5,
        underlying: Underlying.Nasdaq100,
    },
};

export const ALL_INSTRUMENTS: readonly InstrumentSpec[] = [
    INSTRUMENTS[InstrumentSymbol.NQ],
    INSTRUMENTS[InstrumentSymbol.MNQ],
    INSTRUMENTS[InstrumentSymbol.ES],
];

export function siblingInstrumentOf(
    symbol: InstrumentSymbol,
): InstrumentSpec | null {
    const { underlying } = INSTRUMENTS[symbol];
    return (
        ALL_INSTRUMENTS.find(
            (spec) => spec.symbol !== symbol && spec.underlying === underlying,
        ) ?? null
    );
}
