import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    PayoutStatus,
} from '~/lib/prop-accounts/core';
import {
    LiveProximityCountStatus,
    LiveProximityStatus,
    liveTransitionProximity,
} from '~/lib/prop-accounts/metrics';
import {
    FirmAccountPolicy,
    type LiveTransitionTrigger,
    PayoutCountPerAccountTrigger,
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator';

import {
    account,
    EVAL_PLAN,
    event,
    ledger,
    payout,
} from './ledgerFixtures';

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

describe('the per-account live proximity row says when its own count cannot be read (PT-36o, F-145)', () => {
    it('marks a readable account count as checked', () => {
        const acc = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const proximity = withStubbedPolicy(
            [new PayoutCountPerAccountTrigger(4, CONFIRMED_SOURCE)],
            () =>
                liveTransitionProximity(
                    ledger({
                        accounts: [acc],
                        payouts: [
                            payout(acc, 50_000, { paidOn: '2026-09-05' }),
                        ],
                    }),
                    ASOF,
                ),
        );
        expect(proximity.byAccount).toEqual([
            expect.objectContaining({
                countStatus: LiveProximityCountStatus.Checked,
                paidPayouts: 1,
                remaining: 3,
            }),
        ]);
    });

    it.each([
        ['an unreadable requested date', { requestedOn: 'someday' }],
        ['an unreadable paid date', { paidOn: 'sometime in September' }],
    ])(
        'reads not checked, never a distance, with %s on the account own payout',
        (_label, options) => {
            const acc = account(EVAL_PLAN, { stage: AccountStage.Funded });
            const proximity = withStubbedPolicy(
                [new PayoutCountPerAccountTrigger(4, CONFIRMED_SOURCE)],
                () =>
                    liveTransitionProximity(
                        ledger({
                            accounts: [acc],
                            payouts: [
                                payout(acc, 50_000, { paidOn: '2026-09-05' }),
                                payout(acc, 50_000, options),
                            ],
                        }),
                        ASOF,
                    ),
            );
            expect(proximity.byAccount).toEqual([
                expect.objectContaining({
                    countStatus: LiveProximityCountStatus.NotChecked,
                    remaining: null,
                    status: LiveProximityStatus.Verified,
                    triggerCount: 4,
                }),
            ]);
        },
    );

    it('deliberately reads not checked when the account own move live date is unreadable, as the firm count does', () => {
        const acc = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const proximity = withStubbedPolicy(
            [new PayoutCountPerAccountTrigger(4, CONFIRMED_SOURCE)],
            () =>
                liveTransitionProximity(
                    ledger({
                        accounts: [acc],
                        events: [
                            event(acc, AccountEventKind.MovedLive, 'someday'),
                        ],
                        payouts: [
                            payout(acc, 50_000, { paidOn: '2026-09-05' }),
                        ],
                    }),
                    ASOF,
                ),
        );
        expect(proximity.byAccount).toEqual([
            expect.objectContaining({
                countStatus: LiveProximityCountStatus.NotChecked,
                remaining: null,
            }),
        ]);
    });
});

function rowOf(
    reported: number | undefined,
    payoutCount: number,
    requestedCount = 0,
) {
    const acc = account(EVAL_PLAN, { stage: AccountStage.Funded });
    const payouts = [
        ...Array.from({ length: payoutCount }, () =>
            payout(acc, 50_000, { paidOn: '2026-09-05' }),
        ),
        ...Array.from({ length: requestedCount }, () =>
            payout(acc, 50_000, {
                paidOn: null,
                requestedOn: '2026-09-20',
                status: PayoutStatus.Requested,
            }),
        ),
    ];
    const proximity = withStubbedPolicy(
        [new PayoutCountPerAccountTrigger(4, CONFIRMED_SOURCE)],
        () =>
            liveTransitionProximity(
                ledger({ accounts: [acc], payouts }),
                ASOF,
                reported === undefined
                    ? undefined
                    : new Map([[acc.id, reported]]),
            ),
    );
    return proximity.byAccount[0];
}

describe('the per-account live proximity row counts what the alerts count (PT-36o, review)', () => {
    it('takes the snapshot reported payouts taken when it is above the ledger paid count', () => {
        expect(rowOf(3, 1)).toEqual(
            expect.objectContaining({ paidPayouts: 3, remaining: 1 }),
        );
    });

    it('adds the requested payouts on top of the snapshot reported count', () => {
        expect(rowOf(3, 1, 1)).toEqual(
            expect.objectContaining({
                paidPayouts: 3,
                remaining: 0,
                requestedPayouts: 1,
            }),
        );
    });

    it('keeps the ledger paid count when the snapshot reports fewer or none', () => {
        expect(rowOf(1, 2)).toEqual(
            expect.objectContaining({ paidPayouts: 2, remaining: 2 }),
        );
        expect(rowOf(undefined, 2)).toEqual(
            expect.objectContaining({ paidPayouts: 2, remaining: 2 }),
        );
    });
});
