import { beforeAll, describe, expect, it } from 'vitest';

import {
    type AccountFromStateFigures,
    overviewAccountRequestsFor,
    OverviewOutcomeKind,
    overviewOutcomeOf,
    type OverviewRequest,
    OverviewRequestKind,
    ValueChainStepOutcomeKind,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    dollars,
    findFirm,
    FirmId,
    InstrumentSymbol,
    MffuVariant,
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    type AccountSnapshotInput,
    DashboardBalanceConvention,
    DEFAULT_RULEBOOK,
    NO_PENDING_PAYOUT_COUNTS,
    ReconstructedLiveKind,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import {
    MilestoneKind,
    milestoneState,
    payoutStakeComparison,
    type PayoutStakeComparisonResult,
    requestNowValue,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';

const HAZARD = 0.3;
const RUN = { maxEvalDays: 40, seed: 5, trials: 40 } as const;
const SIZED = { instrument: InstrumentSymbol.MNQ, stopPoints: 10 } as const;

function rapidEodPlan(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

const PLAN = rapidEodPlan();

const SNAPSHOT: AccountSnapshotInput = {
    asOf: '2026-03-02',
    balance: dollars(53_000),
    dashboardConvention: DashboardBalanceConvention.Nominal,
    firstFundedTradeOn: '2026-01-05',
    highestEodBalance: dollars(53_000),
    highestIntradayBalance: dollars(53_000),
    payoutsTaken: 0,
    stage: SizingStage.Funded,
    tradingDays: 12,
};

function figuresOf(request: OverviewRequest): AccountFromStateFigures {
    const outcome = overviewOutcomeOf(request);
    if (outcome.kind !== OverviewOutcomeKind.Succeeded) {
        throw new Error(`expected success, got: ${outcome.reason}`);
    }
    if (outcome.result.kind !== OverviewRequestKind.AccountFromState) {
        throw new Error('expected an account-from-state result');
    }
    return outcome.result.figures;
}

function milestoneValue(figures: AccountFromStateFigures) {
    const { value } = figures.milestone;
    if (value.kind !== ValueChainStepOutcomeKind.Value) {
        throw new Error(`expected a milestone value, got: ${value.reason}`);
    }
    return value.value;
}

function requestWith(
    hazard: number | undefined,
    isSized: boolean,
): OverviewRequest {
    const [first] = overviewAccountRequestsFor(
        [
            {
                account: SNAPSHOT,
                firmId: FirmId.Mffu,
                measuredRebuyLag: null,
                optIns: NO_PLAN_OPT_INS,
                pendingPayoutCounts: NO_PENDING_PAYOUT_COUNTS,
                planSerial: serializePlanId(PLAN.id),
            },
        ],
        {
            ...DEFAULT_RULEBOOK,
            liveTransfer: {
                hazardPerPaidPayoutByFirm:
                    hazard === undefined ? {} : { [FirmId.Mffu]: hazard },
            },
        },
    );
    if (first === undefined) throw new Error('no account request');
    return {
        ...first,
        spec: {
            ...first.spec,
            enginePolicy: {
                ...first.spec.enginePolicy,
                ...(isSized && SIZED),
            },
            run: RUN,
        },
    };
}

function stakeOf(request: OverviewRequest): PayoutStakeComparisonResult {
    const account = AccountReconstruction.rebuild(
        request.account ?? SNAPSHOT,
        PLAN,
        null,
        NO_PENDING_PAYOUT_COUNTS,
    );
    const outcome = payoutStakeComparison(account, request.spec);
    if (outcome.kind !== ValueResultKind.PayoutStake) {
        throw new Error('expected a payout stake comparison');
    }
    return outcome;
}

describe('the overview funded milestone is the planner request-now figure (PT-73g step 1)', () => {
    describe.each([
        { isSized: true, label: 'a modeled live plan' },
        { isSized: false, label: 'no modeled live plan' },
    ])('at a 30% hazard with $label', ({ isSized }) => {
        let figures: AccountFromStateFigures;
        let stake: PayoutStakeComparisonResult;

        beforeAll(() => {
            const request = requestWith(HAZARD, isSized);
            figures = figuresOf(request);
            stake = stakeOf(request);
        });

        it('equals the payout stake request-now on both credit bases and carries its own sent-live share', () => {
            const value = milestoneValue(figures);

            expect(value.creditFree).toStrictEqual(stake.requestNow.creditFree);
            expect(value.creditInclusive).toStrictEqual(
                stake.requestNow.creditInclusive,
            );
            expect(value.liveTransfer).toStrictEqual(
                stake.requestNow.liveTransfer,
            );
            expect(figures.milestone.received).toBe(stake.traderReceivesNow);
        });
    });

    describe('with no hazard', () => {
        it('equals the payout stake request-now and the unpriced cash plus value after the payout, to the cent', () => {
            const request = requestWith(undefined, true);
            const figures = figuresOf(request);
            const stake = stakeOf(request);
            const account = AccountReconstruction.rebuild(
                request.account ?? SNAPSHOT,
                PLAN,
                null,
                NO_PENDING_PAYOUT_COUNTS,
            );
            if (account.kind === ReconstructedLiveKind.Live)
                throw new Error('expected non-live');
            const milestone = milestoneState(account, request.spec);
            if (milestone.kind !== MilestoneKind.Funded) {
                throw new Error('expected a funded milestone');
            }
            const { continuation } = requestNowValue(
                account,
                milestone,
                request.spec,
            );
            const value = milestoneValue(figures);

            expect(value.creditFree).toStrictEqual(stake.requestNow.creditFree);
            expect(value.creditFree.value).toBeCloseTo(
                continuation.creditFree.value + milestone.traderReceives,
                2,
            );
            expect(value.creditInclusive.value).toBeCloseTo(
                continuation.creditInclusive.value + milestone.traderReceives,
                2,
            );
            expect('liveTransfer' in value).toBe(false);
        });
    });
});
