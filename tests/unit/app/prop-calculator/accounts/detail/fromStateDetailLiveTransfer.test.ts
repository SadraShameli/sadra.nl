import { describe, expect, it } from 'vitest';

import {
    type OverviewOutcome,
    OverviewOutcomeKind,
    overviewRequestKey,
    OverviewRequestKind,
    ValueChainStepOutcomeKind,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import { PAYOUT_STAKE_REQUEST_NOW_TRANSFER_TEXT } from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceValueModel';
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

const HAZARD_LINE =
    'Live transfer: 30.0% per paid payout (your assumption, not a firm rule).';

const SLOT_RATE_TEXT =
    'The fresh-account rate is the average-reward DP slot rate, which prices no live-transfer hazard, while the keep rate prices yours.';

function accountModelOf(
    valueNow: ReturnType<typeof valueOf>,
    milestoneValue: ReturnType<typeof valueOf>,
    milestoneKind:
        MilestoneKind.Eval | MilestoneKind.Funded = MilestoneKind.Funded,
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
    liveTransfer?: LiveTransferHazardAssumption,
) {
    return {
        creditFree: { standardError: 5, value: creditFree },
        creditInclusive: { standardError: 5, value: creditFree + 10 },
        kind: ValueResultKind.Value as const,
        ...(liveTransfer !== undefined && { liveTransfer }),
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

describe('the from-state account figures name the live-transfer hazard they priced (PT-73f step 4)', () => {
    it('labels the hazard behind the value from this state and behind the milestone value', () => {
        const model = accountModelOf(
            valueOf(1800, hazardOf(0.41)),
            valueOf(2500, hazardOf(0.52)),
        );

        expect(model.liveTransferNotes).toEqual([
            `Value from this state. ${assumptionText(hazardOf(0.41))}`,
            `Value at the milestone. ${assumptionText(hazardOf(0.52))}`,
            PAYOUT_STAKE_REQUEST_NOW_TRANSFER_TEXT,
        ]);
        expect(model.liveTransferNotes[0]).toContain(HAZARD_LINE);
    });

    it('says the funded milestone prices the requested payout own transfer chance, once, after its hazard line', () => {
        const model = accountModelOf(
            valueOf(1800, hazardOf(0.41)),
            valueOf(2500, hazardOf(0.52)),
        );

        expect(
            model.liveTransferNotes.filter(
                (note) => note === PAYOUT_STAKE_REQUEST_NOW_TRANSFER_TEXT,
            ),
        ).toHaveLength(1);
        expect(model.liveTransferNotes.at(-1)).toBe(
            PAYOUT_STAKE_REQUEST_NOW_TRANSFER_TEXT,
        );
    });

    it('does not claim an own-draw for an eval milestone that priced a hazard', () => {
        const model = accountModelOf(
            valueOf(1800, hazardOf(0.41)),
            valueOf(2500, hazardOf(0.52)),
            MilestoneKind.Eval,
        );

        expect(model.liveTransferNotes).not.toContain(
            PAYOUT_STAKE_REQUEST_NOW_TRANSFER_TEXT,
        );
    });

    it('does not claim an own-draw when the funded milestone priced no hazard', () => {
        const model = accountModelOf(
            valueOf(1800, hazardOf(0.41)),
            valueOf(2500),
        );

        expect(model.liveTransferNotes).toEqual([
            `Value from this state. ${assumptionText(hazardOf(0.41))}`,
        ]);
    });

    it('has no live-transfer note when the figures priced no hazard', () => {
        const model = accountModelOf(valueOf(1800), valueOf(2500));

        expect(model.liveTransferNotes).toEqual([]);
    });
});

describe('the retire comparison names the live-transfer hazard it priced (PT-73f step 4)', () => {
    it('keeps the information-only note and adds the keep and fresh-account hazard lines', () => {
        const model = retireModelOf({
            ...RETIRE_RESULT,
            liveTransfer: hazardOf(0.41),
            replacementLiveTransfer: hazardOf(0.52),
        });

        expect(model.note.toLowerCase()).toContain('information only');
        expect(model.liveTransferNotes).toContain(
            `Keeping this account. ${assumptionText(hazardOf(0.41))}`,
        );
        expect(model.liveTransferNotes).toContain(
            `A fresh account. ${assumptionText(hazardOf(0.52))}`,
        );
        expect(model.liveTransferNotes).not.toContain(SLOT_RATE_TEXT);
    });

    it('says in words that the DP slot rate prices no hazard when the keep run does', () => {
        const model = retireModelOf({
            ...RETIRE_RESULT,
            basis: RetireComparisonBasis.AverageRewardDp,
            isSlotRateHazardFree: true,
            liveTransfer: hazardOf(0.41),
        });

        expect(model.liveTransferNotes).toContain(
            `Keeping this account. ${assumptionText(hazardOf(0.41))}`,
        );
        expect(model.liveTransferNotes).toContain(SLOT_RATE_TEXT);
        expect(model.liveTransferNotes.join(' ')).not.toContain(
            'A fresh account. Live transfer',
        );
    });

    it('adds nothing to the note when no hazard was priced', () => {
        const model = retireModelOf(RETIRE_RESULT);

        expect(model.liveTransferNotes).toEqual([]);
        expect(model.note).not.toContain('Live transfer');
        expect(model.note).not.toContain('slot rate');
    });
    it('does not tell the trader a fresh account wins on a slot rate that prices no hazard', () => {
        const model = retireModelOf({
            ...RETIRE_RESULT,
            basis: RetireComparisonBasis.AverageRewardDp,
            isSlotRateHazardFree: true,
            liveTransfer: hazardOf(0.41),
            reason: null,
            verdict: RetireComparisonVerdict.SwitchBeatsKeep,
        });

        expect(model.verdict).not.toContain('would beat keeping');
        expect(model.verdict).toBe(
            'Not comparable at this hazard: the fresh-account rate prices no live-transfer hazard',
        );
    });

    it('keeps the fresh-account verdict when the replacement was simulated under the same hazard', () => {
        const model = retireModelOf({
            ...RETIRE_RESULT,
            liveTransfer: hazardOf(0.41),
            reason: null,
            replacementLiveTransfer: hazardOf(0.52),
            verdict: RetireComparisonVerdict.SwitchBeatsKeep,
        });

        expect(model.verdict).toBe(
            'A fresh account would beat keeping this one',
        );
    });

    it('keeps the keep verdict on a slot rate that prices no hazard', () => {
        const model = retireModelOf({
            ...RETIRE_RESULT,
            basis: RetireComparisonBasis.AverageRewardDp,
            isSlotRateHazardFree: true,
            liveTransfer: hazardOf(0.41),
        });

        expect(model.verdict).toBe('Keep this account');
    });
});
