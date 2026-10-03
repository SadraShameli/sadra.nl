import { describe, expect, it } from 'vitest';

import {
    type OverviewOutcome,
    OverviewOutcomeKind,
    overviewRequestKey,
    OverviewRequestKind,
    ValueChainStepOutcomeKind,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    fromStateDetailRequestsOf,
    RetireViewKind,
    retireViewOf,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/fromStateDetail';
import {
    AccountFromStateViewKind,
    accountFromStateViewOf,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/accountFromStateModel';
import {
    dollars,
    findFirm,
    FirmId,
    type Plan,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    type AccountSnapshotInput,
    AssumptionBias,
    AssumptionKind,
    assumptionText,
    type CumulativePayoutTriggerAssumption,
    DashboardBalanceConvention,
    DEFAULT_RULEBOOK,
    type LiveTransferHazardAssumption,
    NO_PENDING_PAYOUT_COUNTS,
    SizingStage,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import {
    MilestoneKind,
    RetireComparisonBasis,
    RetireComparisonReason,
    type RetireComparisonResult,
    RetireComparisonVerdict,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import { LiveTransferContinuationKind } from '~/lib/prop-calculator/simulator';

function topStep(): Plan {
    const plan = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!plan) throw new Error('TopStep 50K plan missing');
    return plan;
}

const PLAN = topStep();

const FUNDED: AccountSnapshotInput = {
    asOf: '2026-03-02',
    balance: dollars(52_000),
    dashboardConvention: DashboardBalanceConvention.Nominal,
    firstFundedTradeOn: '2026-01-05',
    highestEodBalance: dollars(52_000),
    highestIntradayBalance: dollars(52_000),
    payoutsTaken: 0,
    stage: SizingStage.Funded,
    tradingDays: 12,
};

function hazardOf(sentLiveShare: number): LiveTransferHazardAssumption {
    return {
        bias: AssumptionBias.Neutral,
        continuation: LiveTransferContinuationKind.NotModeled,
        hazard: 0.3,
        kind: AssumptionKind.LiveTransferHazard,
        notes: [],
        sentLiveShare,
    };
}

function triggerOf(amount: number): CumulativePayoutTriggerAssumption {
    return {
        amount,
        bias: AssumptionBias.Neutral,
        continuation: LiveTransferContinuationKind.NotModeled,
        kind: AssumptionKind.CumulativePayoutTriggerPriced,
        notes: [],
        source: {
            fetchedOn: '2026-09-01',
            quote: 'a synthetic test quote',
            url: 'https://example.test/policy',
        },
    };
}

const SLOT_RATE_TRIGGER_TEXT =
    'The fresh-account rate is the average-reward DP slot rate, which prices no cumulative payout trigger, while the keep rate prices the firm confirmed one.';

function accountModelOf(
    valueNow: ReturnType<typeof valueOf>,
    milestoneValue: ReturnType<typeof valueOf>,
    milestoneKind: MilestoneKind.Eval | MilestoneKind.Funded = MilestoneKind.Funded,
) {
    const { account } = requests();
    const key = overviewRequestKey(account);
    const outcome: OverviewOutcome = {
        key,
        kind: OverviewOutcomeKind.Succeeded,
        result: {
            figures: {
                milestone: {
                    debited: 500,
                    kind: milestoneKind,
                    received: 400,
                    unmetGates: [],
                    value: {
                        kind: ValueChainStepOutcomeKind.Value,
                        value: milestoneValue,
                    },
                },
                nextPayout: null,
                stage: SizingStage.Funded,
                startBasis: StartBasis.FromState,
                trials: 2000,
                valueNow,
            },
            kind: OverviewRequestKind.AccountFromState,
        },
    };
    const view = accountFromStateViewOf(
        { failure: null, outcomes: new Map([[key, outcome]]) },
        account,
    );
    if (view.kind !== AccountFromStateViewKind.Ready) {
        throw new Error('expected ready');
    }
    return view.model;
}

function requests() {
    const built = fromStateDetailRequestsOf({
        input: FUNDED,
        measuredRebuyLag: null,
        pendingPayoutCounts: NO_PENDING_PAYOUT_COUNTS,
        personalMaxRiskPerTrade: null,
        personalRules: null,
        plan: PLAN,
        rulebook: DEFAULT_RULEBOOK,
    });
    if (built === null) throw new Error('no requests');
    return built;
}

function retireModelOf(figures: RetireComparisonResult) {
    const { retire } = requests();
    const key = overviewRequestKey(retire);
    const outcome: OverviewOutcome = {
        key,
        kind: OverviewOutcomeKind.Succeeded,
        result: { figures, kind: OverviewRequestKind.RetireComparison },
    };
    const view = retireViewOf(
        { failure: null, outcomes: new Map([[key, outcome]]) },
        retire,
    );
    if (view.kind !== RetireViewKind.Ready) throw new Error('expected ready');
    return view.model;
}

function valueOf(
    creditFree: number,
    cumulativePayoutTrigger?: CumulativePayoutTriggerAssumption,
) {
    return {
        creditFree: { standardError: 5, value: creditFree },
        creditInclusive: { standardError: 5, value: creditFree + 10 },
        ...(cumulativePayoutTrigger !== undefined && {
            cumulativePayoutTrigger,
        }),
        kind: ValueResultKind.Value as const,
        seed: 42,
        trials: 2000,
    };
}

const RETIRE_RESULT: RetireComparisonResult = {
    basis: RetireComparisonBasis.Simulator,
    keepRate: { standardError: 0.4, value: 12.345 },
    reason: RetireComparisonReason.NotCapacityBound,
    remainingDays: 200,
    switchCost: 150,
    switchRate: { standardError: 0.6, value: 14.2 },
    verdict: RetireComparisonVerdict.Keep,
};

describe('the from-state account figures name the cumulative trigger they priced (PT-36r, F-145)', () => {
    it('labels the trigger behind the value from this state and behind the milestone value', () => {
        const model = accountModelOf(
            valueOf(1800, triggerOf(100_000)),
            valueOf(2500, triggerOf(90_000)),
        );

        expect(model.liveTransferNotes).toEqual([
            `Value from this state. ${assumptionText(triggerOf(100_000))}`,
            `Value at the milestone. ${assumptionText(triggerOf(90_000))}`,
        ]);
    });

    it('has no trigger note when the figures priced no trigger', () => {
        expect(
            accountModelOf(valueOf(1800), valueOf(2500)).liveTransferNotes,
        ).toEqual([]);
    });
});

describe('the retire comparison names the cumulative trigger it priced (PT-36r, F-145)', () => {
    it('lists the keep and fresh-account trigger lines', () => {
        const model = retireModelOf({
            ...RETIRE_RESULT,
            cumulativePayoutTrigger: triggerOf(100_000),
            replacementCumulativePayoutTrigger: triggerOf(100_000),
        });

        expect(model.liveTransferNotes).toStrictEqual([
            `Keeping this account. ${assumptionText(triggerOf(100_000))}`,
            `A fresh account. ${assumptionText(triggerOf(100_000))}`,
        ]);
    });

    it('says in words that the DP slot rate prices no trigger when the keep run does', () => {
        const model = retireModelOf({
            ...RETIRE_RESULT,
            basis: RetireComparisonBasis.AverageRewardDp,
            cumulativePayoutTrigger: triggerOf(100_000),
            isSlotRateTriggerFree: true,
        });

        expect(model.liveTransferNotes).toStrictEqual([
            `Keeping this account. ${assumptionText(triggerOf(100_000))}`,
            SLOT_RATE_TRIGGER_TEXT,
        ]);
    });

    it('does not tell the trader a fresh account wins on a slot rate that prices no trigger', () => {
        const model = retireModelOf({
            ...RETIRE_RESULT,
            basis: RetireComparisonBasis.AverageRewardDp,
            cumulativePayoutTrigger: triggerOf(100_000),
            isSlotRateTriggerFree: true,
            reason: null,
            verdict: RetireComparisonVerdict.SwitchBeatsKeep,
        });

        expect(model.verdict).not.toContain('would beat keeping');
        expect(model.verdict).toBe(
            'Not comparable at this trigger: the fresh-account rate prices no cumulative payout trigger',
        );
    });

    it('names both gaps when the slot rate prices neither the hazard nor the trigger', () => {
        const model = retireModelOf({
            ...RETIRE_RESULT,
            basis: RetireComparisonBasis.AverageRewardDp,
            cumulativePayoutTrigger: triggerOf(100_000),
            isSlotRateHazardFree: true,
            isSlotRateTriggerFree: true,
            liveTransfer: hazardOf(0.41),
            reason: null,
            verdict: RetireComparisonVerdict.SwitchBeatsKeep,
        });

        expect(model.verdict).toBe(
            'Not comparable at this hazard and trigger: the fresh-account rate prices no live-transfer hazard and no cumulative payout trigger',
        );
    });

    it('keeps the keep verdict on a slot rate that prices no trigger', () => {
        const model = retireModelOf({
            ...RETIRE_RESULT,
            basis: RetireComparisonBasis.AverageRewardDp,
            cumulativePayoutTrigger: triggerOf(100_000),
            isSlotRateTriggerFree: true,
        });

        expect(model.verdict).toBe('Keep this account');
    });

    it('adds nothing when no trigger was priced', () => {
        expect(retireModelOf(RETIRE_RESULT).liveTransferNotes).toEqual([]);
    });
});
