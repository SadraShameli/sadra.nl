import { describe, expect, it } from 'vitest';

import {
    ALL_FIRMS,
    ApexVariant,
    dollars,
    findFirm,
    FirmId,
    LucidVariant,
    type Plan,
    type PlanId,
    serializePlanId,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    type AccountSnapshotInput,
    DashboardBalanceConvention,
    LiveApplicabilityKind,
    LiveApplicabilityNote,
    LiveNotModeledReason,
    livePlanApplicability,
    liveTransitionPreview,
    LiveTransitionPreviewGap,
    LiveTransitionPreviewKind,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import {
    buildLucidDailyLivePlan,
    buildTopStepLivePlan,
    computeTopStepLiveStartingBalance,
    LUCID_DAILY_LIVE_TRANSITION_PAYOUT_CAP,
    LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
} from '~/lib/prop-calculator/firms';

const TOPSTEP_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};
const TOPSTEP_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.ProAccount,
};
const LUCID_DAILY_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Lucid,
    variant: LucidVariant.DailyEod,
};
const LUCID_FLEX_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Lucid,
    variant: LucidVariant.Flex,
};
const LUCID_MAXX_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Lucid,
    variant: LucidVariant.Maxx,
};
const APEX_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

const LUCID_DAILY_BUFFER = 52_100;

function inputOf(overrides: Partial<AccountSnapshotInput>): AccountSnapshotInput {
    return {
        asOf: '2026-03-02',
        balance: dollars(60_000),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        firstFundedTradeOn: '2026-01-05',
        highestEodBalance: dollars(60_000),
        highestIntradayBalance: dollars(60_000),
        payoutsTaken: 0,
        stage: SizingStage.Funded,
        ...overrides,
    };
}

function lucidFundedAt(balance: number) {
    const plan = planOf(LUCID_DAILY_ID);
    return AccountReconstruction.rebuild(
        inputOf({
            balance: dollars(balance),
            highestEodBalance: dollars(balance),
            highestIntradayBalance: dollars(balance),
        }),
        plan,
    );
}

