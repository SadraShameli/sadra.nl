import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    FeeKind,
    FirmKeyKind,
} from '~/lib/prop-accounts/core';
import { firmReturns } from '~/lib/prop-accounts/metrics';
import { NoiseVerdict } from '~/lib/prop-calculator/stats';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    ledger,
    OTHER_FIRM_EVAL_PLAN,
    payout,
    purchased,
} from './ledgerFixtures';

describe('firmReturns', () => {
    it('gives spend, payouts, net, multiple, attempts, funded and payout dates per firm', () => {
        const funded = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const failed = account(EVAL_PLAN, {
            purchasedOn: '2026-09-02',
            status: AccountStatus.Busted,
        });
        const result = firmReturns(
            ledger({
                accounts: [funded, failed],
                events: [
                    purchased(funded),
                    event(funded, AccountEventKind.EvalPassed, '2026-09-10'),
                    purchased(failed),
                    event(failed, AccountEventKind.Busted, '2026-09-04'),
                ],
                fees: [
                    fee(funded, FeeKind.EvalPurchase, 10_000, '2026-09-01'),
                    fee(failed, FeeKind.EvalPurchase, 10_000, '2026-09-02'),
                ],
                payouts: [
                    payout(funded, 60_000, {
                        netCents: 60_000,
                        paidOn: '2026-09-15',
                    }),
                    payout(funded, 40_000, {
                        netCents: 40_000,
                        paidOn: '2026-09-25',
                    }),
                ],
            }),
        );
        const firm = result.firms.find(
            (row) => row.firmKey.kind === FirmKeyKind.Modeled,
        );
        expect(firm).toMatchObject({
            accounts: 2,
            accountsWithPayout: 1,
            attempts: 2,
            firstPayoutOn: '2026-09-15',
            fundedAccounts: 1,
            lastPayoutOn: '2026-09-25',
            net: 100_000 - 20_000,
            payouts: 100_000,
            spend: 20_000,
        });
        expect(firm?.multiple).toBeCloseTo(100_000 / 20_000, 6);
    });

    it('leaves the verdict Unknown without at least two accounts on both sides', () => {
        const only = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const other = account(OTHER_FIRM_EVAL_PLAN, {
            stage: AccountStage.Funded,
        });
        const result = firmReturns(
            ledger({
                accounts: [only, other],
                events: [purchased(only), purchased(other)],
                fees: [
                    fee(only, FeeKind.EvalPurchase, 10_000, '2026-09-01'),
                    fee(other, FeeKind.EvalPurchase, 10_000, '2026-09-01'),
                ],
            }),
        );
        for (const firm of result.firms) {
            expect(firm.verdict).toBe(NoiseVerdict.Unknown);
        }
    });

    it('is empty for an empty ledger', () => {
        expect(firmReturns(ledger({})).firms).toEqual([]);
    });
});
