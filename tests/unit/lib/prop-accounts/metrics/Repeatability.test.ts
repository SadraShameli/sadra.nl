import { describe, expect, it } from 'vitest';

import { FeeKind } from '~/lib/prop-accounts/core';
import {
    monthlyStatement,
    realizedNetPerSlot,
    repeatability,
} from '~/lib/prop-accounts/metrics';

import { account, EVAL_PLAN, fee, ledger, payout } from './ledgerFixtures';

const NO_TARGETS = {
    monthlyPayoutTargetCents: null,
    targetMonthlyMultiple: null,
};

function threeMonthLedger() {
    const owner = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
    return ledger({
        accounts: [owner],
        fees: [fee(owner, FeeKind.EvalPurchase, 10_000, '2026-06-01')],
        payouts: [
            payout(owner, 30_000, { netCents: 30_000, paidOn: '2026-06-15' }),
            payout(owner, 10_000, { netCents: 10_000, paidOn: '2026-07-15' }),
            payout(owner, 20_000, { netCents: 20_000, paidOn: '2026-08-15' }),
        ],
    });
}

describe('repeatability', () => {
    it('gives count, mean, sample SD, worst, best and share positive over complete months', () => {
        const portfolio = threeMonthLedger();
        const statement = monthlyStatement(portfolio, '2026-09-01', NO_TARGETS);
        const slots = realizedNetPerSlot(portfolio, '2026-09-01');
        const result = repeatability(statement, slots, null);
        expect(result.overall).toMatchObject({
            best: 30_000 - 10_000,
            count: 3,
            mean: Math.round((20_000 + 10_000 + 20_000) / 3),
            sharePositive: 1,
            worst: 10_000,
        });
        expect(result.overall?.shareAtOrAboveTarget).toBeNull();
    });

    it('gives the share at or above a target, once one is set', () => {
        const portfolio = threeMonthLedger();
        const statement = monthlyStatement(portfolio, '2026-09-01', NO_TARGETS);
        const slots = realizedNetPerSlot(portfolio, '2026-09-01');
        const result = repeatability(statement, slots, 15_000);
        expect(result.overall?.shareAtOrAboveTarget).toBeCloseTo(2 / 3, 6);
    });

    it('is null without any complete month', () => {
        const empty = ledger({});
        const statement = monthlyStatement(empty, '2026-09-01', NO_TARGETS);
        const slots = realizedNetPerSlot(empty, '2026-09-01');
        const result = repeatability(statement, slots, null);
        expect(result.overall).toBeNull();
        expect(result.perSlot).toBeNull();
    });
});
