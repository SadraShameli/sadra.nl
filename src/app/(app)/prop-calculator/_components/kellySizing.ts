import {
    type Dollars,
    fraction,
    type SimInputs,
    type SimOutputs,
} from '~/lib/prop-calculator';
import { fullKellyFraction } from '~/lib/prop-calculator/economics';

export enum KellyIndexStatus {
    NoEdge = 'no-edge',
    NotApplicable = 'not-applicable',
    Sized = 'sized',
}

export type AverageRiskResult = Pick<SimOutputs, 'averageRiskPerTrade'>;

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

export interface KellySizingResult extends AverageRiskResult {
    riskBasis: Dollars;
}

export function averageTradeSize(
    { rrRatio }: KellySizingInputs,
    { averageRiskPerTrade }: AverageRiskResult,
): AverageTradeSize | null {
    return hasTakenTrades(averageRiskPerTrade)
        ? { loss: averageRiskPerTrade, win: averageRiskPerTrade * rrRatio }
        : null;
}

export function kellySizing(
    { rrRatio, winrate }: KellySizingInputs,
    { averageRiskPerTrade, riskBasis }: KellySizingResult,
): KellySizing {
    const fullKelly = fullKellyFraction(fraction(winrate), rrRatio).value ?? 0;
    const currentRiskFraction =
        hasTakenTrades(averageRiskPerTrade) && riskBasis > 0
            ? averageRiskPerTrade / riskBasis
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
