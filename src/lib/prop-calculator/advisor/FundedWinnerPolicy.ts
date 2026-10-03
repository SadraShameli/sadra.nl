import { type FundedCandidate } from '~/lib/prop-calculator/optimize';

import {
    type FundedWinnerPolicy,
    FundedWinnerPolicyKind,
} from './EngineOptimum';

const PERCENT_PER_FRACTION = 100;
const PERCENT_SIGNIFICANT_DIGITS = 12;

export function fundedWinnerPolicyOf(
    candidates: readonly FundedCandidate[],
    label: string,
): FundedWinnerPolicy {
    const overrides = candidates.find(
        (candidate) => candidate.label === label,
    )?.overrides;
    if (overrides === undefined) {
        throw new Error(
            `fundedWinnerPolicyOf: the winning candidate "${label}" is not among the built candidates`,
        );
    }
    const { fundedCushionPercent, fundedDayPolicy, fundedRiskPerTrade } =
        overrides;
    if (fundedRiskPerTrade !== undefined) {
        return {
            dollars: fundedRiskPerTrade,
            kind: FundedWinnerPolicyKind.Flat,
        };
    }
    if (fundedCushionPercent !== undefined) {
        return {
            kind: FundedWinnerPolicyKind.PercentOfCushion,
            percent: Number(
                (fundedCushionPercent * PERCENT_PER_FRACTION).toPrecision(
                    PERCENT_SIGNIFICANT_DIGITS,
                ),
            ),
        };
    }
    return {
        kind: FundedWinnerPolicyKind.Ladder,
        rungs: fundedDayPolicy?.ladder ?? [],
    };
}
