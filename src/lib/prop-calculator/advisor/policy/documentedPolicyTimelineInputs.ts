import {
    CENTS_PER_DOLLAR,
    PayoutRequestPolicy,
    type Plan,
    RungSizing,
    serializePlanId,
} from '~/lib/prop-calculator/core';
import { type PortfolioTimelineInputs } from '~/lib/prop-calculator/portfolioTimeline';

import {
    buildDocumentedDayPolicies,
    resolveDocumentedPayoutRequestSize,
    resolveDocumentedPlan,
    resolveDocumentedRetainedCushion,
} from './documentedPolicySimInputs';
import {
    type DocumentedPolicySpec,
    documentedPolicySpecSchema,
} from './DocumentedPolicySpec';

export enum DocumentedPolicyTimelineGap {
    FundedRrDiffersFromStrategyRr = 'funded-rr-differs-from-strategy-rr',
    IntradayPathStepsPerR = 'intraday-path-steps-per-r',
    RebuyLagDays = 'rebuy-lag-days',
}

export const DOCUMENTED_POLICY_TIMELINE_GAPS: readonly DocumentedPolicyTimelineGap[] =
    Object.values(DocumentedPolicyTimelineGap);

export const DOCUMENTED_POLICY_TIMELINE_GAP_TEXT: Readonly<
    Record<DocumentedPolicyTimelineGap, string>
> = {
    [DocumentedPolicyTimelineGap.FundedRrDiffersFromStrategyRr]:
        'The portfolio timeline has one reward-to-risk ratio for both the eval and the funded phase; a funded rr different from the rulebook strategy rr is not honoured, so the timeline reuses the strategy rr for the funded phase too.',
    [DocumentedPolicyTimelineGap.IntradayPathStepsPerR]:
        "The portfolio timeline has no intraday path-walk granularity input, so an intraday-trailing plan's engine policy path steps are not honoured here.",
    [DocumentedPolicyTimelineGap.RebuyLagDays]:
        'The portfolio timeline has no rebuy lag input, so a measured rebuy lag from the engine policy is not honoured here.',
};

export function documentedPolicyTimelineInputs(
    plan: Plan,
    spec: DocumentedPolicySpec,
    accounts: number,
): PortfolioTimelineInputs {
    const { enginePolicy, planSerial, rulebook, run } =
        documentedPolicySpecSchema.parse(spec);
    const serial = serializePlanId(plan.id);
    if (planSerial !== undefined && planSerial !== serial) {
        throw new Error(
            `the documented policy spec is for plan ${planSerial}, but it was applied to ${serial}`,
        );
    }
    const { funded, payout, strategy } = rulebook;
    const fundedRisk = funded.riskCents / CENTS_PER_DOLLAR;
    const { instrument, stopPoints } = enginePolicy;
    const simulatedPlan = resolveDocumentedPlan(plan, enginePolicy);
    const { evalDayPolicy, fundedDayPolicy } = buildDocumentedDayPolicies(
        simulatedPlan,
        rulebook,
        enginePolicy,
    );
    return {
        accounts,
        commissionPerRoundTrip: enginePolicy.commissionPerRoundTrip,
        evalDayPolicy,
        fundedDayPolicy,
        instrument,
        maxEvalDays: run.maxEvalDays,
        minRetainedCushion: resolveDocumentedRetainedCushion(
            enginePolicy,
            payout,
        ),
        payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
        payoutRequestSize: resolveDocumentedPayoutRequestSize(
            simulatedPlan,
            enginePolicy,
            payout,
        ),
        plan: simulatedPlan,
        riskPerTrade: fundedRisk,
        rrRatio: strategy.rr,
        rungSizing: RungSizing.CapToCushion,
        seed: run.seed,
        stopPoints,
        tradesPerDay: funded.tradesPerDayMax,
        trials: run.trials,
        winrate: strategy.winrate,
    };
}
