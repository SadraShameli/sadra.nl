import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    LifetimePayoutCountRule,
} from '~/lib/prop-accounts/alerts';
import { AccountStage, PayoutStatus } from '~/lib/prop-accounts/core';

import {
    accountFor,
    alertsOf,
    paidPayout,
    planWhere,
    snapshotFor,
} from './alertFixtures';

const CAPPED = planWhere((plan) => plan.maxLifetimePayouts !== null);
const UNCAPPED = planWhere((plan) => plan.maxLifetimePayouts === null);
const MAX_PAYOUTS = CAPPED.plan.maxLifetimePayouts ?? 0;
const rule = new LifetimePayoutCountRule();

function alertsAt(
    payoutsTaken: null | number,
    options: {
        entry?: typeof CAPPED;
        paidCount?: number;
        stage?: AccountStage;
    } = {},
) {
    const account = accountFor(options.entry ?? CAPPED, {
        stage: options.stage ?? AccountStage.Funded,
    });
    const payouts = Array.from({ length: options.paidCount ?? 0 }, () =>
        paidPayout(account),
    );
    return alertsOf(rule, {
        accounts: [account],
        payouts: [
            ...payouts,
            paidPayout(account, { status: PayoutStatus.Requested }),
        ],
        snapshots: [snapshotFor(account, { payoutsTaken })],
    });
}

describe('LifetimePayoutCountRule', () => {
    it('is silent below max - 1 payouts', () => {
        expect(alertsAt(MAX_PAYOUTS - 2)).toEqual([]);
    });

    it('warns at max - 1 payouts', () => {
        const alerts = alertsAt(MAX_PAYOUTS - 1);
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.LifetimePayoutCountNear);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain(
            `${MAX_PAYOUTS - 1} of ${MAX_PAYOUTS}`,
        );
    });

    it('is critical once every lifetime payout is taken', () => {
        expect(alertsAt(MAX_PAYOUTS)[0]?.severity).toBe(AlertSeverity.Critical);
    });

    it('counts the larger of the snapshot and the paid ledger', () => {
        expect(
            alertsAt(MAX_PAYOUTS - 2, { paidCount: MAX_PAYOUTS - 1 }),
        ).toHaveLength(1);
        expect(alertsAt(null, { paidCount: MAX_PAYOUTS - 1 })).toHaveLength(1);
        expect(alertsAt(null, { paidCount: MAX_PAYOUTS - 2 })).toEqual([]);
    });

    it('applies only to funded accounts on plans with a lifetime payout count', () => {
        expect(alertsAt(MAX_PAYOUTS, { stage: AccountStage.Eval })).toEqual([]);
        expect(alertsAt(50, { entry: UNCAPPED })).toEqual([]);
    });
});
