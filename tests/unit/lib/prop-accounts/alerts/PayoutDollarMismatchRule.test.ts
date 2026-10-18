import { describe, expect, it } from 'vitest';

import {
    AlertDisclosure,
    AlertKind,
    AlertSeverity,
    PayoutDollarMismatchRule,
} from '~/lib/prop-accounts/alerts';
import { AccountStage, PayoutStatus, usdCents } from '~/lib/prop-accounts/core';

import {
    accountFor,
    alertsOf,
    ANY_EVAL_PLAN,
    MONDAY,
    paidPayout,
    snapshotFor,
} from './alertFixtures';

const rule = new PayoutDollarMismatchRule();
const account = accountFor(ANY_EVAL_PLAN, { stage: AccountStage.Funded });

function alertsWith(
    cumulativePayoutCents: null | number,
    payouts: ReturnType<typeof paidPayout>[],
) {
    return alertsOf(rule, {
        accounts: [account],
        payouts,
        snapshots: [
            snapshotFor(account, {
                asOf: MONDAY,
                cumulativePayoutCents:
                    cumulativePayoutCents === null
                        ? null
                        : usdCents(cumulativePayoutCents),
            }),
        ],
    });
}

function paidNet(netCents: number) {
    return paidPayout(account, {
        grossCents: usdCents(netCents + 5000),
        netCents: usdCents(netCents),
    });
}

describe('PayoutDollarMismatchRule', () => {
    it('is silent when the snapshot equals the sum of paid net payouts', () => {
        expect(alertsWith(90_000, [paidNet(40_000), paidNet(50_000)])).toEqual(
            [],
        );
    });

    it('tolerates a difference of exactly $1 and fires above it', () => {
        expect(alertsWith(90_100, [paidNet(40_000), paidNet(50_000)])).toEqual(
            [],
        );
        const alerts = alertsWith(90_101, [paidNet(40_000), paidNet(50_000)]);
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.PayoutDollarMismatch);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain('$901.01');
        expect(alerts[0]?.message).toContain('$900.00');
        expect(alerts[0]?.disclosures).toEqual([]);
    });

    it('ignores payouts that are not paid or were paid after the snapshot', () => {
        expect(
            alertsWith(40_000, [
                paidNet(40_000),
                paidPayout(account, { status: PayoutStatus.Requested }),
                paidPayout(account, { status: PayoutStatus.Cancelled }),
                paidPayout(account, { paidOn: '2026-09-22' }),
            ]),
        ).toEqual([]);
    });

    it('uses gross where net is missing and flags it', () => {
        const grossOnly = paidPayout(account, {
            grossCents: usdCents(60_000),
            netCents: null,
        });
        const alerts = alertsWith(50_000, [grossOnly]);
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.message).toContain('$600.00');
        expect(alerts[0]?.message).toContain('1 counted at gross');
        expect(alerts[0]?.disclosures).toEqual([
            AlertDisclosure.GrossUsedForMissingNet,
        ]);
        expect(alertsWith(60_000, [grossOnly])).toEqual([]);
    });

    it('dates a paid payout by its paid date only, never by its request date', () => {
        const undated = paidPayout(account, {
            netCents: usdCents(45_000),
            paidOn: null,
            requestedOn: '2026-09-08',
        });
        const alerts = alertsWith(45_000, [undated]);
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.message).toContain('sum to $0.00');
    });

    it('is silent when the snapshot has no cumulative payout', () => {
        expect(alertsWith(null, [paidNet(40_000)])).toEqual([]);
    });
});
