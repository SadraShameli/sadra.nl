import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    dollars,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    type FundedCycleTracker,
    type LiveTransitionTrigger,
    MffuVariant,
    newFundedCycleTracker,
    PayoutCountTotalTrigger,
    type Plan,
    type PlanId,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    createSizingAdvisor,
    DashboardBalanceConvention,
    DEFAULT_RULEBOOK,
    LiveTriggerScope,
    NO_PENDING_PAYOUT_COUNTS,
    PayoutBlockReasonKind,
    PayoutRequestDecisionKind,
    type ReconstructedFundedOrEvalAccount,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');

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

function documentedDecisionOf(
    account: ReconstructedFundedOrEvalAccount,
    paidPayoutsSinceLastLiveAccount: number,
) {
    const advice = createSizingAdvisor(account, {
        accountPolicy: FIRM_TOTAL_POLICY,
        paidPayoutsSinceLastLiveAccount,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    }).assemble([]);
    return advice.payoutAdvice?.documented;
}

function fundedAccount(
    plan: Plan,
    counts: {
        readonly otherAccountsPendingPayoutCount?: number;
        readonly pendingPayoutCount?: number;
        readonly pendingPayouts?: number;
    },
): ReconstructedFundedOrEvalAccount {
    const state = fundedState();
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: trackerFor(state),
        kind: TradingPhase.Funded,
        ...NO_PENDING_PAYOUT_COUNTS,
        plan,
        resolvedDailyLossLimit: null,
        state,
        ...counts,
    };
}

function fundedState(): AccountState {
    return {
        balance: 55_000,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 20,
        startingBalance: 50_000,
        threshold: 50_100,
        thresholdLocked: true,
        todayPnL: 0,
        tradingDays: 20,
    };
}

function registryPlan(): Plan {
    const found = findFirm(MFF_PRO_ID.firm)?.findPlan(MFF_PRO_ID);
    if (!found) throw new Error(`${serializePlanId(MFF_PRO_ID)} missing`);
    return found;
}

function trackerFor(state: AccountState): FundedCycleTracker {
    const tracker = newFundedCycleTracker({
        ...state,
        balance: state.startingBalance,
    });
    tracker.restoreCalendarDayGateProgress(20);
    tracker.payoutsIssued = 0;
    return tracker;
}

describe('a verified firm-total trigger counts every payout requested at the firm (PT-36i, F-145)', () => {
    const plan = registryPlan();

    it('counts the requested payout at the firm other account: two accounts, one request each, the next request is the fifth', () => {
        const decision = documentedDecisionOf(
            fundedAccount(plan, {
                otherAccountsPendingPayoutCount: 1,
                pendingPayoutCount: 1,
                pendingPayouts: 500,
            }),
            2,
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

    it('counts every pending request on the account itself, not one per account', () => {
        const decision = documentedDecisionOf(
            fundedAccount(plan, {
                pendingPayoutCount: 2,
                pendingPayouts: 1000,
            }),
            2,
        );
        expect(decision?.kind).toBe(PayoutRequestDecisionKind.NotEligible);
        if (decision?.kind !== PayoutRequestDecisionKind.NotEligible) return;
        expect(decision.reason).toMatchObject({
            trigger: { payoutsTaken: 4, scope: LiveTriggerScope.Firm },
        });
    });

    it('stays eligible when the pending requests leave the next one under the cap', () => {
        const decision = documentedDecisionOf(
            fundedAccount(plan, {
                pendingPayoutCount: 1,
                pendingPayouts: 500,
            }),
            2,
        );
        expect(decision?.kind).toBe(PayoutRequestDecisionKind.Request);
    });

    it('does not turn pending dollars into a request when the account counts none', () => {
        const decision = documentedDecisionOf(
            fundedAccount(plan, { pendingPayouts: 500 }),
            3,
        );
        expect(decision?.kind).toBe(PayoutRequestDecisionKind.Request);
    });
});

describe('the pending payout counts travel through the reconstruction', () => {
    const plan = registryPlan();

    const baseInput = {
        asOf: '2026-09-26',
        balance: dollars(55_000),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        highestEodBalance: dollars(55_000),
        stage: SizingStage.Funded,
    } as const;

    it('carries the account and the other accounts counts onto the reconstructed account', () => {
        const rebuilt = AccountReconstruction.rebuild(
            { ...baseInput, pendingPayouts: dollars(1500) },
            plan,
            null,
            { otherAccountsPendingPayoutCount: 2, pendingPayoutCount: 3 },
        );
        if (rebuilt.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded account');
        }
        expect(rebuilt.pendingPayoutCount).toBe(3);
        expect(rebuilt.otherAccountsPendingPayoutCount).toBe(2);
    });

    it('takes the supplied counts and never derives a request from pending dollars', () => {
        const withDollars = AccountReconstruction.rebuild(
            { ...baseInput, pendingPayouts: dollars(500) },
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        const without = AccountReconstruction.rebuild(
            baseInput,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        if (
            withDollars.kind !== TradingPhase.Funded ||
            without.kind !== TradingPhase.Funded
        ) {
            throw new Error('expected funded accounts');
        }
        expect(withDollars.pendingPayoutCount).toBe(0);
        expect(without.pendingPayoutCount).toBe(0);
        expect(without.otherAccountsPendingPayoutCount).toBe(0);
    });
});

describe('createSizingAdvisor options (PT-36i)', () => {
    it('no longer declares the pendingPayouts option it ignored', () => {
        const source = readFileSync(
            path.join(
                ROOT,
                'src/lib/prop-calculator/advisor/createSizingAdvisor.ts',
            ),
            'utf8',
        );
        expect(source).not.toContain('pendingPayouts');
    });
});
