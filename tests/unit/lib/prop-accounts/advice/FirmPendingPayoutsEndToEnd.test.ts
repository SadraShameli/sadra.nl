import { describe, expect, it } from 'vitest';

import {
    firmPayoutCountOf,
    type SnapshotAccountRow,
    type SnapshotEventRow,
    snapshotInputFrom,
    type SnapshotPayoutRow,
    type SnapshotSnapshotRow,
} from '~/lib/prop-accounts/advice';
import {
    AccountStage,
    AccountTracking,
    type ModeledAccountRow,
    PayoutStatus,
    usdCents,
} from '~/lib/prop-accounts/core';
import {
    payoutReadinessBoardOf,
    PayoutReadinessRowKind,
} from '~/lib/prop-accounts/metrics';
import {
    findFirm,
    FirmAccountPolicy,
    FirmId,
    type LiveTransitionTrigger,
    MffuVariant,
    PayoutCountTotalTrigger,
    type Plan,
    type PlanId,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    createSizingAdvisor,
    DashboardBalanceConvention,
    DEFAULT_RULEBOOK,
    LiveTriggerScope,
    PayoutBlockReasonKind,
    PayoutRequestDecisionKind,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';

import { reconstructedEntry } from '../reconstructionFixtures';

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

const FIRM_TOTAL_CAP = 5;
const TODAY = '2026-09-26';

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

const FIRM_TOTAL_POLICY = new StubTriggerPolicy([
    new PayoutCountTotalTrigger(FIRM_TOTAL_CAP, CONFIRMED_SOURCE),
]);

const SNAPSHOT: SnapshotSnapshotRow = {
    asOf: '2026-09-25',
    balanceAtLastPayoutCents: usdCents(5_000_000),
    balanceCents: usdCents(5_500_000),
    cumulativePayoutCents: null,
    cycleBestDayProfitCents: usdCents(500_000),
    dashboardFloorCents: null,
    evalBestDayProfitCents: null,
    floorAtLastPayoutCents: null,
    highestEodBalanceCents: usdCents(5_500_000),
    highestIntradayBalanceCents: null,
    lastPayoutOn: null,
    lastTradedOn: null,
    payoutsTaken: 0,
    qualifyingDaysSinceLastPayout: 20,
    tradingDays: 20,
};

const NO_EVENTS: readonly SnapshotEventRow[] = [];

function accountRow(): ModeledAccountRow<SnapshotAccountRow> {
    return {
        accountSize: 50_000,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalFirmId: null,
        firmId: FirmId.Mffu,
        firstFundedTradeOn: null,
        fundedOn: null,
        id: '00000000-0000-4000-8000-000000000001',
        liveStartBalanceCents: null,
        planLabel: null,
        planSerial: serializePlanId(MFF_PRO_ID),
        purchasedOn: '2026-01-01',
        stage: AccountStage.Funded,
        tracking: AccountTracking.Modeled,
    };
}

function paidOn(day: string): SnapshotPayoutRow {
    return {
        grossCents: usdCents(100_000),
        netCents: usdCents(90_000),
        paidOn: day,
        requestedOn: day,
        status: PayoutStatus.Paid,
    };
}

function registryPlan(): Plan {
    const found = findFirm(MFF_PRO_ID.firm)?.findPlan(MFF_PRO_ID);
    if (!found) throw new Error(`${serializePlanId(MFF_PRO_ID)} missing`);
    return found;
}

function requestedOn(day: string): SnapshotPayoutRow {
    return {
        grossCents: usdCents(50_000),
        netCents: null,
        paidOn: null,
        requestedOn: day,
        status: PayoutStatus.Requested,
    };
}

function withFirmTotalPolicy<T>(run: () => T): T {
    const firm = findFirm(FirmId.Mffu) as unknown as {
        accountPolicy: FirmAccountPolicy;
    };
    const original = firm.accountPolicy;
    firm.accountPolicy = FIRM_TOTAL_POLICY;
    try {
        return run();
    } finally {
        firm.accountPolicy = original;
    }
}

const OWN_PAYOUTS = [paidOn('2026-09-01'), requestedOn('2026-09-24')];
const OTHER_ACCOUNT_PAYOUTS = [paidOn('2026-09-02'), requestedOn('2026-09-25')];

function documentedDecisionOf(
    account: ReconstructedFundedOrEvalAccount,
    paidPayoutsSinceLastLiveAccount: number,
) {
    return createSizingAdvisor(account, {
        accountPolicy: FIRM_TOTAL_POLICY,
        paidPayoutsSinceLastLiveAccount,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: SNAPSHOT.asOf,
        substate: null,
        today: TODAY,
    }).assemble([]).payoutAdvice?.documented;
}

function firmCountOfBothAccounts() {
    return firmPayoutCountOf(
        FirmId.Mffu,
        [
            { events: [], payouts: OWN_PAYOUTS },
            { events: [], payouts: OTHER_ACCOUNT_PAYOUTS },
        ],
        TODAY,
    );
}

function reconstructedFor(
    plan: Plan,
    firmCount: Parameters<typeof snapshotInputFrom>[6],
): ReconstructedFundedOrEvalAccount {
    const { input, pendingPayoutCounts, personalMaxRiskPerTrade } =
        snapshotInputFrom(
            plan,
            accountRow(),
            SNAPSHOT,
            NO_EVENTS,
            OWN_PAYOUTS,
            TODAY,
            firmCount,
        );
    const account = AccountReconstruction.rebuild(
        input,
        plan,
        personalMaxRiskPerTrade,
        pendingPayoutCounts,
    );
    if (
        account.kind === ReconstructedLiveKind.Live ||
        account.fundedTracker === null
    ) {
        throw new Error('expected a funded account with a tracker');
    }
    account.fundedTracker.restoreCalendarDayGateProgress(20);
    account.fundedTracker.sessionDaysSinceAnchor = 999;
    return account;
}

describe('two accounts at one firm, from the ledger rows to the advisor and the board (PT-36i, F-145)', () => {
    const plan = registryPlan();

    it('counts the firm paid, the own request made before the snapshot and the other account request, so the next request is the fifth', () => {
        const firmCount = firmCountOfBothAccounts();
        expect(firmCount.paidPayoutsSinceLastLiveAccount).toBe(2);
        expect(firmCount.requestedPayoutsSinceLastLiveAccount).toBe(2);

        const account = reconstructedFor(plan, firmCount);
        expect(account.pendingPayoutCount).toBe(1);
        expect(account.otherAccountsPendingPayoutCount).toBe(1);

        const decision = documentedDecisionOf(
            account,
            firmCount.paidPayoutsSinceLastLiveAccount,
        );
        expect(decision?.kind).toBe(PayoutRequestDecisionKind.NotEligible);
        if (decision?.kind !== PayoutRequestDecisionKind.NotEligible) return;
        expect(decision.reason).toMatchObject({
            kind: PayoutBlockReasonKind.WouldTriggerLive,
            trigger: {
                payoutsTaken: 4,
                scope: LiveTriggerScope.Firm,
                triggerAtPayoutCount: FIRM_TOTAL_CAP,
            },
        });
    });

    it('blocks the same fifth request on the readiness board', () => {
        const firmCount = firmCountOfBothAccounts();
        const account = reconstructedFor(plan, firmCount);
        const board = withFirmTotalPolicy(() =>
            payoutReadinessBoardOf(
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
            ),
        );
        const [row] = board.rows;
        expect(row?.kind).toBe(PayoutReadinessRowKind.Blocked);
        if (row?.kind !== PayoutReadinessRowKind.Blocked) return;
        expect(row.reason).toMatchObject({
            kind: PayoutBlockReasonKind.WouldTriggerLive,
            trigger: { payoutsTaken: 4, scope: LiveTriggerScope.Firm },
        });
    });

    it('stays eligible when the other account has no request, so the next one is only the fourth', () => {
        const firmCount = firmPayoutCountOf(
            FirmId.Mffu,
            [
                { events: [], payouts: OWN_PAYOUTS },
                { events: [], payouts: [paidOn('2026-09-02')] },
            ],
            TODAY,
        );
        const account = reconstructedFor(plan, firmCount);
        expect(account.otherAccountsPendingPayoutCount).toBe(0);
        const decision = documentedDecisionOf(
            account,
            firmCount.paidPayoutsSinceLastLiveAccount,
        );
        expect(decision?.kind).toBe(PayoutRequestDecisionKind.Request);
    });
});
