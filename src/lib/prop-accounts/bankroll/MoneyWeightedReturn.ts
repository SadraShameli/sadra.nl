import { compareText, isoDaysBetween } from '~/lib/prop-accounts/core';

const DAYS_PER_YEAR = 365;
const LOWER_RATE_BOUND = -0.999999;
const UPPER_RATE_BOUND = 100;
const MAX_ITERATIONS = 200;
const CONVERGENCE_TOLERANCE = 1e-9;

export interface MoneyWeightedReturnCashflow {
    readonly amountCents: number;
    readonly on: string;
}

export function moneyWeightedReturn(
    cashflows: readonly MoneyWeightedReturnCashflow[],
): null | number {
    const dated = cashflows
        .filter((cashflow) => cashflow.amountCents !== 0)
        .toSorted((a, b) => compareText(a.on, b.on));
    if (dated.length < 2) return null;
    const hasInflow = dated.some((cashflow) => cashflow.amountCents > 0);
    const hasOutflow = dated.some((cashflow) => cashflow.amountCents < 0);
    if (!hasInflow || !hasOutflow) return null;
    const firstOn = dated[0]?.on;
    if (firstOn === undefined) return null;
    const yearsFromStart = dated.map(
        (cashflow) => isoDaysBetween(firstOn, cashflow.on) / DAYS_PER_YEAR,
    );
    const netPresentValueAt = (rate: number): number =>
        dated.reduce(
            (sum, cashflow, index) =>
                sum +
                cashflow.amountCents /
                    (1 + rate) ** (yearsFromStart[index] ?? 0),
            0,
        );
    let lower = LOWER_RATE_BOUND;
    let upper = UPPER_RATE_BOUND;
    let valueAtLower = netPresentValueAt(lower);
    const valueAtUpper = netPresentValueAt(upper);
    if (
        !Number.isFinite(valueAtLower) ||
        !Number.isFinite(valueAtUpper) ||
        valueAtLower * valueAtUpper > 0
    ) {
        return null;
    }
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
        const midpoint = (lower + upper) / 2;
        const valueAtMidpoint = netPresentValueAt(midpoint);
        if (!Number.isFinite(valueAtMidpoint)) return null;
        if (valueAtMidpoint === 0 || upper - lower < CONVERGENCE_TOLERANCE) {
            return midpoint;
        }
        if (valueAtLower < 0 === valueAtMidpoint < 0) {
            lower = midpoint;
            valueAtLower = valueAtMidpoint;
        } else {
            upper = midpoint;
        }
    }
    return null;
}
