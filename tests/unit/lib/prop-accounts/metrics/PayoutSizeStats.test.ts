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
                    event(
                        fundedFirmB,
                        AccountEventKind.EvalPassed,
                        '2026-01-05',
                    ),
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

    it('breaks payouts into low-balance, above-cushion and no-snapshot bands with count, mean and median', () => {
        const owner = account(EVAL_PLAN);
        const balances: Readonly<
            Record<
                string,
                { balanceCents: number; dashboardFloorCents: number }
            >
        > = {
            '2026-01-10': { balanceCents: 51_000, dashboardFloorCents: 50_000 },
            '2026-01-20': {
                balanceCents: 400_000,
                dashboardFloorCents: 50_000,
            },
            '2026-01-30': {
                balanceCents: 500_000,
                dashboardFloorCents: 50_000,
            },
        };
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
                    payout(owner, 20_000, {
                        netCents: 20_000,
                        paidOn: '2026-01-20',
                        status: PayoutStatus.Paid,
                    }),
                    payout(owner, 40_000, {
                        netCents: 40_000,
                        paidOn: '2026-01-30',
                        status: PayoutStatus.Paid,
                    }),
                    payout(owner, 90_000, {
                        netCents: 90_000,
                        paidOn: '2026-02-10',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
            {
                latestBalanceOnOrBefore: (_accountId, asOf) => {
                    const balance = balances[asOf];
                    return balance === undefined
                        ? null
                        : {
                              balanceCents: usdCents(balance.balanceCents),
                              dashboardFloorCents: usdCents(
                                  balance.dashboardFloorCents,
                              ),
                          };
                },
                retainedCushionCents: usdCents(200_000),
            },
        );
        expect(result.byBalance.lowBalance.count).toBe(1);
        expect(result.byBalance.lowBalance.mean?.value).toBe(10_000);
        expect(result.byBalance.lowBalance.median).toBe(usdCents(10_000));
        expect(result.byBalance.aboveCushion.count).toBe(2);
        expect(result.byBalance.aboveCushion.mean?.value).toBe(30_000);
        expect(result.byBalance.aboveCushion.median).toBe(usdCents(30_000));
        expect(result.byBalance.noSnapshot.count).toBe(1);
        expect(result.byBalance.noSnapshot.mean?.value).toBe(90_000);
        expect(result.lowBalanceCount).toBe(1);
    });

    it('puts every payout in the no-snapshot band without a snapshot lookup or a retained cushion', () => {
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
        expect(result.byBalance.noSnapshot.count).toBe(1);
        expect(result.byBalance.lowBalance.count).toBe(0);
        expect(result.byBalance.lowBalance.mean).toBeNull();
        expect(result.byBalance.aboveCushion.count).toBe(0);
        expect(result.byBalance.aboveCushion.mean).toBeNull();
        expect(result.byBalance.aboveCushion.median).toBeNull();
        expect(result.byBalance.lowBalance.median).toBeNull();
        expect(result.byBalance.noSnapshot.median).toBe(usdCents(10_000));
    });

    it('gives an empty band no median instead of a real-looking zero', () => {
        const { aboveCushion, lowBalance, noSnapshot } = payoutSizeStats(
            ledger({}),
        ).byBalance;
        for (const band of [aboveCushion, lowBalance, noSnapshot]) {
            expect(band.count).toBe(0);
            expect(band.mean).toBeNull();
            expect(band.median).toBeNull();
        }
    });

    it('reports the real bucket width of the bins it returns, not the requested one', () => {
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
                    payout(owner, 80_000, {
                        netCents: 80_000,
                        paidOn: '2026-01-02',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
            { bucketWidthCents: usdCents(50_000) },
        );
        expect(result.histogram).toHaveLength(2);
        expect(result.bucketWidthCents).toBe(35_000);
        for (const bin of result.histogram) {
            expect(bin.binEnd - bin.binStart).toBeCloseTo(35_000, 6);
        }
    });

    it('reports a zero bucket width for identical payouts and for none', () => {
        const owner = account(EVAL_PLAN);
        const same = payoutSizeStats(
            ledger({
                accounts: [owner],
                events: [purchased(owner)],
                payouts: [
                    payout(owner, 10_000, {
                        netCents: 10_000,
                        paidOn: '2026-01-01',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
        );
        expect(same.histogram).toHaveLength(1);
        expect(same.bucketWidthCents).toBe(0);
        expect(payoutSizeStats(ledger({})).bucketWidthCents).toBe(0);
    });
});
