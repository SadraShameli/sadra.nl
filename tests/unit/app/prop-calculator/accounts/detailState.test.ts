import { describe, expect, it } from 'vitest';

import {
    type DetailSnapshotRow,
    liveAccountOf,
    LiveRulesCardKind,
    liveRulesCardOf,
    performanceCardOf,
    previousReconstructionOf,
    StateCardKind,
    stateCardOf,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/detailState';
import {
    type FirmPayoutCount,
    firmPayoutCountOf,
    type SnapshotAccountRow,
    type SnapshotEventRow,
    type SnapshotPayoutRow,
} from '~/lib/prop-accounts/advice';
import {
    AccountStage,
    AccountTracking,
    type ModeledAccountRow,
    PayoutStatus,
    usdCents,
} from '~/lib/prop-accounts/core';
import {
    ConsistencyStatusKind,
    payoutReadinessBoardOf,
    PayoutReadinessRowKind,
    PerformanceComparabilityKind,
    PerformanceIncomparabilityReason,
} from '~/lib/prop-accounts/metrics';
import {
    ApexVariant,
    createInitialState,
    dollars,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    FtmoFuturesVariant,
    FundedNextVariant,
    type LiveTransitionTrigger,
    MffuVariant,
    PayoutCountTotalTrigger,
    type Plan,
    type PlanId,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    AssumptionBias,
    AssumptionKind,
    assumptionKindText,
    createSizingAdvisor,
    DashboardBalanceConvention,
    DEFAULT_RULEBOOK,
    LiveTriggerScope,
    NO_PENDING_PAYOUT_COUNTS,
    PayoutBlockReasonKind,
    PayoutRequestDecisionKind,
    PENDING_PAYOUT_COUNTS_NOT_CHECKED,
    type ReconstructedAccount,
    ReconstructedLiveKind,
    ReconstructionErrorReason,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

import { reconstructedEntry } from '../../../lib/prop-accounts/reconstructionFixtures';

const APEX_EOD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

const TOPSTEP_STANDARD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

const FUNDEDNEXT_LEGACY_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.FundedNext,
    variant: FundedNextVariant.Legacy,
};

const FTMO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.FtmoFutures,
    variant: FtmoFuturesVariant.Growth,
};

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

const MFF_BUILDER_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Builder,
};

const MFF_RAPID_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Rapid,
};