function planOf(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

describe('liveTransitionPreview: TopStep', () => {
    const plan = planOf(TOPSTEP_ID);

    it('reads the live start from the builder and says it is inert at 50K', () => {
        const preview = liveTransitionPreview(plan, null);
        if (preview.kind !== LiveTransitionPreviewKind.DocumentedLiveStart) {
            throw new Error('expected a documented live start preview');
        }
        expect(preview.startingBalance).toBe(
            buildTopStepLivePlan().startingBalance,
        );
        expect(preview.startingBalance).toBe(10_000);
        expect(preview.range).toEqual({
            highest: computeTopStepLiveStartingBalance(
                dollars(50_000),
                dollars(50_000),
            ),
            lowest: computeTopStepLiveStartingBalance(
                dollars(0),
                dollars(50_000),
            ),
        });
        expect(preview.isInertAtAccountSize).toBe(true);
        expect(preview.note).toBe(
            LiveApplicabilityNote.TopStepLfaEligibleJurisdictionAssumed,
        );
        expect(preview.isApproximation).toBe(true);
    });

    it('does not depend on the account state', () => {
        const funded = AccountReconstruction.rebuild(
            inputOf({ balance: dollars(53_000), highestEodBalance: dollars(53_000) }),
            plan,
        );
        expect(liveTransitionPreview(plan, funded)).toEqual(
            liveTransitionPreview(plan, null),
        );
    });

    it('is not modeled for an account that is already live', () => {
        const live = AccountReconstruction.rebuild(
            inputOf({ stage: SizingStage.Live }),
            plan,
        );
        expect(liveTransitionPreview(plan, live)).toEqual({
            kind: LiveTransitionPreviewKind.NotModeled,
            reason: LiveNotModeledReason.AlreadyLive,
        });
    });

    it('is not modeled for the terminal Pro account', () => {
        expect(liveTransitionPreview(planOf(TOPSTEP_PRO_ID), null)).toEqual({
            kind: LiveTransitionPreviewKind.NotModeled,
            reason: LiveNotModeledReason.TerminalStage,
        });
    });
});

describe('liveTransitionPreview: LucidDaily', () => {
    const plan = planOf(LUCID_DAILY_ID);

    it('credits the sim profit above the buffer from the reconstructed funded state', () => {
        const preview = liveTransitionPreview(plan, lucidFundedAt(60_000));
        if (preview.kind !== LiveTransitionPreviewKind.LucidDailyCredit) {
            throw new Error('expected a Lucid daily credit preview');
        }
        expect(preview.buffer).toBe(LUCID_DAILY_BUFFER);
        expect(preview.simProfitAboveBuffer).toBe(60_000 - LUCID_DAILY_BUFFER);
        expect(preview.creditGross).toBe(60_000 - LUCID_DAILY_BUFFER);
        expect(preview.isCapped).toBe(false);
        expect(preview.cap).toBe(LUCID_DAILY_LIVE_TRANSITION_PAYOUT_CAP);
        const built = buildLucidDailyLivePlan(
            LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
            dollars(60_000 - LUCID_DAILY_BUFFER),
        );
        expect(preview.creditNet).toBeCloseTo(
            built.payoutFromProfit(built.transitionPayout),
            6,
        );
        expect(preview.creditNet).toBeCloseTo((60_000 - LUCID_DAILY_BUFFER) * 0.9, 6);
        expect(preview.isApproximation).toBe(false);
        expect(preview.note).toBe(
            LiveApplicabilityNote.LucidDailyTransitionPayoutIsPastCash,
        );
    });

    it('caps the credit at the flat transition cap and says so', () => {
        const preview = liveTransitionPreview(plan, lucidFundedAt(80_000));
        if (preview.kind !== LiveTransitionPreviewKind.LucidDailyCredit) {
            throw new Error('expected a Lucid daily credit preview');
        }
        expect(preview.simProfitAboveBuffer).toBe(80_000 - LUCID_DAILY_BUFFER);
        expect(preview.creditGross).toBe(LUCID_DAILY_LIVE_TRANSITION_PAYOUT_CAP);
        expect(preview.isCapped).toBe(true);
        expect(preview.creditNet).toBeCloseTo(
            LUCID_DAILY_LIVE_TRANSITION_PAYOUT_CAP * 0.9,
            6,
        );
    });

    it('credits nothing when the balance is at or below the buffer', () => {
        const preview = liveTransitionPreview(plan, lucidFundedAt(52_000));
        if (preview.kind !== LiveTransitionPreviewKind.LucidDailyCredit) {
            throw new Error('expected a Lucid daily credit preview');
        }
        expect(preview.simProfitAboveBuffer).toBe(0);
        expect(preview.creditGross).toBe(0);
        expect(preview.creditNet).toBe(0);
        expect(preview.isCapped).toBe(false);
    });

    it('needs a funded state: no account or an eval account has no credit to preview', () => {
        const evalAccount = AccountReconstruction.rebuild(
            inputOf({
                balance: dollars(50_500),
                highestEodBalance: dollars(50_500),
                highestIntradayBalance: dollars(50_500),
                stage: SizingStage.Eval,
            }),
            plan,
        );
        for (const account of [null, evalAccount]) {
            expect(liveTransitionPreview(plan, account)).toEqual({
                kind: LiveTransitionPreviewKind.NotModeled,
                reason: LiveTransitionPreviewGap.NoFundedState,
            });
        }
    });
});

describe('liveTransitionPreview: every other plan', () => {
    it('is not modeled for a modeled live plan without a transition quantity', () => {
        expect(liveTransitionPreview(planOf(APEX_ID), null)).toEqual({
            kind: LiveTransitionPreviewKind.NotModeled,
            reason: LiveTransitionPreviewGap.NoTransitionModel,
        });
        expect(liveTransitionPreview(planOf(LUCID_FLEX_ID), null)).toEqual({
            kind: LiveTransitionPreviewKind.NotModeled,
            reason: LiveTransitionPreviewGap.NoTransitionModel,
        });
    });

    it('carries the not-modeled reason of plans the live applicability does not model', () => {
        expect(liveTransitionPreview(planOf(LUCID_MAXX_ID), null)).toEqual({
            kind: LiveTransitionPreviewKind.NotModeled,
            reason: LiveNotModeledReason.AlreadyLive,
        });
    });

    it('gives a preview exactly to the plans with a documented live start or a transition builder', () => {
        for (const firm of ALL_FIRMS) {
            for (const plan of firm.plans) {
                const applicability = livePlanApplicability(plan.id);
                const isCapable =
                    applicability.kind === LiveApplicabilityKind.TransitionBuilder ||
                    (applicability.kind === LiveApplicabilityKind.Builder &&
                        applicability.documentedStart !== null);
                const preview = liveTransitionPreview(plan, null);
                const isPreviewed =
                    preview.kind === LiveTransitionPreviewKind.DocumentedLiveStart ||
                    preview.kind === LiveTransitionPreviewKind.LucidDailyCredit;
                const isGapOnly =
                    preview.kind === LiveTransitionPreviewKind.NotModeled &&
                    preview.reason === LiveTransitionPreviewGap.NoFundedState;
                expect(isPreviewed || isGapOnly).toBe(isCapable);
            }
        }
    });
});
