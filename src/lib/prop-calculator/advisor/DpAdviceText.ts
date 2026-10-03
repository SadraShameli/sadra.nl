import { formatCurrency, formatPercent } from '~/lib/format';
import {
    CENTS_PER_DOLLAR,
    type FundedDpModelGap,
    FundedDpModelGapKind,
} from '~/lib/prop-calculator/core';

import {
    DpAdviceGap,
    type DpAdviceGapEntry,
    DpGateFailureCode,
    DpSamplesUnavailableReason,
} from './DpAdviceRow';

export type DpAdviceOwnGapEntry = Exclude<DpAdviceGapEntry, FundedDpModelGap>;

const FUNDED_MODEL_GAP_SUBJECT = 'This plan';

const FUNDED_MODEL_GAP_KINDS: ReadonlySet<DpAdviceGapEntry['kind']> = new Set(
    Object.values(FundedDpModelGapKind),
);

export const DP_GATE_FAILURE_TEXT: Readonly<Record<DpGateFailureCode, string>> =
    {
        [DpGateFailureCode.BelowBestFlat]:
            'the gate run is below the best flat policy',
        [DpGateFailureCode.InstrumentMismatch]:
            'the gate run used a different instrument than its flat baseline',
        [DpGateFailureCode.NoGateRun]: 'no gate run is recorded for this plan',
        [DpGateFailureCode.PayoutPolicyMismatch]:
            'the gate run used a different payout policy than its flat baseline',
        [DpGateFailureCode.RetainedCushionMismatch]:
            'the gate run used a different retained cushion than its flat baseline',
        [DpGateFailureCode.SolveNotConverged]:
            'the gate run solve did not converge',
        [DpGateFailureCode.StaleTree]:
            'the gate run is not dated after the recorded engine audit, or has no engine reference',
        [DpGateFailureCode.StopMismatch]:
            'the gate run used a different stop than its flat baseline',
    };

export const DP_SAMPLES_UNAVAILABLE_TEXT: Readonly<
    Record<DpSamplesUnavailableReason, string>
> = {
    [DpSamplesUnavailableReason.EvalDayPastHorizon]:
        'the account is past the DP eval horizon',
    [DpSamplesUnavailableReason.EvalElapsedDaysMissing]:
        'the snapshot has no elapsed eval days to place the state on the DP day axis',
    [DpSamplesUnavailableReason.EvalRowsSuppressed]:
        'eval rows are only shown for a validated plan',
    [DpSamplesUnavailableReason.EvalStateUnreached]:
        'the DP never reaches this eval state',
    [DpSamplesUnavailableReason.FundedCycleCountsInvalid]:
        'the rebuilt funded cycle has an invalid count',
    [DpSamplesUnavailableReason.FundedLevelUnreachable]:
        'the rebuilt funded state is at a level this plan can never reach',
    [DpSamplesUnavailableReason.NotEligible]: 'the plan is not DP-eligible',
};

export function dpAdviceGapText(gap: DpAdviceGapEntry): string {
    return isFundedDpModelGap(gap)
        ? `${FUNDED_MODEL_GAP_SUBJECT}: ${fundedDpModelGapClause(gap)}.`
        : dpOwnGapText(gap);
}

export function dpGateFailureText(
    code: DpGateFailureCode,
    result: null | string,
): string {
    return result === null
        ? DP_GATE_FAILURE_TEXT[code]
        : `${DP_GATE_FAILURE_TEXT[code]}: ${result}`;
}

export function dpMoney(cents: number): string {
    return formatCurrency(cents / CENTS_PER_DOLLAR, 2);
}

export function dpOwnGapText(gap: DpAdviceOwnGapEntry): string {
    switch (gap.kind) {
        case DpAdviceGap.ConsistencyGridTruncates: {
            return `The consistency rule stops the DP cushion grid at ${dpMoney(gap.lockedTopCents)}, which truncates any state above it.`;
        }
        case DpAdviceGap.ContinuousRiskAssumed: {
            return 'Risk was solved in continuous dollars (no instrument and stop), so it is not placed in whole contracts.';
        }
        case DpAdviceGap.DayStopRuleNotModeled: {
            return 'The documented day stop rule is not modeled by the funded DP.';
        }
        case DpAdviceGap.EvalGridMisaligned: {
            return `The eval drawdown ${dpMoney(gap.drawdownCents)} is not a whole multiple of the ${dpMoney(gap.stepCents)} cushion step; informational only.`;
        }
        case DpAdviceGap.StateAtGridTop: {
            return 'Your state sits at the top of the DP grid, so its risk is clamped there.';
        }
    }
}

export function fundedDpModelGapClause(gap: FundedDpModelGap): string {
    switch (gap.kind) {
        case FundedDpModelGapKind.CalendarWeekInactivityIgnored: {
            return gap.message;
        }
        case FundedDpModelGapKind.FundedGridSaturationHigh: {
            return `its funded replay reports ${formatPercent(gap.shareAtOrAboveTop)} of funded trial-days with a cushion or post-payout balance at or above this DP's grid top (N-86): those days are clamped to the top cell, which distorts both the predicted value and the policy there, so trust the empirical run over the DP-predicted rate`;
        }
        case FundedDpModelGapKind.LifetimeDollarCapIgnored: {
            return `has a lifetime payout-dollar cap of ${formatCurrency(gap.maxLifetimePayoutDollars)} (maxLifetimePayoutDollars) that this DP ignores entirely: it never restores FundedCycleTracker.cumulativePayout from any state, so it is optimistic about payouts past that total`;
        }
        case FundedDpModelGapKind.PayoutCountTierBeyondRegimeCap: {
            return `has a payout-count-tiered payout cap tier starting at payout #${gap.fromPayoutIndex + 1}, beyond this DP's payout-count regime cap of ${gap.payoutRegimeCap}, and payout counts past the cap saturate at the cap bucket inside it, so that tier is not modeled exactly`;
        }
        case FundedDpModelGapKind.PayoutFloorReleaseUnvalidated: {
            return "resets its funded drawdown floor to breakeven on every payout (PayoutFloorEffect.ReleaseFloor), and at this DP's default grid its predicted rate overstated its own empirical replay on TopStep plans (audit N-89). The eval half of that gap, the eval DP crediting a pass by interpolating between cushion nodes, is no longer present: the eval DP values every cushion exactly. Re-measured after that change (2026-10-02, default grid), the predicted rate still overstated the replay by 20% on TopStep No-fee Standard and 5% on FTMO Growth, all of it in the funded half, which is not fixed yet: trust the empirical replay over the predicted rate, and compare the result against the best flat row from optimize funded";
        }
        case FundedDpModelGapKind.PayoutTriggeredLockPreLockOffsetSaturates: {
            return `locks its funded drawdown only on the first payout (no profit trigger), so its floor can trail without bound before that payout while this DP's pre-lock offset grid stops at a fixed multiple of the drawdown. Offsets past it saturate at the top bucket, so the DP understates the balance (and the first payout) in those rare high-profit states before the first payout, making it slightly pessimistic`;
        }
    }
}

export function isFundedDpModelGap(
    gap: DpAdviceGapEntry,
): gap is FundedDpModelGap {
    return FUNDED_MODEL_GAP_KINDS.has(gap.kind);
}
