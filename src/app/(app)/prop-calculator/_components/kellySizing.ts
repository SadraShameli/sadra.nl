import { type SimInputs, type SimOutputs } from '~/lib/prop-calculator';

export enum KellyIndexStatus {
    NoEdge = 'no-edge',
    NotApplicable = 'not-applicable',
    Sized = 'sized',
}

export interface AverageTradeSize {
    loss: number;
    win: number;
}

export type KellyIndex =
    | { status: KellyIndexStatus.NoEdge }
    | { status: KellyIndexStatus.NotApplicable }
    | { status: KellyIndexStatus.Sized; value: number };

export interface KellySizing {
    currentRiskFraction: null | number;
    fullKelly: number;
    halfKelly: number;
    kellyIndex: KellyIndex;
}

export type KellySizingInputs = Pick<
    SimInputs,
    'riskPerTrade' | 'rrRatio' | 'winrate'
>;

export type KellySizingResult = Pick<
    SimOutputs,
    'accountSize' | 'averageRiskPerTrade'
>;

export function averageTradeSize(
    { rrRatio }: KellySizingInputs,
    { averageRiskPerTrade }: KellySizingResult,
): AverageTradeSize | null {
    return hasTakenTrades(averageRiskPerTrade)
        ? { loss: averageRiskPerTrade, win: averageRiskPerTrade * rrRatio }
        : null;
}

export function kellySizing(
    { rrRatio, winrate }: KellySizingInputs,
    { accountSize, averageRiskPerTrade }: KellySizingResult,
): KellySizing {
    const fullKelly = rrRatio > 0 ? (winrate * (rrRatio + 1) - 1) / rrRatio : 0;
    const currentRiskFraction =
        hasTakenTrades(averageRiskPerTrade) && accountSize > 0
            ? averageRiskPerTrade / accountSize
            : null;
    return {
        currentRiskFraction,
        fullKelly,
        halfKelly: fullKelly / 2,
        kellyIndex: kellyIndex(currentRiskFraction, fullKelly),
    };
}

function hasTakenTrades(averageRiskPerTrade: number): boolean {
    return averageRiskPerTrade > 0;
}

function kellyIndex(
    currentRiskFraction: null | number,
    fullKelly: number,
): KellyIndex {
    if (currentRiskFraction === null) {
        return { status: KellyIndexStatus.NotApplicable };
    }
    if (fullKelly <= 0) return { status: KellyIndexStatus.NoEdge };
    return {
        status: KellyIndexStatus.Sized,
        value: currentRiskFraction / fullKelly,
    };
}
