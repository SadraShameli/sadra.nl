import { type DocumentedPolicySpec } from '~/lib/prop-calculator/advisor/policy';
import {
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor/ReconstructedAccount';
import { CENTS_PER_DOLLAR, TradingPhase } from '~/lib/prop-calculator/core';

import { MilestoneKind, milestoneState } from './MilestoneState';
import { valueAtState } from './ValueAtState';
import { fundedTrackerAfterMilestonePayout, requireValue } from './ValueChain';
import {
    type DualValueEstimate,
    notModeled,
    type ValueNotModeledResult,
    type ValueResult,
    ValueUnavailableReason,
} from './ValueEstimate';

export const REDUCED_RISK_WHAT_IF_LABEL =
    'what-if: your documented rung is unchanged (QV-18)';

export type PayoutStakeComparisonOutcome =
    | PayoutStakeComparisonResult
    | ValueNotModeledResult;

export interface PayoutStakeComparisonRequest {
    readonly reducedRiskDollars?: number;
}

export interface PayoutStakeComparisonResult {
    readonly continueNow: ValueResult;
    readonly reducedRiskWhatIf: null | ReducedRiskWhatIf;
    readonly requestedAmount: number;
    readonly requestNow: DualValueEstimate;
    readonly traderReceivesNow: number;
}

export interface ReducedRiskWhatIf {
    readonly label: typeof REDUCED_RISK_WHAT_IF_LABEL;
    readonly risk: number;
    readonly value: ValueResult;
}

export function payoutStakeComparison(
    account: ReconstructedAccount,
    spec: DocumentedPolicySpec,
    request: PayoutStakeComparisonRequest = {},
): PayoutStakeComparisonOutcome {
    if (account.kind === ReconstructedLiveKind.Live) {
        return notModeled(ValueUnavailableReason.LiveNotModeled);
    }
    if (account.kind !== TradingPhase.Funded) {
        throw new Error(
            'payoutStakeComparison: expected a funded account (the caller determines eligibility)',
        );
    }
    if (account.fundedTracker === null) {
        throw new Error(
            'payoutStakeComparison: a funded account needs its funded cycle tracker',
        );
    }
    const milestone = milestoneState(account, spec);
    if (milestone.kind !== MilestoneKind.Funded) {
        throw new Error(
            'payoutStakeComparison: expected a funded milestone for a funded account',
        );
    }
    const continuation = requireValue(
        valueAtState(
            {
                ...account,
                fundedTracker: fundedTrackerAfterMilestonePayout(
                    account,
                    milestone,
                ),
                state: milestone.state,
            },
            spec,
        ),
    );
    const traderReceivesNow = account.plan.payoutFromProfit(
        milestone.debited,
        account.fundedTracker.payoutsIssued,
    );
    const continueNow = requireValue(valueAtState(account, spec));

    const requestNow: DualValueEstimate = {
        creditFree: {
            standardError: continuation.creditFree.standardError,
            value: traderReceivesNow + continuation.creditFree.value,
        },
        creditInclusive: {
            standardError: continuation.creditInclusive.standardError,
            value: traderReceivesNow + continuation.creditInclusive.value,
        },
    };

    return {
        continueNow,
        reducedRiskWhatIf:
            request.reducedRiskDollars === undefined
                ? null
                : reducedRiskWhatIf(account, spec, request.reducedRiskDollars),
        requestedAmount: milestone.debited,
        requestNow,
        traderReceivesNow,
    };
}

function reducedRiskWhatIf(
    account: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
    risk: number,
): ReducedRiskWhatIf {
    if (!(risk > 0)) {
        throw new RangeError(
            `payoutStakeComparison: reducedRiskDollars must be > 0, got ${risk}`,
        );
    }
    const reducedSpec: DocumentedPolicySpec = {
        ...spec,
        rulebook: {
            ...spec.rulebook,
            funded: {
                ...spec.rulebook.funded,
                riskCents: Math.round(risk * CENTS_PER_DOLLAR),
            },
        },
    };
    return {
        label: REDUCED_RISK_WHAT_IF_LABEL,
        risk,
        value: requireValue(valueAtState(account, reducedSpec)),
    };
}
