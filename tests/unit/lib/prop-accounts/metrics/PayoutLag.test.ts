import { describe, expect, it } from 'vitest';

import { FirmKeyKind } from '~/lib/prop-accounts/core';
import { payoutLag } from '~/lib/prop-accounts/metrics';
import {
    meanStandardError,
    NINETY_FIVE_PERCENT_Z,
} from '~/lib/prop-calculator/stats';

import { account, EVAL_PLAN, ledger, payout, purchased } from './ledgerFixtures';

function meanInterval(value: number, standardError: null | number) {
    return standardError === null
        ? null
        : {
              lower: value - NINETY_FIVE_PERCENT_Z * standardError,
              upper: value + NINETY_FIVE_PERCENT_Z * standardError,
          };
}

describe('payoutLag', () => {
    it('gives request-to-approval and request-to-paid days per firm, with n and the mean SE', () => {
        const owner = account(EVAL_PLAN);
        const result = payoutLag(
            ledger({
                accounts: [owner],
                events: [purchased(owner)],
                payouts: [
                    payout(owner, 40_000, {
                        approvedOn: '2026-09-12',
                        paidOn: '2026-09-20',
                        requestedOn: '2026-09-10',
                    }),
                    payout(owner, 40_000, {
                        approvedOn: '2026-09-22',
                        paidOn: '2026-09-30',
                        requestedOn: '2026-09-20',
                    }),
                ],
            }),
        );
        const firm = result.perFirm.find(
            (row) => row.firmKey.kind === FirmKeyKind.Modeled,
        );
        const approvalSe = meanStandardError(4, 8, 2);
        const paidSe = meanStandardError(20, 200, 2);
        expect(firm?.requestToApproval).toEqual({
            interval: meanInterval(2, approvalSe),
            n: 2,
            standardError: approvalSe,
            value: 2,
        });
        expect(firm?.requestToPaid).toEqual({
            interval: meanInterval(10, paidSe),
            n: 2,
            standardError: paidSe,
            value: 10,
        });
    });

    it('leaves out payouts with no approval date or no paid date from that measure', () => {
        const owner = account(EVAL_PLAN);
        const result = payoutLag(
            ledger({
                accounts: [owner],
                events: [purchased(owner)],
                payouts: [
                    payout(owner, 40_000, {
                        approvedOn: null,
                        paidOn: '2026-09-20',
                        requestedOn: '2026-09-10',
                    }),
                ],
            }),
        );
        const firm = result.perFirm[0];
        expect(firm?.requestToApproval).toBeNull();
        expect(firm?.requestToPaid).toEqual({
            interval: null,
            n: 1,
            standardError: null,
            value: 10,
        });
    });

    it('is empty for an empty ledger', () => {
        expect(payoutLag(ledger({})).perFirm).toEqual([]);
    });
});
