import { type AccountState } from './AccountState';
import { type Plan } from './Plan';
import { TradingPhase } from './TradingPhase';

export function evalStartStateIssue(
    plan: Plan,
    state: AccountState,
    maxDays: number,
): null | string {
    const { elapsedDays } = state;
    if (elapsedDays === undefined) return 'elapsedDays is missing';
    if (!Number.isSafeInteger(elapsedDays) || elapsedDays < 0) {
        return `elapsedDays must be a whole number >= 0, got ${String(elapsedDays)}`;
    }
    if (elapsedDays < state.tradingDays) {
        return `elapsedDays (${String(elapsedDays)}) is below tradingDays (${String(state.tradingDays)}); every traded day is also an elapsed session`;
    }
    if (state.todayPnL !== 0) {
        return `todayPnL must be 0 at the start of a session, got ${String(state.todayPnL)}`;
    }
    if (state.startingBalance !== plan.accountSize) {
        return `startingBalance must equal the account size ${String(plan.accountSize)}, got ${String(state.startingBalance)}`;
    }
    if (plan.isBust(state, TradingPhase.Eval)) {
        return 'the account is already busted';
    }
    if (plan.isPassed(state)) return 'the account has already passed the eval';
    const dayCap = plan.evalDayCap(maxDays);
    if (elapsedDays < dayCap) return null;
    const window =
        plan.maxEvalTradingDays !== null && plan.maxEvalTradingDays <= maxDays
            ? `the eval-day cap (${String(dayCap)})`
            : `the simulation horizon (maxDays ${String(maxDays)})`;
    return `elapsedDays (${String(elapsedDays)}) leaves no session under ${window}`;
}

export function remainingEvalSessions(
    plan: Plan,
    state: AccountState,
    maxDays: number,
): number {
    const issue = evalStartStateIssue(plan, state, maxDays);
    if (issue !== null || state.elapsedDays === undefined) {
        throw new RangeError(
            `invalid eval start state: ${issue ?? 'elapsedDays is missing'}`,
        );
    }
    return plan.evalDayCap(maxDays) - state.elapsedDays;
}

export function subscriptionElapsedDaysIssue(
    state: AccountState,
    subscriptionElapsedDays: number,
): null | string {
    const elapsedDays = state.elapsedDays ?? 0;
    return Number.isSafeInteger(subscriptionElapsedDays) &&
        subscriptionElapsedDays >= elapsedDays
        ? null
        : `subscriptionElapsedDays must be a whole number >= the attempt elapsedDays (${String(elapsedDays)}), got ${String(subscriptionElapsedDays)}`;
}
