import { describe, expect, it } from 'vitest';

import { AccountStage, PayoutStatus } from '~/lib/prop-accounts/core';
import {
    LiveProximityCountStatus,
    LiveProximityStatus,
    liveTransitionProximity,
} from '~/lib/prop-accounts/metrics';
import {
    FirmAccountPolicy,
    type LiveTransitionTrigger,
    PayoutCountPerAccountTrigger,
    PayoutCountTotalTrigger,
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator';

import { account, EVAL_PLAN, ledger, payout } from './ledgerFixtures';

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

function withStubbedPolicy<T>(
    triggers: readonly LiveTransitionTrigger[],
    run: () => T,
): T {
    const firm = EVAL_PLAN.firm as { accountPolicy: FirmAccountPolicy };
    const original = firm.accountPolicy;
    firm.accountPolicy = new StubTriggerPolicy(triggers);
    try {
        return run();
    } finally {
        firm.accountPolicy = original;
    }
}

const ASOF = '2026-09-30';

function requested(owner: ReturnType<typeof account>, requestedOn: string) {
    return payout(owner, 50_000, {
        paidOn: null,
        requestedOn,
        status: PayoutStatus.Requested,
    });
}

describe('live proximity counts the requested payouts toward a verified trigger (PT-36n, F-145)', () => {
    it('measures the firm-total distance from the paid and the requested payouts', () => {
        const accounts = Array.from({ length: 8 }, () =>
            account(EVAL_PLAN, { stage: AccountStage.Funded }),
        );
        const [first, second] = accounts;
        if (first === undefined || second === undefined) {
            throw new Error('expected accounts');
        }
        const proximity = withStubbedPolicy(
            [new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE)],
            () =>
                liveTransitionProximity(
                    ledger({
                        accounts,
                        payouts: [
                            ...accounts.map((acc, index) =>
                                payout(acc, 50_000, {
                                    paidOn: `2026-09-${String(index + 1).padStart(2, '0')}`,
                                }),
                            ),
                            requested(first, '2026-09-20'),
                            requested(second, '2026-09-21'),
                        ],
                    }),
                    ASOF,
                ),
        );
        expect(proximity.byFirm).toEqual([
            expect.objectContaining({
                countStatus: LiveProximityCountStatus.Checked,
                paidPayoutsSinceLastLiveAccount: 8,
                remaining: 0,
                requestedPayoutsSinceLastLiveAccount: 2,
                status: LiveProximityStatus.Verified,
                triggerCount: 10,
            }),
        ]);
    });

    it.each([
        ['an unreadable payout requested date', { requestedOn: 'someday' }],
        ['an unreadable payout paid date', { paidOn: 'sometime in September' }],
    ])(
        'reads not checked, never a full distance, with %s on a sibling account',
        (_label, options) => {
            const acc = account(EVAL_PLAN, { stage: AccountStage.Funded });
            const sibling = account(EVAL_PLAN, { stage: AccountStage.Funded });
            const proximity = withStubbedPolicy(
                [new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE)],
                () =>
                    liveTransitionProximity(
                        ledger({
                            accounts: [acc, sibling],
                            payouts: [
                                payout(acc, 50_000, { paidOn: '2026-09-05' }),
                                payout(sibling, 50_000, options),
                            ],
                        }),
                        ASOF,
                    ),
            );
            expect(proximity.byFirm).toEqual([
                expect.objectContaining({
                    countStatus: LiveProximityCountStatus.NotChecked,
                    remaining: null,
                    status: LiveProximityStatus.Verified,
                    triggerCount: 10,
                }),
            ]);
        },
    );

    it('measures the per-account distance from the account own paid and requested payouts', () => {
        const acc = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const proximity = withStubbedPolicy(
            [new PayoutCountPerAccountTrigger(4, CONFIRMED_SOURCE)],
            () =>
                liveTransitionProximity(
                    ledger({
                        accounts: [acc],
                        payouts: [
                            payout(acc, 50_000, { paidOn: '2026-09-05' }),
                            payout(acc, 50_000, { paidOn: '2026-09-10' }),
                            requested(acc, '2026-09-20'),
                        ],
                    }),
                    ASOF,
                ),
        );
        expect(proximity.byAccount).toEqual([
            expect.objectContaining({
                paidPayouts: 2,
                remaining: 1,
                requestedPayouts: 1,
                triggerCount: 4,
            }),
        ]);
    });

    it('counts a request made by the as-of date and paid after it as requested', () => {
        const acc = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const proximity = withStubbedPolicy(
            [new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE)],
            () =>
                liveTransitionProximity(
                    ledger({
                        accounts: [acc],
                        payouts: [
                            payout(acc, 50_000, {
                                paidOn: '2026-09-25',
                                requestedOn: '2026-09-10',
                            }),
                        ],
                    }),
                    '2026-09-15',
                ),
        );
        expect(proximity.byFirm).toEqual([
            expect.objectContaining({
                paidPayoutsSinceLastLiveAccount: 0,
                remaining: 9,
                requestedPayoutsSinceLastLiveAccount: 1,
            }),
        ]);
    });
});
