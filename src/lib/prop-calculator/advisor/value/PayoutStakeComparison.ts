import {
    documentedFundedRisk,
    type DocumentedPolicySpec,
} from '~/lib/prop-calculator/advisor/policy';
import {
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor/ReconstructedAccount';
import { CENTS_PER_DOLLAR, TradingPhase } from '~/lib/prop-calculator/core';

import { MilestoneKind, milestoneState } from './MilestoneState';
import { valueAtState } from './ValueAtState';
import { requestNowValue, requireValue } from './ValueChain';
import {
    type DualValueEstimate,
    notModeled,
    type ValueNotModeledResult,
    type ValueResult,
    ValueResultKind,
    ValueUnavailableReason,
} from './ValueEstimate';

export const REDUCED_RISK_WHAT_IF_LABEL =
    'what-if: your documented rung is unchanged (QV-18)';

export type PayoutStakeComparisonOutcome =
    PayoutStakeComparisonResult | ValueNotModeledResult;

export interface PayoutStakeComparisonRequest {
    readonly reducedRiskDollars?: number;
}

export interface PayoutStakeComparisonResult {
    readonly continueNow: ValueResult;
    readonly kind: ValueResultKind.PayoutStake;
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
    const { requestNow, traderReceives } = requestNowValue(
        account,
        milestone,
        spec,
    );
    const continueNow = requireValue(valueAtState(account, spec));

    return {
        continueNow,
        kind: ValueResultKind.PayoutStake,
        reducedRiskWhatIf:
            request.reducedRiskDollars === undefined
                ? null
                : reducedRiskWhatIf(account, spec, request.reducedRiskDollars),
        requestedAmount: milestone.debited,
        requestNow: {
            creditFree: requestNow.creditFree,
            creditInclusive: requestNow.creditInclusive,
        },
        traderReceivesNow: traderReceives,
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
    const { funded } = spec.rulebook;
    const placedRisk = documentedFundedRisk(
        {
            ...spec.rulebook,
            funded: {
                ...funded,
                riskCents: Math.round(risk * CENTS_PER_DOLLAR),
            },
        },
        spec.enginePolicy,
    );
    const riskCents = Math.round(placedRisk * CENTS_PER_DOLLAR);
    const reducedSpec: DocumentedPolicySpec = {
        ...spec,
        rulebook: {
            ...spec.rulebook,
            funded: {
                ...funded,
                riskCents,
                takeProfitCents: Math.round(
                    (riskCents * funded.takeProfitCents) / funded.riskCents,
                ),
            },
        },
    };
    return {
        label: REDUCED_RISK_WHAT_IF_LABEL,
        risk: placedRisk,
        value: requireValue(valueAtState(account, reducedSpec)),
    };
}
