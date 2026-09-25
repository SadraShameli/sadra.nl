import {
    type AccountState,
    type FundedCycleSnapshot,
    newFundedCycleTracker,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { type DayRunOptions } from '~/lib/prop-calculator/simulator';

export function dayRunOptionsFor(
    phase: TradingPhase,
    options: Omit<DayRunOptions, 'fundedCycle' | 'phase'>,
): DayRunOptions {
    switch (phase) {
        case TradingPhase.Eval: {
            return { ...options, phase };
        }
        case TradingPhase.Funded: {
            return {
                ...options,
                fundedCycle: freshFundedCycle(options.plan, options.state),
                phase,
            };
        }
    }
}

export function freshFundedCycle(
    plan: Plan,
    state: AccountState,
): FundedCycleSnapshot {
    return newFundedCycleTracker(state).cycleSnapshot(plan, state);
}
