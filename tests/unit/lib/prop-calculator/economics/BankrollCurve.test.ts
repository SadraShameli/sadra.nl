import { describe, expect, it } from 'vitest';

import { dollars, fraction } from '~/lib/prop-calculator/core';
import {
    batchLossClosedForm,
    compoundMinimumBudget,
    EconomicsReason,
    empiricalPayingStatsOf,
    impliedCycleMultiple,
    lossProbabilityAt,
    lossProbabilityCurve,
    LossSampleUnit,
    MAX_LOSS_TARGET_CAP,
    minimumBudgetForLossTarget,
    projectionMonthEnds,
    spendPayoutCurve,
} from '~/lib/prop-calculator/economics';

const THREE_POINT_NETS = [
    ...Array.from({ length: 80 }, () => -250),
    ...Array.from({ length: 15 }, () => 500),
    ...Array.from({ length: 5 }, () => 10_000),
];
const THREE_POINT_COST = 250;
const THREE_POINT_EXACT_MINIMUM_ATTEMPTS = 86;
const THREE_POINT_TOLERANCE_ATTEMPTS = 8;

const CURVE_TOLERANCE = 0.008;

const TOY_NETS = [-100, -100, -100, -100, 900];
const TOY_COST = 100;
const TOY_CLOSED_FORM_ATTEMPTS = 44;
const TOY_TOLERANCE_ATTEMPTS = 3;

function closedFormMinimumAttempts(
    netValues: readonly number[],
    cost: number,
    threshold: number,
): null | number {
    const { pAttemptPays, valuePerPayingAttempt } = empiricalPayingStatsOf(
        netValues,
        cost,
    );
    const budget = minimumBudgetForLossTarget({
        cap: MAX_LOSS_TARGET_CAP,
        costPerSample: dollars(cost),
        costUnit: LossSampleUnit.Attempt,
        lossProbability: (attempts) =>
            batchLossClosedForm({
                attemptCost: dollars(cost),
                attempts,
                pAttemptPays,
                valuePerPayingAttempt,
            }).value ?? 1,
        meanNetPerSample: dollars(
            netValues.reduce((sum, net) => sum + net, 0) / netValues.length,
        ),
        sampleUnit: LossSampleUnit.Attempt,
        threshold: fraction(threshold),
    });
    return budget.value === null ? null : Math.round(budget.value / cost);
}

describe('lossProbabilityCurve', () => {
    it('is zero at every attempt count when no net is negative', () => {
        const quantity = lossProbabilityCurve([0, 250, 1000], 40, 1000, 5);
        expect(quantity.value?.probabilities).toStrictEqual(
            Array.from({ length: 40 }, () => 0),
        );
    });

    it('reads P(batch net < 0) at every attempt count from one pass of random walks', () => {
        const quantity = lossProbabilityCurve(TOY_NETS, 60, 20_000, 7);
        expect(quantity.value).not.toBeNull();
        if (quantity.value === null) throw new Error('unreachable');
        expect(quantity.value.probabilities).toHaveLength(60);
        const exact = new Map([
            [1, 0.8],
            [41, 0.0664],
            [43, 0.0506],
            [44, 0.044],
        ]);
        for (const [attempts, probability] of exact) {
            expect(
                Math.abs(
                    lossProbabilityAt(quantity.value, attempts) - probability,
                ),
            ).toBeLessThan(CURVE_TOLERANCE);
        }
    });

    it('is deterministic for the same seed and differs for another seed', () => {
        const first = lossProbabilityCurve(TOY_NETS, 30, 2000, 3);
        const second = lossProbabilityCurve(TOY_NETS, 30, 2000, 3);
        const other = lossProbabilityCurve(TOY_NETS, 30, 2000, 4);
        expect(second).toEqual(first);
        expect(other).not.toEqual(first);
    });

    it('reports a loss probability of 1 outside the curve so a scan never accepts it', () => {
        const quantity = lossProbabilityCurve(TOY_NETS, 10, 100, 1);
        if (quantity.value === null) throw new Error('unreachable');
        expect(lossProbabilityAt(quantity.value, 0)).toBe(1);
        expect(lossProbabilityAt(quantity.value, 11)).toBe(1);
    });

    it.each([
        ['no nets', [], 10, 100],
        ['a non-finite net', [NaN], 10, 100],
        ['a cap of zero', TOY_NETS, 0, 100],
        ['a cap above the loss-target cap', TOY_NETS, 1001, 100],
        ['no draws', TOY_NETS, 10, 0],
        ['more samples than the cohort limit', TOY_NETS, 1000, 30_000],
    ])('is invalid input for %s', (_label, nets, cap, draws) => {
        const quantity = lossProbabilityCurve(nets, cap, draws, 1);
        expect(quantity.value).toBeNull();
        expect(quantity.reason).toBe(EconomicsReason.InvalidInput);
    });
});

