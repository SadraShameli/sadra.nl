import { describe, expect, it } from 'vitest';

import {
    payoutReadinessBoardOf,
    PayoutReadinessRowKind,
} from '~/lib/prop-accounts/metrics';
import {
    findFirm,
    FirmAccountPolicy,
    FirmId,
    type LiveTransitionTrigger,
    PayoutCountPerAccountTrigger,
    PayoutCountTotalTrigger,
    type Plan,
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    LiveTriggerCoverage,
    LiveTriggerScope,
    PayoutBlockReasonKind,
} from '~/lib/prop-calculator/advisor';

import {
    fundedReconstructed,
    mffProPlan,
    reconstructedEntry,
} from '../reconstructionFixtures';

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

const CONFLICTED_SOURCE = {
    conflicting: CONFIRMED_SOURCE,
    fetchedOn: '2026-09-01',
    quote: 'a synthetic conflicting quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Conflict,
} as const;

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

function eligibleEntry(plan: Plan, payoutsIssued: number) {
    const funded = fundedReconstructed(plan, {
        balance: plan.accountSize + 20_000,
        cumulativePayout: 0,
        cycleBestDayProfit: 20_000,
        lastPayoutBalance: plan.accountSize,
        payoutsIssued,
    });
    if (funded.fundedTracker === null) {
        throw new Error('expected a funded tracker');
    }
    funded.fundedTracker.sessionDaysSinceAnchor = 999;
    return reconstructedEntry('a1', plan, funded);
}

function withPolicy<T>(policy: FirmAccountPolicy, run: () => T): T {
    const firm = findFirm(FirmId.Mffu) as unknown as {
        accountPolicy: FirmAccountPolicy;
    };
    const original = firm.accountPolicy;
    firm.accountPolicy = policy;
    try {
        return run();
    } finally {
        firm.accountPolicy = original;
    }
}

describe('payoutReadinessBoardOf: verified live-trigger limits (PT-36d)', () => {
    const plan = mffProPlan();

    it('shows an eligible row when the firm triggers are unverified (the default)', () => {
        const board = payoutReadinessBoardOf(DEFAULT_RULEBOOK, [
            eligibleEntry(plan, 2),
        ]);
        expect(board.rows[0]?.kind).toBe(PayoutReadinessRowKind.Eligible);
    });

    it('shows the same WouldTriggerLive block as the advisor for the third payout under a verified per-account trigger at 3', () => {
        const board = withPolicy(
            new StubTriggerPolicy([
                new PayoutCountPerAccountTrigger(3, CONFIRMED_SOURCE),
            ]),
            () =>
                payoutReadinessBoardOf(DEFAULT_RULEBOOK, [
                    eligibleEntry(plan, 2),
                ]),
        );
        const [row] = board.rows;
        expect(row?.kind).toBe(PayoutReadinessRowKind.Blocked);
        if (row?.kind !== PayoutReadinessRowKind.Blocked) return;
        expect(row.reason).toEqual({
            kind: PayoutBlockReasonKind.WouldTriggerLive,
            trigger: {
                payoutsTaken: 2,
                scope: LiveTriggerScope.Account,
                triggerAtPayoutCount: 3,
            },
        });
        expect(row.wait).toBeNull();
    });

    it('stays eligible under the verified per-account cap and for a conflicted trigger', () => {
        const under = withPolicy(
            new StubTriggerPolicy([
                new PayoutCountPerAccountTrigger(3, CONFIRMED_SOURCE),
            ]),
            () =>
                payoutReadinessBoardOf(DEFAULT_RULEBOOK, [
                    eligibleEntry(plan, 1),
                ]),
        );
        expect(under.rows[0]?.kind).toBe(PayoutReadinessRowKind.Eligible);
        const conflicted = withPolicy(
            new StubTriggerPolicy([
                new PayoutCountPerAccountTrigger(3, CONFLICTED_SOURCE),
            ]),
            () =>
                payoutReadinessBoardOf(DEFAULT_RULEBOOK, [
                    eligibleEntry(plan, 2),
                ]),
        );
        expect(conflicted.rows[0]?.kind).toBe(PayoutReadinessRowKind.Eligible);
    });

    it('blocks on the firm-wide count when the caller supplies it for the account, and names the firm scope', () => {
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE),
        ]);
        const board = withPolicy(policy, () =>
            payoutReadinessBoardOf(
                DEFAULT_RULEBOOK,
                [eligibleEntry(plan, 0)],
                new Map([['a1', { paidPayoutsSinceLastLiveAccount: 9 }]]),
            ),
        );
        const [row] = board.rows;
        expect(row?.kind).toBe(PayoutReadinessRowKind.Blocked);
        if (row?.kind !== PayoutReadinessRowKind.Blocked) return;
        expect(row.reason).toEqual({
            kind: PayoutBlockReasonKind.WouldTriggerLive,
            trigger: {
                payoutsTaken: 9,
                scope: LiveTriggerScope.Firm,
                triggerAtPayoutCount: 10,
            },
        });
    });

    it('does not block on the firm total while the caller supplies no firm count, and the eligible row says the live triggers were not checked', () => {
        const board = withPolicy(
            new StubTriggerPolicy([
                new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE),
            ]),
            () =>
                payoutReadinessBoardOf(DEFAULT_RULEBOOK, [
                    eligibleEntry(plan, 0),
                ]),
        );
        const [row] = board.rows;
        expect(row?.kind).toBe(PayoutReadinessRowKind.Eligible);
        if (row?.kind !== PayoutReadinessRowKind.Eligible) return;
        expect(row.liveTriggerCoverage).toBe(LiveTriggerCoverage.NotChecked);
    });

    it('marks an eligible row as checked once the firm count is supplied and every verified trigger is enforced', () => {
        const board = withPolicy(
            new StubTriggerPolicy([
                new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE),
            ]),
            () =>
                payoutReadinessBoardOf(
                    DEFAULT_RULEBOOK,
                    [eligibleEntry(plan, 0)],
                    new Map([['a1', { paidPayoutsSinceLastLiveAccount: 3 }]]),
                ),
        );
        const [row] = board.rows;
        expect(row?.kind).toBe(PayoutReadinessRowKind.Eligible);
        if (row?.kind !== PayoutReadinessRowKind.Eligible) return;
        expect(row.liveTriggerCoverage).toBe(LiveTriggerCoverage.Enforced);
    });

    it('says the live triggers were not checked for a firm whose triggers are unverified (the default)', () => {
        const board = payoutReadinessBoardOf(DEFAULT_RULEBOOK, [
            eligibleEntry(plan, 2),
        ]);
        const [row] = board.rows;
        if (row?.kind !== PayoutReadinessRowKind.Eligible) {
            throw new Error('expected an eligible row');
        }
        expect(row.liveTriggerCoverage).toBe(LiveTriggerCoverage.NotChecked);
    });
});
