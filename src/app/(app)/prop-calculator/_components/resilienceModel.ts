import {
    floorToWholeCents,
    ONE_CENT,
    type SimInputs,
    type SimOutputs,
} from '~/lib/prop-calculator';

import { probStreakAtLeast } from './lab/labMath';

export interface ResilienceFigures {
    readonly lossToler: number;
    readonly p95: number;
    readonly rows: readonly ResilienceRow[];
    readonly safeRisk: number;
    readonly safeRiskPct: number;
}

export interface ResilienceRow {
    readonly damage: number;
    readonly isTolerance: boolean;
    readonly n: number;
    readonly prob: null | number;
    readonly survives: boolean;
}

const BASE_STREAKS = [3, 4, 5, 6, 7, 8, 10] as const;
const MAX_LISTED_TOLERANCE = 20;

export function resilienceFigures(
    inputs: Pick<SimInputs, 'plan' | 'riskPerTrade' | 'winrate'>,
    result: Pick<
        SimOutputs,
        'expectedAttempts' | 'maxLosingStreakP95' | 'tradesPerSuccessfulAttempt'
    >,
): ResilienceFigures {
    const { plan, riskPerTrade, winrate } = inputs;
    const { accountSize, drawdown } = plan;
    const dd = drawdown.amount;
    const canSurvive = (loss: number): boolean =>
        drawdown.survivesLossFromStart(accountSize, loss);
    const lossToler = survivingLossCount(dd, riskPerTrade, canSurvive);
    const p95 = Math.round(result.maxLosingStreakP95);
    const q = 1 - winrate;
    const exposure =
        result.tradesPerSuccessfulAttempt > 0
            ? Math.round(
                  result.tradesPerSuccessfulAttempt * result.expectedAttempts,
              )
            : null;

    const streaks: number[] = [...BASE_STREAKS];
    if (
        lossToler > 0 &&
        lossToler <= MAX_LISTED_TOLERANCE &&
        !streaks.includes(lossToler)
    ) {
        streaks.push(lossToler);
        streaks.sort((a, b) => a - b);
    }

    const rows = streaks.map((n) => ({
        damage: Math.min(n * riskPerTrade, dd),
        isTolerance: n === lossToler,
        n,
        prob: exposure === null ? null : probStreakAtLeast(exposure, n, q),
        survives: canSurvive(n * riskPerTrade),
    }));

    const safeRisk = p95 > 0 ? largestSurvivingRisk(dd, p95, canSurvive) : 0;
    const safeRiskPct = accountSize > 0 ? (safeRisk / accountSize) * 100 : 0;

    return { lossToler, p95, rows, safeRisk, safeRiskPct };
}

function largestSurvivingRisk(
    drawdownAmount: number,
    losses: number,
    canSurvive: (loss: number) => boolean,
): number {
    const evenSplit = floorToWholeCents(drawdownAmount / losses);
    return canSurvive(losses * evenSplit)
        ? evenSplit
        : Math.max(0, floorToWholeCents(evenSplit - ONE_CENT));
}

function survivingLossCount(
    drawdownAmount: number,
    riskPerTrade: number,
    canSurvive: (loss: number) => boolean,
): number {
    if (riskPerTrade <= 0) return 0;
    const fits = Math.floor(drawdownAmount / riskPerTrade);
    return fits > 0 && !canSurvive(fits * riskPerTrade) ? fits - 1 : fits;
}
