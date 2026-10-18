import { describe, expect, it } from 'vitest';

import {
    AdviceDisplayKind,
    adviceViewModel,
    OptimumFigureKind,
    type OptimumRowView,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceViewModel';
import { formatCurrency } from '~/lib/format';
import {
    type AccountState,
    dollars,
    findFirm,
    FirmId,
    newFundedCycleTracker,
    type Plan,
    serializePlanId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    DEFAULT_RULEBOOK,
    FundedSizingAdvisor,
    NO_PENDING_PAYOUT_COUNTS,
    type PayoutSizeSweepEngineOptimumResult,
    PayoutSizeSweepResultKind,
    runEngineOptimum,
    StartBasis,
} from '~/lib/prop-calculator/advisor';

import { NO_PERSONAL_LIMITS } from './personalLimitsFixture';

const HEAVY_TEST_TIMEOUT_MS = 10_000;

function advisor(): FundedSizingAdvisor {
    const state: AccountState = {
        balance: 51_500,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 20,
        startingBalance: 50_000,
        threshold: 48_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 20,
    };
    return new FundedSizingAdvisor({
        account: {
            assumptions: [],
            contractLimit: null,
            cushion: 3500,
            fundedTracker: newFundedCycleTracker({
                ...state,
                balance: state.startingBalance,
            }),
            kind: TradingPhase.Funded,
            plan: plan(),
            resolvedDailyLossLimit: null,
            state,
            ...NO_PENDING_PAYOUT_COUNTS,
        },
        fundedHorizonDays: 20,
        personalPayoutOverride: dollars(750),
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
        trials: 10,
    });
}

function plan(): Plan {
    const id = {
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    } as const;
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const MEMO_KEY = 'payout-sweep';

const memo = new Map<
    typeof MEMO_KEY,
    {
        readonly result: PayoutSizeSweepEngineOptimumResult;
        readonly rows: readonly OptimumRowView[];
    }
>();

function figureOf(row: OptimumRowView, kind: OptimumFigureKind) {
    const figure = row.figures.find((candidate) => candidate.kind === kind);
    if (figure === undefined) throw new Error(`no ${kind} figure`);
    return figure;
}

function payoutSweep() {
    const cached = memo.get(MEMO_KEY);
    if (cached !== undefined) return cached;
    const sized = advisor();
    const request = sized
        .optimumRequests()
        .find((candidate) => candidate.source === AdviceSource.PayoutSizeSweep);
    if (request === undefined) throw new Error('no payout-size request');
    const result = runEngineOptimum(plan(), request);
    if (result.source !== AdviceSource.PayoutSizeSweep) {
        throw new Error('expected a payout-size result');
    }
    const view = adviceViewModel(sized.assemble([result]), NO_PERSONAL_LIMITS);
    if (view.kind !== AdviceDisplayKind.Ready) {
        throw new Error('expected ready advice');
    }
    const computed = { result, rows: view.optima };
    memo.set(MEMO_KEY, computed);
    return computed;
}

describe('the payout-size row shows the figures behind its winner (PT-108 step 4, F-123)', () => {
    it(
        "carries the winner's monthly net with its standard error, the credit-free figure and the bust rate",
        () => {
            const { result, rows } = payoutSweep();
            if (result.sweep.kind !== PayoutSizeSweepResultKind.Optimum) {
                throw new Error('expected an optimum');
            }
            const { winner } = result.sweep.optimum;
            const [row] = rows;
            if (row === undefined) throw new Error('expected a row');
            const creditInclusive =
                winner.kind === StartBasis.Fresh
                    ? winner.out.estimates.expectedMonthlyNet
                    : {
                          standardError:
                              winner.out.estimates.fromStateExpectedCash
                                  .standardError,
                          value: winner.out.fromStateExpectedCash,
                      };
            const creditFree =
                winner.kind === StartBasis.Fresh
                    ? winner.out.estimates.expectedMonthlyRealizedNet
                    : {
                          standardError:
                              winner.out.estimates.fromStateExpectedRealizedCash
                                  .standardError,
                          value: winner.out.fromStateExpectedRealizedCash,
                      };

            expect(row.source).toBe(AdviceSource.PayoutSizeSweep);
            expect(row.standardError).toBe(creditInclusive.standardError);
            expect(figureOf(row, OptimumFigureKind.MonthlyNet).value).toBe(
                creditInclusive.value,
            );
            expect(
                figureOf(row, OptimumFigureKind.MonthlyNet).standardError,
            ).toBe(creditInclusive.standardError);
            expect(
                figureOf(row, OptimumFigureKind.CreditFreeMonthlyNet).value,
            ).toBe(creditFree.value);
            expect(
                figureOf(row, OptimumFigureKind.CreditFreeMonthlyNet)
                    .standardError,
            ).toBe(creditFree.standardError);
            expect(figureOf(row, OptimumFigureKind.BustRate).value).toBe(
                winner.out.bustProbability,
            );
            expect(row.text).toContain('credit-free');
            expect(row.text).toContain('bust rate');
        },
        HEAVY_TEST_TIMEOUT_MS,
    );

    it(
        'keeps the best payout size in the row sentence',
        () => {
            const { result, rows } = payoutSweep();
            if (result.sweep.kind !== PayoutSizeSweepResultKind.Optimum) {
                throw new Error('expected an optimum');
            }
            const [row] = rows;

            expect(row?.text).toContain('Best payout size');
            expect(row?.label).toContain(
                formatCurrency(result.sweep.optimum.winner.requestSize, 0),
            );
        },
        HEAVY_TEST_TIMEOUT_MS,
    );

    it(
        "adds the personal override's own row with the same figures when one is set",
        () => {
            const { result, rows } = payoutSweep();
            if (result.sweep.kind !== PayoutSizeSweepResultKind.Optimum) {
                throw new Error('expected an optimum');
            }
            const override = result.sweep.optimum.personalOverride;
            if (override === null)
                throw new Error('expected a personal override');

            expect(rows).toHaveLength(2);
            const row = rows[1];
            expect(row?.source).toBe(AdviceSource.PayoutSizeSweep);
            expect(row?.label).toContain('your payout request');
            expect(row?.label).toContain(
                formatCurrency(override.row.requestSize, 0),
            );
            expect(
                row === undefined ? [] : row.figures.map((f) => f.kind),
            ).toEqual([
                OptimumFigureKind.MonthlyNet,
                OptimumFigureKind.CreditFreeMonthlyNet,
                OptimumFigureKind.BustRate,
            ]);
        },
        HEAVY_TEST_TIMEOUT_MS,
    );
});