function accountRow(id: PlanId): ModeledAccountRow<SnapshotAccountRow> {
    return {
        accountSize: id.accountSize,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalFirmId: null,
        firmId: id.firm,
        firstFundedTradeOn: null,
        fundedOn: '2026-01-01',
        id: '00000000-0000-4000-8000-000000000001',
        liveStartBalanceCents: null,
        planLabel: null,
        planSerial: serializePlanId(id),
        purchasedOn: '2026-01-01',
        stage: AccountStage.Funded,
        tracking: AccountTracking.Modeled,
    };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function snapshotRow(
    overrides: Partial<DetailSnapshotRow> = {},
): DetailSnapshotRow {
    return {
        asOf: '2026-02-10',
        balanceAtLastPayoutCents: null,
        balanceCents: usdCents(5_240_000),
        createdAt: new Date('2026-02-10T00:00:00Z'),
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: null,
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: usdCents(5_300_000),
        highestIntradayBalanceCents: null,
        id: 'snapshot-1',
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: 0,
        qualifyingDaysSinceLastPayout: null,
        tradingDays: 20,
        ...overrides,
    };
}

const NO_EVENTS: readonly SnapshotEventRow[] = [];
const NO_PAYOUTS: readonly SnapshotPayoutRow[] = [];

function firmCountOf(id: PlanId): FirmPayoutCount {
    return firmPayoutCountOf(
        id.firm,
        [{ events: NO_EVENTS, payouts: NO_PAYOUTS }],
        '2026-02-10',
    );
}

describe('stateCardOf', () => {
    it('reports no snapshot yet when the account has none', () => {
        const view = stateCardOf(
            registryPlan(MFF_PRO_ID),
            accountRow(MFF_PRO_ID),
            null,
            NO_EVENTS,
            NO_PAYOUTS,
            '2026-02-10',
            firmCountOf(MFF_PRO_ID),
        );
        expect(view).toEqual({ kind: StateCardKind.NoSnapshot });
    });

    it('reconstructs the floor, lock and cushion from the latest snapshot', () => {
        const view = stateCardOf(
            registryPlan(MFF_PRO_ID),
            accountRow(MFF_PRO_ID),
            snapshotRow(),
            NO_EVENTS,
            NO_PAYOUTS,
            '2026-02-10',
            firmCountOf(MFF_PRO_ID),
        );
        if (view.kind !== StateCardKind.Ready) {
            throw new Error('expected a ready state card');
        }
        expect(view.asOf).toBe('2026-02-10');
        if (view.account.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(view.account.state.threshold).toBe(51_000);
        expect(view.account.state.thresholdLocked).toBe(false);
        expect(view.account.cushion).toBe(1400);
        expect(view.issues).toEqual([]);
    });

    it('lists plausibility issues alongside a successful reconstruction', () => {
        const view = stateCardOf(
            registryPlan(MFF_PRO_ID),
            accountRow(MFF_PRO_ID),
            snapshotRow({
                balanceCents: usdCents(5_240_000),
                highestEodBalanceCents: usdCents(5_000_000),
            }),
            NO_EVENTS,
            NO_PAYOUTS,
            '2026-02-10',
            firmCountOf(MFF_PRO_ID),
        );
        if (view.kind !== StateCardKind.Ready) {
            throw new Error('expected a ready state card');
        }
        expect(view.issues.length).toBeGreaterThan(0);
        expect(view.issues[0]?.message).toContain('highest end-of-day balance');
    });

    it("carries the account's personal max risk per trade into the reconstruction", () => {
        const view = stateCardOf(
            registryPlan(MFF_PRO_ID),
            {
                ...accountRow(MFF_PRO_ID),
                personalRules: { maxRiskPerTradeCents: usdCents(20_000) },
            },
            snapshotRow(),
            NO_EVENTS,
            NO_PAYOUTS,
            '2026-02-10',
            firmCountOf(MFF_PRO_ID),
        );
        if (view.kind !== StateCardKind.Ready) {
            throw new Error('expected a ready state card');
        }
        if (view.account.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(view.account.personalMaxRiskPerTrade).toBe(200);
    });

    it('shows the intraday-peak-required message instead of numbers on an intraday-trailing plan with no peak entered', () => {
        const view = stateCardOf(
            registryPlan(MFF_RAPID_ID),
            accountRow(MFF_RAPID_ID),
            snapshotRow({ highestEodBalanceCents: null }),
            NO_EVENTS,
            NO_PAYOUTS,
            '2026-02-10',
            firmCountOf(MFF_RAPID_ID),
        );
        expect(view.kind).toBe(StateCardKind.PeakRequired);
        if (view.kind !== StateCardKind.PeakRequired) return;
        expect(view.reason).toBe(
            ReconstructionErrorReason.IntradayPeakRequired,
        );
        expect(view.message).toContain('intraday');
    });
});

describe('previousReconstructionOf', () => {
    it('is null with no previous snapshot', () => {
        expect(
            previousReconstructionOf(
                registryPlan(MFF_PRO_ID),
                accountRow(MFF_PRO_ID),
                null,
                NO_EVENTS,
                NO_PAYOUTS,
                '2026-02-10',
                firmCountOf(MFF_PRO_ID),
            ),
        ).toBeNull();
    });

    it('is null when the snapshot is impossible rather than throwing', () => {
        const result = previousReconstructionOf(
            registryPlan(MFF_PRO_ID),
            accountRow(MFF_PRO_ID),
            snapshotRow({
                balanceCents: usdCents(4_000_000),
                highestEodBalanceCents: usdCents(3_000_000),
            }),
            NO_EVENTS,
            NO_PAYOUTS,
            '2026-02-10',
            firmCountOf(MFF_PRO_ID),
        );
        expect(result).toBeNull();
    });

    it('reconstructs a plausible previous snapshot', () => {
        const result = previousReconstructionOf(
            registryPlan(MFF_PRO_ID),
            accountRow(MFF_PRO_ID),
            snapshotRow({
                asOf: '2026-02-01',
                balanceCents: usdCents(5_000_000),
            }),
            NO_EVENTS,
            NO_PAYOUTS,
            '2026-02-10',
            firmCountOf(MFF_PRO_ID),
        );
        expect(result?.asOf).toBe('2026-02-01');
    });
});

describe('liveAccountOf', () => {
    it('is null unless the state card is ready with a live reconstruction', () => {
        expect(liveAccountOf({ kind: StateCardKind.NoSnapshot })).toBeNull();
    });
});

describe('liveRulesCardOf', () => {
    it('reports not modeled for a firm that runs no live program', () => {
        const view = liveRulesCardOf(registryPlan(FTMO_ID), null);
        expect(view).toEqual({ kind: LiveRulesCardKind.NotModeled });
    });

    it('reports pending when a builder applies but no reconstruction exists yet', () => {
        const view = liveRulesCardOf(registryPlan(APEX_EOD_ID), null);
        expect(view).toEqual({ kind: LiveRulesCardKind.Pending });
    });

    it('shows the modeled live rules with no approximation for a verified, non-defaulted builder', () => {
        const plan = registryPlan(APEX_EOD_ID);
        const account = AccountReconstruction.rebuild(
            {
                asOf: '2026-02-10',
                balance: dollars(2000),
                dashboardConvention: DashboardBalanceConvention.Nominal,
                highestEodBalance: dollars(2000),
                stage: SizingStage.Live,
            },
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        if (account.kind !== ReconstructedLiveKind.Live) {
            throw new Error('expected a live reconstruction');
        }
        const view = liveRulesCardOf(plan, account);
        if (view.kind !== LiveRulesCardKind.Modeled) {
            throw new Error('expected a modeled live rules view');
        }
        expect(view.isApproximation).toBe(false);
        expect(view.requiresLockForWithdrawal).toBe(true);
        expect(view.minPayoutRequest).toBe(500);
        expect(view.drawdown).toEqual({ amount: 3000, kind: 'eod-trailing' });
        expect(view.contractLimit).toEqual({ micros: 100, minis: 10 });
    });

    it('flags the approximation when only a firm-level (defaulted) builder applies', () => {
        const plan = registryPlan(TOPSTEP_STANDARD_ID);
        const account = AccountReconstruction.rebuild(
            {
                asOf: '2026-02-10',
                balance: dollars(11_000),
                dashboardConvention: DashboardBalanceConvention.Nominal,
                stage: SizingStage.Live,
            },
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        if (account.kind !== ReconstructedLiveKind.Live) {
            throw new Error('expected a live reconstruction');
        }
        const view = liveRulesCardOf(plan, account);
        if (view.kind !== LiveRulesCardKind.Modeled) {
            throw new Error('expected a modeled live rules view');
        }
        expect(view.isApproximation).toBe(true);
    });

    it('reports not modeled when the reconstruction itself found no live program (a separate live program firm)', () => {
        const plan = registryPlan(FUNDEDNEXT_LEGACY_ID);
        const account = AccountReconstruction.rebuild(
            {
                asOf: '2026-02-10',
                balance: dollars(10_000),
                dashboardConvention: DashboardBalanceConvention.Nominal,
                dashboardFloor: dollars(8000),
                liveStartBalance: dollars(10_000),
                stage: SizingStage.Live,
            },
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        if (account.kind !== ReconstructedLiveKind.Live) {
            throw new Error('expected a live reconstruction');
        }
        expect(liveRulesCardOf(plan, account)).toEqual({
            kind: LiveRulesCardKind.NotModeled,
        });
    });
});

function evalAt(
    plan: Plan,
    balance: number,
    tradingDays: number,
): ReconstructedAccount {
    return {
        assumptions: [],
        contractLimit: null,
        cushion:
            balance -
            (plan.accountSize - plan.drawdownFor(TradingPhase.Eval).amount),
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan,
        resolvedDailyLossLimit: null,
        state: {
            ...createInitialState(plan.accountSize, 0),
            balance,
            tradingDays,
        },
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

describe('performanceCardOf', () => {
    it('reports no previous snapshot to compare against', () => {
        const plan = registryPlan(MFF_PRO_ID);
        const account = evalAt(plan, 51_000, 5);
        const view = performanceCardOf(
            {
                account,
                asOf: '2026-02-10',
                input: {
                    asOf: '2026-02-10',
                    balance: dollars(51_000),
                    dashboardConvention: DashboardBalanceConvention.Nominal,
                    stage: SizingStage.Eval,
                },
            },
            null,
            [],
            [],
        );
        expect(view.performance).toEqual({
            kind: PerformanceComparabilityKind.NotComparable,
            reason: PerformanceIncomparabilityReason.NoPreviousSnapshot,
        });
    });

    it('reports comparable performance since the previous snapshot', () => {
        const plan = registryPlan(MFF_PRO_ID);
        const latest = evalAt(plan, 52_000, 10);
        const previous = evalAt(plan, 51_000, 5);
        const view = performanceCardOf(
            {
                account: latest,
                asOf: '2026-02-10',
                input: {
                    asOf: '2026-02-10',
                    balance: dollars(52_000),
                    dashboardConvention: DashboardBalanceConvention.Nominal,
                    stage: SizingStage.Eval,
                },
            },
            { account: previous, asOf: '2026-02-01' },
            [],
            [],
        );
        expect(view.performance).toMatchObject({
            kind: PerformanceComparabilityKind.Comparable,
            normalizedBalanceChange: 1000,
            profitSinceSnapshot: 1000,
            tradingDaysElapsed: 5,
        });
    });

    it('reports not evaluated for eval consistency without a recorded best day', () => {
        const plan = registryPlan(MFF_PRO_ID);
        const account = evalAt(plan, 51_000, 5);
        const view = performanceCardOf(
            {
                account,
                asOf: '2026-02-10',
                input: {
                    asOf: '2026-02-10',
                    balance: dollars(51_000),
                    dashboardConvention: DashboardBalanceConvention.Nominal,
                    stage: SizingStage.Eval,
                },
            },
            null,
            [],
            [],
        );
        expect(view.consistency.kind).toBe(ConsistencyStatusKind.NotEvaluated);
    });

    it('evaluates eval consistency once a best day is recorded', () => {
        const plan = registryPlan(MFF_PRO_ID);
        const account = evalAt(plan, 53_000, 5);
        const view = performanceCardOf(
            {
                account,
                asOf: '2026-02-10',
                input: {
                    asOf: '2026-02-10',
                    balance: dollars(53_000),
                    dashboardConvention: DashboardBalanceConvention.Nominal,
                    evalBestDayProfit: dollars(2000),
                    stage: SizingStage.Eval,
                },
            },
            null,
            [],
            [],
        );
        expect(view.consistency).toMatchObject({
            bestDayProfit: 2000,
            kind: ConsistencyStatusKind.Evaluated,
            totalProfit: 3000,
        });
    });

    it('reports not evaluated for funded consistency without a recorded cycle best day', () => {
        const plan = registryPlan(MFF_BUILDER_ID);
        const input = {
            asOf: '2026-02-10',
            balance: dollars(51_000),
            dashboardConvention: DashboardBalanceConvention.Nominal,
            firstFundedTradeOn: '2026-01-01',
            highestEodBalance: dollars(51_000),
            stage: SizingStage.Funded,
        };
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        const view = performanceCardOf(
            { account, asOf: '2026-02-10', input },
            null,
            [],
            [],
        );
        expect(view.consistency.kind).toBe(ConsistencyStatusKind.NotEvaluated);
    });
});

describe('assumptionKindText for the reconstruction assumptions', () => {
    it('gives a readable label for every input assumption kind used by reconstruction', () => {
        expect(
            assumptionKindText(AssumptionKind.LiveModelApproximation),
        ).toContain('approximation');
        expect(assumptionKindText(AssumptionKind.LiveNotModeled)).toContain(
            'No live stage',
        );
    });
});

function requestedOn(day: string): SnapshotPayoutRow {
    return {
        grossCents: usdCents(50_000),
        netCents: null,
        paidOn: null,
        requestedOn: day,
        status: PayoutStatus.Requested,
    };
}

describe('the detail state counts the requested payouts of the whole firm (PT-36l, F-145)', () => {
    const TODAY = '2026-02-10';

    const own = [requestedOn('2026-02-02')];
    const siblings = [requestedOn('2026-02-03'), requestedOn('2026-02-04')];
    const firmCount = firmPayoutCountOf(
        FirmId.Mffu,
        [
            { events: NO_EVENTS, payouts: own },
            { events: NO_EVENTS, payouts: siblings },
        ],
        TODAY,
    );

    it('stateCardOf hands the account the pending count of its sibling accounts', () => {
        const view = stateCardOf(
            registryPlan(MFF_PRO_ID),
            accountRow(MFF_PRO_ID),
            snapshotRow(),
            NO_EVENTS,
            own,
            TODAY,
            firmCount,
        );
        if (
            view.kind !== StateCardKind.Ready ||
            view.account.kind !== TradingPhase.Funded
        ) {
            throw new Error('expected a ready funded state card');
        }
        expect(view.account.pendingPayoutCount).toBe(1);
        expect(view.account.otherAccountsPendingPayoutCount).toBe(2);
    });

    it('previousReconstructionOf hands the previous reconstruction the same counts', () => {
        const result = previousReconstructionOf(
            registryPlan(MFF_PRO_ID),
            accountRow(MFF_PRO_ID),
            snapshotRow({
                asOf: '2026-02-01',
                balanceCents: usdCents(5_000_000),
            }),
            NO_EVENTS,
            own,
            TODAY,
            firmCount,
        );
        if (result?.account.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded previous reconstruction');
        }
        expect(result.account.otherAccountsPendingPayoutCount).toBe(2);
    });
});

describe('the detail state accepts a firm count that could not be loaded (PT-36p, F-145)', () => {
    const TODAY = '2026-02-10';
    const own = [requestedOn('2026-02-02'), requestedOn('2026-02-03')];

    it('stateCardOf reconstructs from the account own rows and counts no request at other accounts', () => {
        const view = stateCardOf(
            registryPlan(MFF_PRO_ID),
            accountRow(MFF_PRO_ID),
            snapshotRow(),
            NO_EVENTS,
            own,
            TODAY,
            PENDING_PAYOUT_COUNTS_NOT_CHECKED,
        );
        if (
            view.kind !== StateCardKind.Ready ||
            view.account.kind !== TradingPhase.Funded
        ) {
            throw new Error('expected a ready funded state card');
        }
        expect(view.account.pendingPayoutCount).toBe(2);
        expect(view.account.otherAccountsPendingPayoutCount).toBe(0);
    });

    it('stateCardOf lists the unknown firm count as an assumption of the reconstructed account', () => {
        const view = stateCardOf(
            registryPlan(MFF_PRO_ID),
            accountRow(MFF_PRO_ID),
            snapshotRow(),
            NO_EVENTS,
            own,
            TODAY,
            PENDING_PAYOUT_COUNTS_NOT_CHECKED,
        );
        if (view.kind !== StateCardKind.Ready) {
            throw new Error('expected a ready state card');
        }
        expect(view.account.assumptions).toContainEqual({
            bias: AssumptionBias.Optimistic,
            kind: AssumptionKind.FirmPayoutCountNotChecked,
        });
    });

    it('stateCardOf lists no such assumption for a count that was loaded', () => {
        const view = stateCardOf(
            registryPlan(MFF_PRO_ID),
            accountRow(MFF_PRO_ID),
            snapshotRow(),
            NO_EVENTS,
            own,
            TODAY,
            firmPayoutCountOf(
                MFF_PRO_ID.firm,
                [{ events: [], payouts: own }],
                TODAY,
            ),
        );
        if (view.kind !== StateCardKind.Ready) {
            throw new Error('expected a ready state card');
        }
        expect(
            view.account.assumptions.map((assumption) => assumption.kind),
        ).not.toContain(AssumptionKind.FirmPayoutCountNotChecked);
    });

    it('previousReconstructionOf accepts it too', () => {
        const result = previousReconstructionOf(
            registryPlan(MFF_PRO_ID),
            accountRow(MFF_PRO_ID),
            snapshotRow({
                asOf: '2026-02-01',
                balanceCents: usdCents(5_000_000),
            }),
            NO_EVENTS,
            own,
            TODAY,
            PENDING_PAYOUT_COUNTS_NOT_CHECKED,
        );
        expect(result?.account.kind).toBe(TradingPhase.Funded);
    });
});

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

function paidOn(day: string): SnapshotPayoutRow {
    return {
        grossCents: usdCents(50_000),
        netCents: usdCents(45_000),
        paidOn: day,
        requestedOn: day,
        status: PayoutStatus.Paid,
    };
}

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

describe('the detail state blocks a payout exactly where the board blocks under a verified firm-total cap (PT-36k, F-145)', () => {
    const TODAY = '2026-02-10';
    const FIRM_TOTAL_CAP = 5;
    const NO_ACCOUNT_DATA = { events: NO_EVENTS, payouts: NO_PAYOUTS };
    const siblingPaid = [paidOn('2026-02-01'), paidOn('2026-02-02')];
    const archivedRequested = [
        requestedOn('2026-02-03'),
        requestedOn('2026-02-04'),
    ];

    function firmCountOfLedger(
        archived: readonly SnapshotPayoutRow[],
    ): FirmPayoutCount {
        return firmPayoutCountOf(
            FirmId.Mffu,
            [
                NO_ACCOUNT_DATA,
                { events: NO_EVENTS, payouts: siblingPaid },
                { events: NO_EVENTS, payouts: archived },
            ],
            TODAY,
        );
    }

    function eligibleStateOf(firmCount: FirmPayoutCount) {
        const plan = registryPlan(MFF_PRO_ID);
        const view = stateCardOf(
            plan,
            accountRow(MFF_PRO_ID),
            snapshotRow({
                balanceCents: usdCents(7_000_000),
                cycleBestDayProfitCents: usdCents(2_000_000),
                highestEodBalanceCents: usdCents(7_000_000),
                qualifyingDaysSinceLastPayout: 30,
                tradingDays: 40,
            }),
            NO_EVENTS,
            NO_PAYOUTS,
            TODAY,
            firmCount,
        );
        if (
            view.kind !== StateCardKind.Ready ||
            view.account.kind !== TradingPhase.Funded
        ) {
            throw new Error('expected a ready funded state card');
        }
        if (view.account.fundedTracker === null) {
            throw new Error('expected a funded tracker');
        }
        view.account.fundedTracker.sessionDaysSinceAnchor = 999;
        return { account: view.account, plan };
    }

    function decisionsUnder(
        triggers: readonly LiveTransitionTrigger[],
        firmCount: FirmPayoutCount,
    ) {
        const firm = findFirm(FirmId.Mffu) as unknown as {
            accountPolicy: FirmAccountPolicy;
        };
        const original = firm.accountPolicy;
        firm.accountPolicy = new StubTriggerPolicy(triggers);
        try {
            const { account, plan } = eligibleStateOf(firmCount);
            const [row] = payoutReadinessBoardOf(
                DEFAULT_RULEBOOK,
                [reconstructedEntry('a1', plan, account)],
                new Map([
                    [
                        'a1',
                        {
                            paidPayoutsSinceLastLiveAccount:
                                firmCount.paidPayoutsSinceLastLiveAccount,
                        },
                    ],
                ]),
            ).rows;
            const advisor = createSizingAdvisor(account, {
                accountPolicy: firm.accountPolicy,
                paidPayoutsSinceLastLiveAccount:
                    firmCount.paidPayoutsSinceLastLiveAccount,
                rulebook: DEFAULT_RULEBOOK,
                snapshotAsOf: TODAY,
                substate: null,
                today: TODAY,
            });
            return {
                advised: advisor.assemble([]).payoutAdvice?.documented,
                board: row,
            };
        } finally {
            firm.accountPolicy = original;
        }
    }

    const capTrigger = new PayoutCountTotalTrigger(
        FIRM_TOTAL_CAP,
        CONFIRMED_SOURCE,
    );

    it('is eligible on the board and in the advisor with no trigger, so the block below is the cap and nothing else', () => {
        const { advised, board } = decisionsUnder(
            [],
            firmCountOfLedger(archivedRequested),
        );

        expect(board?.kind).toBe(PayoutReadinessRowKind.Eligible);
        expect(advised?.kind).toBe(PayoutRequestDecisionKind.Request);
    });

    it('blocks the fifth firm payout on the board and in the advisor when two are paid and two are requested at sibling or archived accounts', () => {
        const { advised, board } = decisionsUnder(
            [capTrigger],
            firmCountOfLedger(archivedRequested),
        );

        expect(board?.kind).toBe(PayoutReadinessRowKind.Blocked);
        if (board?.kind !== PayoutReadinessRowKind.Blocked) return;
        expect(board.reason).toMatchObject({
            kind: PayoutBlockReasonKind.WouldTriggerLive,
            trigger: { payoutsTaken: 4, scope: LiveTriggerScope.Firm },
        });
        expect(advised).toMatchObject({
            kind: PayoutRequestDecisionKind.NotEligible,
            reason: {
                kind: PayoutBlockReasonKind.WouldTriggerLive,
                trigger: { payoutsTaken: 4, scope: LiveTriggerScope.Firm },
            },
        });
    });

    it('stays eligible on the board and in the advisor while one fewer sibling request leaves the next payout under the cap', () => {
        const { advised, board } = decisionsUnder(
            [capTrigger],
            firmCountOfLedger(archivedRequested.slice(0, 1)),
        );

        expect(board?.kind).toBe(PayoutReadinessRowKind.Eligible);
        expect(advised?.kind).toBe(PayoutRequestDecisionKind.Request);
    });
});
