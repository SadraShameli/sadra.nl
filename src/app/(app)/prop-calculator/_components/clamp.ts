import type { CalculatorState } from './types';

export function clampInt(
    n: number,
    lo: number,
    hi: number,
    fallback: number,
): number {
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, Math.floor(n)));
}

export function clampNumber(
    n: number,
    lo: number,
    hi: number,
    fallback: number,
): number {
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
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