describe('compoundMinimumBudget', () => {
    it('keys the minimum on the compound distribution: dispersed payouts need far more attempts than the one-value binomial says', () => {
        const closedForm = closedFormMinimumAttempts(
            THREE_POINT_NETS,
            THREE_POINT_COST,
            0.05,
        );
        const budget = compoundMinimumBudget({
            costPerAttempt: dollars(THREE_POINT_COST),
            lossThreshold: fraction(0.05),
            netValues: THREE_POINT_NETS,
            seed: 11,
        });
        expect(closedForm).not.toBeNull();
        expect(budget.value).not.toBeNull();
        if (closedForm === null || budget.value === null) {
            throw new Error('unreachable');
        }
        const attempts = Math.round(budget.value / THREE_POINT_COST);
        expect(attempts).toBeGreaterThan(closedForm * 2);
        expect(
            Math.abs(attempts - THREE_POINT_EXACT_MINIMUM_ATTEMPTS),
        ).toBeLessThanOrEqual(THREE_POINT_TOLERANCE_ATTEMPTS);
    });

    it('still gives the closed-form answer on the two-point toy, within the Monte Carlo tolerance', () => {
        const budget = compoundMinimumBudget({
            costPerAttempt: dollars(TOY_COST),
            lossThreshold: fraction(0.05),
            netValues: TOY_NETS,
            seed: 11,
        });
        if (budget.value === null) throw new Error('unreachable');
        expect(closedFormMinimumAttempts(TOY_NETS, TOY_COST, 0.05)).toBe(
            TOY_CLOSED_FORM_ATTEMPTS,
        );
        expect(
            Math.abs(
                Math.round(budget.value / TOY_COST) - TOY_CLOSED_FORM_ATTEMPTS,
            ),
        ).toBeLessThanOrEqual(TOY_TOLERANCE_ATTEMPTS);
    });

    it('is deterministic for the same seed', () => {
        const inputs = {
            costPerAttempt: dollars(TOY_COST),
            lossThreshold: fraction(0.05),
            netValues: TOY_NETS,
            seed: 5,
        };
        expect(compoundMinimumBudget(inputs)).toEqual(
            compoundMinimumBudget(inputs),
        );
    });

    it('keeps the reasons of the loss-target scan', () => {
        const base = {
            costPerAttempt: dollars(TOY_COST),
            netValues: TOY_NETS,
            seed: 1,
        };
        expect(
            compoundMinimumBudget({ ...base, lossThreshold: null }).reason,
        ).toBe(EconomicsReason.ThresholdNotSet);
        expect(
            compoundMinimumBudget({
                ...base,
                lossThreshold: fraction(0.05),
                netValues: [-100, -100, 50],
            }).reason,
        ).toBe(EconomicsReason.NoPositiveEdge);
    });

    it('builds the curve once per call and finishes well inside the test limit', () => {
        const started = performance.now();
        compoundMinimumBudget({
            costPerAttempt: dollars(THREE_POINT_COST),
            lossThreshold: fraction(0.05),
            netValues: THREE_POINT_NETS,
            seed: 2,
        });
        expect(performance.now() - started).toBeLessThan(4000);
    });
});

