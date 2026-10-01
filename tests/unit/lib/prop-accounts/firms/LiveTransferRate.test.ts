import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    FirmKeyKind,
} from '~/lib/prop-accounts/core';
import { liveTransferRate } from '~/lib/prop-accounts/firms';

import {
    account,
    EVAL_PLAN,
    event,
    ledger,
    payout,
    purchased,
} from '../metrics/ledgerFixtures';

describe('liveTransferRate', () => {
    it('gives moved-live events per paid payout and per funded account-month, with n and a Wilson interval', () => {
        const moved = account(EVAL_PLAN, {
            purchasedOn: '2026-01-01',
            stage: AccountStage.Funded,
        });
        const stillFunded = account(EVAL_PLAN, {
            purchasedOn: '2026-02-01',
            stage: AccountStage.Funded,
        });
        const result = liveTransferRate(
            ledger({
                accounts: [moved, stillFunded],
                events: [
                    purchased(moved),
                    event(moved, AccountEventKind.EvalPassed, '2026-01-05'),
                    event(moved, AccountEventKind.MovedLive, '2026-03-10'),
                    purchased(stillFunded),
                    event(
                        stillFunded,
                        AccountEventKind.EvalPassed,
                        '2026-02-05',
                    ),
                ],
                payouts: [
                    payout(moved, 5000, { paidOn: '2026-02-01' }),
                    payout(moved, 5000, { paidOn: '2026-02-20' }),
                ],
            }),
            '2026-04-01',
        );
        const firm = result.perFirm.find(
            (row) => row.firmKey.kind === FirmKeyKind.Modeled,
        );
        expect(firm?.movedLiveCount).toBe(1);
        expect(firm?.perPaidPayout).toMatchObject({ n: 2, value: 0.5 });
        expect(firm?.perFundedAccountMonth?.n).toBe(6);
        expect(firm?.perFundedAccountMonth?.value).toBeCloseTo(1 / 6, 6);
        expect(firm?.perFundedAccountMonth?.interval).not.toBeNull();
    });

    it('gives a null rate with no paid payouts or no funded months', () => {
        const neverFunded = account(EVAL_PLAN);
        const result = liveTransferRate(
            ledger({
                accounts: [neverFunded],
                events: [purchased(neverFunded)],
            }),
            '2026-04-01',
        );
        const firm = result.perFirm.find(
            (row) => row.firmKey.kind === FirmKeyKind.Modeled,
        );
        expect(firm?.perPaidPayout).toBeNull();
        expect(firm?.perFundedAccountMonth).toBeNull();
        expect(firm?.movedLiveCount).toBe(0);
    });

    it('is empty for an empty ledger', () => {
        expect(liveTransferRate(ledger({}), '2026-04-01').perFirm).toEqual([]);
    });
});
