import { describe, expect, it } from 'vitest';

import {
    type OverviewOutcome,
    OverviewOutcomeKind,
    overviewRequestKey,
    OverviewRequestKind,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    fromStateDetailRequestsOf,
    RetireViewKind,
    retireViewOf,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/fromStateDetail';
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
    DashboardBalanceConvention,
    DEFAULT_RULEBOOK,
    type LiveTransferHazardAssumption,
    NO_PENDING_PAYOUT_COUNTS,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import {
    RetireComparisonBasis,
    RetireComparisonReason,
    type RetireComparisonResult,
    RetireComparisonVerdict,
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

const SLOT_RATE_TEXT =
    'The fresh-account rate is the average-reward DP slot rate, which prices no live-transfer hazard, while the keep rate prices yours.';

const RETIRE_RESULT: RetireComparisonResult = {
    basis: RetireComparisonBasis.Simulator,
    keepRate: { standardError: 0.4, value: 12.345 },
    reason: RetireComparisonReason.NotCapacityBound,
    remainingDays: 200,
    switchCost: 150,
    switchRate: { standardError: 0.6, value: 14.2 },
    verdict: RetireComparisonVerdict.Keep,
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

function retireModelOf(figures: RetireComparisonResult) {
    const built = fromStateDetailRequestsOf({
        input: FUNDED,
        measuredRebuyLag: null,
        pendingPayoutCounts: NO_PENDING_PAYOUT_COUNTS,
        personalMaxRiskPerTrade: null,
        personalRules: null,
        plan: topStep(),
        rulebook: DEFAULT_RULEBOOK,
    });
    if (built === null) throw new Error('no requests');
    const key = overviewRequestKey(built.retire);
    const outcome: OverviewOutcome = {
        key,
        kind: OverviewOutcomeKind.Succeeded,
        result: { figures, kind: OverviewRequestKind.RetireComparison },
    };
    const view = retireViewOf(
        { failure: null, outcomes: new Map([[key, outcome]]) },
        built.retire,
    );
    if (view.kind !== RetireViewKind.Ready) throw new Error('expected ready');
    return view.model;
}

describe('the retire model carries its hazard lines as a typed list (PT-73g step 6)', () => {
    it('lists the keep and fresh-account hazard lines apart from the information-only note', () => {
        const model = retireModelOf({
            ...RETIRE_RESULT,
            liveTransfer: hazardOf(0.41),
            replacementLiveTransfer: hazardOf(0.52),
        });

        expect(model.liveTransferNotes).toStrictEqual([
            `Keeping this account. ${assumptionText(hazardOf(0.41))}`,
            `A fresh account. ${assumptionText(hazardOf(0.52))}`,
        ]);
        expect(model.note.toLowerCase()).toContain('information only');
        expect(model.note).not.toContain('Live transfer');
        expect(model.note).not.toContain('Keeping this account.');
    });

    it('lists the slot-rate sentence between the keep and fresh-account lines, not inside the note', () => {
        const model = retireModelOf({
            ...RETIRE_RESULT,
            basis: RetireComparisonBasis.AverageRewardDp,
            isSlotRateHazardFree: true,
            liveTransfer: hazardOf(0.41),
        });

        expect(model.liveTransferNotes).toStrictEqual([
            `Keeping this account. ${assumptionText(hazardOf(0.41))}`,
            SLOT_RATE_TEXT,
        ]);
        expect(model.note).not.toContain(SLOT_RATE_TEXT);
    });

    it('has an empty list when no hazard was priced', () => {
        expect(retireModelOf(RETIRE_RESULT).liveTransferNotes).toStrictEqual(
            [],
        );
    });
});

describe('the retire model carries a typed not-comparable field beside the verdict (PT-73g step 6)', () => {
    it('is not comparable when a fresh account wins only on a slot rate that prices no hazard', () => {
        const model = retireModelOf({
            ...RETIRE_RESULT,
            basis: RetireComparisonBasis.AverageRewardDp,
            isSlotRateHazardFree: true,
            liveTransfer: hazardOf(0.41),
            reason: null,
            verdict: RetireComparisonVerdict.SwitchBeatsKeep,
        });

        expect(model.isComparable).toBe(false);
    });

    it.each<{
        readonly figures: RetireComparisonResult;
        readonly label: string;
    }>([
        {
            figures: { ...RETIRE_RESULT },
            label: 'a keep verdict with no hazard',
        },
        {
            figures: {
                ...RETIRE_RESULT,
                basis: RetireComparisonBasis.AverageRewardDp,
                isSlotRateHazardFree: true,
                liveTransfer: hazardOf(0.41),
            },
            label: 'a keep verdict on a slot rate that prices no hazard',
        },
        {
            figures: {
                ...RETIRE_RESULT,
                liveTransfer: hazardOf(0.41),
                reason: null,
                replacementLiveTransfer: hazardOf(0.52),
                verdict: RetireComparisonVerdict.SwitchBeatsKeep,
            },
            label: 'a fresh-account win simulated under the same hazard',
        },
    ])('is comparable for $label', ({ figures }) => {
        expect(retireModelOf(figures).isComparable).toBe(true);
    });
});
