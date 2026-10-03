import {
    PayoutRequestPolicy,
    type Plan,
    RungSizing,
    serializePlanId,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { type PortfolioTimelineInputs } from '~/lib/prop-calculator/portfolioTimeline';

import {
    buildDocumentedDayPolicies,
    documentedSizedFundedRisk,
    resolveDocumentedPayoutRequestSize,
    resolveDocumentedPlan,
    resolveDocumentedRetainedCushion,
    verifiedCumulativeTriggerOf,
} from './documentedPolicySimInputs';
import {
    type DocumentedPolicySpec,
    documentedPolicySpecSchema,
} from './DocumentedPolicySpec';

export enum DocumentedPolicyTimelineGap {
    CumulativePayoutTrigger = 'cumulative-payout-trigger',
    FundedRrDiffersFromStrategyRr = 'funded-rr-differs-from-strategy-rr',
    IntradayPathStepsPerR = 'intraday-path-steps-per-r',
    LiveTransferHazard = 'live-transfer-hazard',
    RebuyLagDays = 'rebuy-lag-days',
}

const FUNDED_RR_TOLERANCE = 1e-9;

export const DOCUMENTED_POLICY_TIMELINE_GAPS: readonly DocumentedPolicyTimelineGap[] =
    Object.values(DocumentedPolicyTimelineGap);

export const DOCUMENTED_POLICY_TIMELINE_GAP_TEXT: Readonly<
    Record<DocumentedPolicyTimelineGap, string>
> = {
    [DocumentedPolicyTimelineGap.CumulativePayoutTrigger]:
        "The portfolio timeline does not simulate the firm's confirmed cumulative payout trigger, so it never sends an account live once its payouts reach that amount; the account value runs do price it.",
    [DocumentedPolicyTimelineGap.FundedRrDiffersFromStrategyRr]:
        'The portfolio timeline has one reward-to-risk ratio for both the eval and the funded phase; a funded rr different from the rulebook strategy rr is not honoured, so the timeline reuses the strategy rr for the funded phase too.',
    [DocumentedPolicyTimelineGap.IntradayPathStepsPerR]:
        "The portfolio timeline has no intraday path-walk granularity input, so an intraday-trailing plan's engine policy path steps are not honoured here.",
    [DocumentedPolicyTimelineGap.LiveTransferHazard]:
        'The portfolio timeline does not price a live-transfer hazard, so a hazard entered in the rulebook is not honoured here; the account value runs do price it.',
    [DocumentedPolicyTimelineGap.RebuyLagDays]:
        'The portfolio timeline has no rebuy lag input, so a measured rebuy lag from the engine policy is not honoured here.',
};

export function applicableTimelineGaps(
    spec: DocumentedPolicySpec,
    plan?: Plan,
): readonly DocumentedPolicyTimelineGap[] {
    const { enginePolicy, rulebook } = spec;
    const { funded, strategy } = rulebook;
    return DOCUMENTED_POLICY_TIMELINE_GAPS.filter((gap) => {
        switch (gap) {
            case DocumentedPolicyTimelineGap.CumulativePayoutTrigger: {
                return (
                    plan !== undefined &&
                    verifiedCumulativeTriggerOf(
                        findFirm(plan.id.firm)?.accountPolicy,
                        plan,
                    ) !== null
                );
            }
            case DocumentedPolicyTimelineGap.FundedRrDiffersFromStrategyRr: {
                return (
                    Math.abs(
                        funded.takeProfitCents / funded.riskCents - strategy.rr,
                    ) > FUNDED_RR_TOLERANCE
                );
            }
            case DocumentedPolicyTimelineGap.IntradayPathStepsPerR: {
                return enginePolicy.intradayPathStepsPerR !== undefined;
            }
            case DocumentedPolicyTimelineGap.LiveTransferHazard: {
                return (
                    Object.keys(rulebook.liveTransfer.hazardPerPaidPayoutByFirm)
                        .length > 0
                );
            }
            case DocumentedPolicyTimelineGap.RebuyLagDays: {
                return enginePolicy.rebuyLagDays > 0;
            }
        }
    });
}

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
    const fundedRisk = documentedSizedFundedRisk(rulebook, enginePolicy);
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
