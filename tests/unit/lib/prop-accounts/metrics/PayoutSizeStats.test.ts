import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    FirmKeyKind,
    PayoutStatus,
    usdCents,
} from '~/lib/prop-accounts/core';
import { payoutSizeStats } from '~/lib/prop-accounts/metrics';
import { meanStandardError } from '~/lib/prop-calculator/stats';

import {
    account,
    EVAL_PLAN,
    event,
    ledger,
    meanInterval,
    OTHER_FIRM_EVAL_PLAN,
    payout,
    purchased,
} from './ledgerFixtures';

describe('payoutSizeStats', () => {
    it('counts Paid payouts, net where given, gross fallback counted, with mean, median, p10 and p90', () => {
        const owner = account(EVAL_PLAN);
        const result = payoutSizeStats(
            ledger({
                accounts: [owner],
                events: [purchased(owner)],
                payouts: [
                    payout(owner, 10_000, {
                        netCents: 9000,
                        paidOn: '2026-01-10',
                        status: PayoutStatus.Paid,
                    }),
                    payout(owner, 20_000, {
                        netCents: null,
                        paidOn: '2026-01-20',
                        status: PayoutStatus.Paid,
                    }),
                    payout(owner, 30_000, {
                        netCents: 29_000,
                        paidOn: '2026-01-30',
                        status: PayoutStatus.Paid,
                    }),
                    payout(owner, 99_999, {
                        paidOn: '2026-02-01',
                        status: PayoutStatus.Requested,
                    }),
                ],
            }),
        );
        expect(result.count).toBe(3);
        expect(result.grossOnlyPayouts).toBe(1);
        expect(result.mean?.value).toBeCloseTo((9000 + 20_000 + 29_000) / 3, 6);
        expect(result.mean?.n).toBe(3);
        expect(result.median).toBe(usdCents(20_000));
        expect(result.p10).toBeLessThanOrEqual(result.median);
        expect(result.p90).toBeGreaterThanOrEqual(result.median);
    });

    it('is empty over an empty ledger', () => {
        const result = payoutSizeStats(ledger({}));
        expect(result.count).toBe(0);
        expect(result.grossOnlyPayouts).toBe(0);
        expect(result.mean).toBeNull();
        expect(result.median).toBe(usdCents(0));
        expect(result.p10).toBe(usdCents(0));
        expect(result.p90).toBe(usdCents(0));
        expect(result.histogram).toEqual([]);
        expect(result.byFirm).toEqual([]);
        expect(result.byAccountSize).toEqual([]);
        expect(result.byStage).toEqual([]);
    });

    it('breaks payouts down by account size, firm and the account stage at paidOn', () => {
        const evalFirmA = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const fundedFirmB = account(OTHER_FIRM_EVAL_PLAN, {
            purchasedOn: '2026-01-01',
            stage: AccountStage.Funded,
        });
        const result = payoutSizeStats(
            ledger({
                accounts: [evalFirmA, fundedFirmB],
                events: [
                    purchased(evalFirmA),
                    purchased(fundedFirmB),
                    event(fundedFirmB, AccountEventKind.EvalPassed, '2026-01-05'),
                ],
                payouts: [
                    payout(evalFirmA, 10_000, {
                        netCents: 10_000,
                        paidOn: '2026-01-03',
                        status: PayoutStatus.Paid,
                    }),
                    payout(fundedFirmB, 20_000, {
                        netCents: 20_000,
                        paidOn: '2026-01-10',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
        );
        const groupSe = meanStandardError(30_000, 500_000_000, 2);
        expect(result.byAccountSize).toEqual([
            {
                accountSize: EVAL_PLAN.plan.id.accountSize,
                count: 2,
                mean: {
                    interval: meanInterval(15_000, groupSe, 2),
                    n: 2,
                    standardError: groupSe,
                    value: 15_000,
                },
            },
        ]);
        expect(
            result.byFirm.map((row) => ({
                count: row.count,
                firmId:
                    row.firmKey.kind === FirmKeyKind.Modeled
                        ? row.firmKey.firmId
                        : null,
            })),
        ).toEqual(
            expect.arrayContaining([
                { count: 1, firmId: EVAL_PLAN.firm.id },
                { count: 1, firmId: OTHER_FIRM_EVAL_PLAN.firm.id },
            ]),
        );
        expect(result.byStage).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ count: 1, stage: AccountStage.Eval }),
                expect.objectContaining({
                    count: 1,
                    stage: AccountStage.Funded,
                }),
            ]),
        );
    });

    it('buckets a histogram from the bucket width in cents, default 50,000', () => {
        const owner = account(EVAL_PLAN);
        const result = payoutSizeStats(
            ledger({
                accounts: [owner],
                events: [purchased(owner)],
                payouts: [
                    payout(owner, 10_000, {
                        netCents: 10_000,
                        paidOn: '2026-01-01',
                        status: PayoutStatus.Paid,
                    }),
                    payout(owner, 60_000, {
                        netCents: 60_000,
                        paidOn: '2026-01-02',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
        );
        expect(result.histogram.length).toBeGreaterThan(0);
        expect(result.histogram.reduce((sum, bin) => sum + bin.count, 0)).toBe(
            2,
        );
    });

    it('flags a payout low-balance when balance minus the dashboard floor is below the retained cushion, read not recomputed', () => {
        const owner = account(EVAL_PLAN);
        const result = payoutSizeStats(
            ledger({
                accounts: [owner],
                events: [purchased(owner)],
                payouts: [
                    payout(owner, 10_000, {
                        netCents: 10_000,
                        paidOn: '2026-01-10',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
            {
                latestBalanceOnOrBefore: () => ({
                    balanceCents: usdCents(51_000),
                    dashboardFloorCents: usdCents(50_000),
                }),
                retainedCushionCents: usdCents(200_000),
            },
        );
        expect(result.lowBalanceCount).toBe(1);
    });

    it('never flags low balance without a snapshot lookup or a retained cushion', () => {
        const owner = account(EVAL_PLAN);
        const result = payoutSizeStats(
            ledger({
                accounts: [owner],
                events: [purchased(owner)],
                payouts: [
                    payout(owner, 10_000, {
                        netCents: 10_000,
                        paidOn: '2026-01-10',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
        );
        expect(result.lowBalanceCount).toBe(0);
    });
});
