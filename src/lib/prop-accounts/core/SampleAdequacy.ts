import { type SampleThresholds } from '~/lib/prop-calculator/advisor';

export enum SampleKind {
    ClosedRounds = 'closed-rounds',
    EvalAttempts = 'eval-attempts',
    FundedAccounts = 'funded-accounts',
    Trades = 'trades',
}

export enum SampleLevel {
    Adequate = 'adequate',
    Low = 'low',
    None = 'none',
}

export function sampleAdequacy(
    kind: SampleKind,
    n: number,
    thresholds: SampleThresholds,
): null | SampleLevel {
    const threshold = thresholdFor(kind, thresholds);
    if (threshold === null) return null;
    if (n === 0) return SampleLevel.None;
    return n < threshold ? SampleLevel.Low : SampleLevel.Adequate;
}

function thresholdFor(
    kind: SampleKind,
    thresholds: SampleThresholds,
): null | number {
    switch (kind) {
        case SampleKind.ClosedRounds: {
            return thresholds.minClosedRounds;
        }
        case SampleKind.EvalAttempts: {
            return thresholds.minEvalAttempts;
        }
        case SampleKind.FundedAccounts: {
            return thresholds.minFundedAccounts;
        }
        case SampleKind.Trades: {
            return thresholds.minTrades;
        }
    }
}
