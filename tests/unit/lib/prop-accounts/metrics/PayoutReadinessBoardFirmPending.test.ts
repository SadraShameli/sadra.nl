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
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    LiveTriggerScope,
    PayoutBlockReasonKind,
    type ReconstructedFundedOrEvalAccount,
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

const FIRM_TOTAL_CAP = 5;

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

function boardWith(counts: Parameters<typeof pendingEntry>[0]) {
    const firm = findFirm(FirmId.Mffu) as unknown as {
        accountPolicy: FirmAccountPolicy;
    };
    const original = firm.accountPolicy;
    firm.accountPolicy = new StubTriggerPolicy([
        new PayoutCountTotalTrigger(FIRM_TOTAL_CAP, CONFIRMED_SOURCE),
    ]);
    try {
        return payoutReadinessBoardOf(
            DEFAULT_RULEBOOK,
            [pendingEntry(counts)],
            new Map([['a1', { paidPayoutsSinceLastLiveAccount: 2 }]]),
        );
    } finally {
        firm.accountPolicy = original;
    }
}

function boardWithTrigger(
    trigger: LiveTransitionTrigger,
    counts: Parameters<typeof pendingEntry>[0],
    payoutsIssued: number,
    override: {
        readonly pendingPayoutCounts?: {
            readonly otherAccountsPendingPayoutCount: number;
            readonly pendingPayoutCount: number;
        };
    } = {},
) {
    const firm = findFirm(FirmId.Mffu) as unknown as {
        accountPolicy: FirmAccountPolicy;
    };
    const original = firm.accountPolicy;
    firm.accountPolicy = new StubTriggerPolicy([trigger]);
    try {
        return payoutReadinessBoardOf(
            DEFAULT_RULEBOOK,
            [pendingEntry({ ...counts, payoutsIssued })],
            new Map([
                [
                    'a1',
                    {
                        paidPayoutsSinceLastLiveAccount: 0,
                        ...override,
                    },
                ],
            ]),
        );
    } finally {
        firm.accountPolicy = original;
    }
}

function pendingEntry({
    payoutsIssued = 0,
    ...counts
}: {
    readonly otherAccountsPendingPayoutCount?: number;
    readonly payoutsIssued?: number;
    readonly pendingPayoutCount?: number;
}) {
    const plan = mffProPlan();
    const funded = fundedReconstructed(plan, {
        balance: plan.accountSize + 20_000,
        cycleBestDayProfit: 20_000,
        lastPayoutBalance: plan.accountSize,
        payoutsIssued,
        pendingPayouts: 500,
    });
    if (funded.fundedTracker === null) {
        throw new Error('expected a funded tracker');
    }
    funded.fundedTracker.sessionDaysSinceAnchor = 999;
    const withCounts: ReconstructedFundedOrEvalAccount = {
        ...funded,
        ...counts,
    };
    return reconstructedEntry('a1', plan, withCounts);
}

describe('payoutReadinessBoardOf: requested payouts count toward a verified firm-total trigger (PT-36i, F-145)', () => {
    it('blocks the fifth firm payout when the other account has one request and this account has one', () => {
        const board = boardWith({
            otherAccountsPendingPayoutCount: 1,
            pendingPayoutCount: 1,
        });
        const [row] = board.rows;
        expect(row?.kind).toBe(PayoutReadinessRowKind.Blocked);
        if (row?.kind !== PayoutReadinessRowKind.Blocked) return;
        expect(row.reason).toMatchObject({
            kind: PayoutBlockReasonKind.WouldTriggerLive,
            trigger: {
                payoutsTaken: 4,
                scope: LiveTriggerScope.Firm,
                triggerAtPayoutCount: FIRM_TOTAL_CAP,
            },
        });
    });

    it('counts every pending request on the account itself', () => {
        const board = boardWith({ pendingPayoutCount: 2 });
        const [row] = board.rows;
        expect(row?.kind).toBe(PayoutReadinessRowKind.Blocked);
        if (row?.kind !== PayoutReadinessRowKind.Blocked) return;
        expect(row.reason).toMatchObject({
            trigger: { payoutsTaken: 4, scope: LiveTriggerScope.Firm },
        });
    });

    it('stays eligible while the requested payouts leave the next one under the cap', () => {
        const board = boardWith({ pendingPayoutCount: 1 });
        expect(board.rows[0]?.kind).toBe(PayoutReadinessRowKind.Eligible);
    });
});

const PER_ACCOUNT_CAP = 4;

describe('payoutReadinessBoardOf: the per-account cap counts every own request and takes the counts of its caller (PT-36l, F-145)', () => {
    const perAccountTrigger = new PayoutCountPerAccountTrigger(
        PER_ACCOUNT_CAP,
        CONFIRMED_SOURCE,
    );

    it('blocks the fourth account payout when one is paid and two are requested', () => {
        const [row] = boardWithTrigger(
            perAccountTrigger,
            { pendingPayoutCount: 2 },
            1,
        ).rows;
        expect(row?.kind).toBe(PayoutReadinessRowKind.Blocked);
        if (row?.kind !== PayoutReadinessRowKind.Blocked) return;
        expect(row.reason).toMatchObject({
            kind: PayoutBlockReasonKind.WouldTriggerLive,
            trigger: { payoutsTaken: 3, scope: LiveTriggerScope.Account },
        });
    });

    it('stays eligible with one paid and one requested under the same cap', () => {
        const [row] = boardWithTrigger(
            perAccountTrigger,
            { pendingPayoutCount: 1 },
            1,
        ).rows;
        expect(row?.kind).toBe(PayoutReadinessRowKind.Eligible);
    });

    it('prefers the counts the caller read from the ledger over the counts stored on the account', () => {
        const [row] = boardWithTrigger(
            new PayoutCountTotalTrigger(FIRM_TOTAL_CAP, CONFIRMED_SOURCE),
            { otherAccountsPendingPayoutCount: 0, pendingPayoutCount: 0 },
            0,
            {
                pendingPayoutCounts: {
                    otherAccountsPendingPayoutCount: 4,
                    pendingPayoutCount: 0,
                },
            },
        ).rows;
        expect(row?.kind).toBe(PayoutReadinessRowKind.Blocked);
        if (row?.kind !== PayoutReadinessRowKind.Blocked) return;
        expect(row.reason).toMatchObject({
            trigger: { payoutsTaken: 4, scope: LiveTriggerScope.Firm },
        });
    });
});
