import type { CalculatorState } from './types';

export function clampInt(
    n: number,
    lo: number,
    hi: number,
    fallback: number,
): number {
    return Number.isFinite(n)
        ? Math.min(hi, Math.max(lo, Math.floor(n)))
        : fallback;
}

export function clampNumber(
    n: number,
    lo: number,
    hi: number,
    fallback: number,
): number {
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

export function clampStateToPlan(state: CalculatorState): CalculatorState {
    return {
        ...state,
        copyAccounts: clampInt(
            state.copyAccounts,
            1,
            state.firm.maxFundedAccounts(state.plan),
            1,
        ),
        riskDollars: clampNumber(
            state.riskDollars,
            1,
            state.plan.accountSize,
            state.riskDollars,
        ),
    };
}