describe('spendPayoutCurve', () => {
    const NETS = [900, -100, -100, -100, -100];
    const FEES = NETS.map(() => 100);

    it('prices each budget at floor(budget / cost) attempts with expected spend rising by one attempt cost per added attempt', () => {
        const points = spendPayoutCurve(
            NETS,
            FEES,
            dollars(100),
            [dollars(500), dollars(1000), dollars(2000)],
            3,
        );
        const values = points.map((point) => point.value);
        expect(values.map((value) => value?.attempts)).toStrictEqual([
            5, 10, 20,
        ]);
        expect(values.map((value) => value?.expectedSpend)).toStrictEqual([
            500, 1000, 2000,
        ]);
    });

    it('sets expected payouts to attempts times the mean payout and expected net to payouts minus spend', () => {
        const points = spendPayoutCurve(
            NETS,
            FEES,
            dollars(100),
            [dollars(500), dollars(2000)],
            3,
        );
        const [small, large] = points.map((point) => point.value);
        expect(small?.expectedPayouts).toBeCloseTo(5 * 200, 9);
        expect(large?.expectedPayouts).toBeCloseTo(20 * 200, 9);
        expect(small?.expectedNet).toBeCloseTo(500, 9);
        expect(large?.expectedNet).toBeCloseTo(2000, 9);
    });

    it('has an expected net of zero at every budget for a zero-EV fixture', () => {
        const nets = [100, -100];
        const points = spendPayoutCurve(
            nets,
            nets.map(() => 100),
            dollars(100),
            [dollars(300), dollars(1500), dollars(9000)],
            9,
        );
        for (const point of points) {
            expect(point.value?.expectedNet).toBeCloseTo(0, 9);
        }
    });

    it('carries an ordered net band and a loss probability with a standard error', () => {
        const [point] = spendPayoutCurve(
            NETS,
            FEES,
            dollars(100),
            [dollars(2000)],
            3,
        );
        const value = point?.value;
        if (value === null || value === undefined)
            throw new Error('unreachable');
        expect(value.netP10).toBeLessThanOrEqual(value.netP90);
        expect(value.lossProbability.value).toBeGreaterThanOrEqual(0);
        expect(value.lossProbability.value).toBeLessThanOrEqual(1);
        expect(value.lossProbability.standardError).not.toBeNull();
    });

    it('is a missing quantity for a budget below one attempt', () => {
        const [point] = spendPayoutCurve(
            NETS,
            FEES,
            dollars(100),
            [dollars(99)],
            3,
        );
        expect(point?.value).toBeNull();
        expect(point?.reason).toBe(EconomicsReason.InvalidInput);
    });
});

function seriesOf(horizonDays: number) {
    const days = Array.from({ length: horizonDays + 1 }, (_, day) => day);
    return {
        cashP10: days.map((day) => 1000 + day),
        cashP50: days.map((day) => 1000 + day * 2),
        cashP90: days.map((day) => 1000 + day * 3),
        cumulativeSpendP50: days.map((day) => day * 5),
        days,
        payoutP50: days.map((day) => day * 7),
    };
}

describe('projectionMonthEnds', () => {
    it('returns one row per trading month for a three-month horizon, the last equal to the final-day figures', () => {
        const series = seriesOf(63);
        const rows = projectionMonthEnds(series);
        expect(rows.map((row) => row.day)).toStrictEqual([21, 42, 63]);
        expect(rows.map((row) => row.month)).toStrictEqual([1, 2, 3]);
        const last = rows.at(-1);
        expect(last?.cashP10).toBe(series.cashP10.at(-1));
        expect(last?.cashP50).toBe(series.cashP50.at(-1));
        expect(last?.cashP90).toBe(series.cashP90.at(-1));
    });

    it("reports each month's payouts and spend as the change over the month", () => {
        const rows = projectionMonthEnds(seriesOf(63));
        for (const row of rows) {
            expect(row.payoutsP50).toBe(21 * 7);
            expect(row.spendP50).toBe(21 * 5);
        }
    });

    it('ends a partial last month on the final day', () => {
        const rows = projectionMonthEnds(seriesOf(40));
        expect(rows.map((row) => row.day)).toStrictEqual([21, 40]);
        expect(rows[1]?.payoutsP50).toBe(19 * 7);
        expect(rows[1]?.spendP50).toBe(19 * 5);
    });

    it('has no rows for a zero-day horizon', () => {
        expect(projectionMonthEnds(seriesOf(0))).toStrictEqual([]);
    });
});

describe('impliedCycleMultiple', () => {
    it('is the per-cycle growth that compounds start into final over the horizon', () => {
        expect(impliedCycleMultiple(1000, 4000, 30, 60)).toBeCloseTo(2, 9);
        expect(impliedCycleMultiple(1000, 1000, 21, 180)).toBeCloseTo(1, 9);
    });

    it('is null for a missing start, a negative final or a non-positive span', () => {
        expect(impliedCycleMultiple(0, 100, 30, 60)).toBeNull();
        expect(impliedCycleMultiple(1000, -1, 30, 60)).toBeNull();
        expect(impliedCycleMultiple(1000, 100, 0, 60)).toBeNull();
        expect(impliedCycleMultiple(1000, 100, 30, 0)).toBeNull();
    });
});
