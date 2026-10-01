import { type AccountState } from './AccountState';
import { didCalendarWeekCloseForInactivity } from './InactivityRule';
import { type Plan } from './Plan';
import { TradingPhase } from './TradingPhase';

export interface TradingDayCloseResult {
    closedForCalendarWeekInactivity: boolean;
}

export function applyTrade(
    plan: Plan,
    phase: TradingPhase,
    state: AccountState,
    pnl: number,
    peakPnL?: number,
): void {
    state.balance += pnl;
    state.todayPnL += pnl;
    plan.drawdownFor(phase).onTrade(state, pnl, peakPnL);
    plan.recordIntradayHigh(state);
}

export function closeTradingDay(
    plan: Plan,
    phase: TradingPhase,
    state: AccountState,
    isTraded: boolean,
): TradingDayCloseResult {
    const isEval = phase === TradingPhase.Eval;
    if (isEval) {
        state.elapsedDays = (state.elapsedDays ?? 0) + 1;
    }
    if (isTraded) {
        if (isEval) {
            state.tradingDays += 1;
        }
        state.consecutiveIdleDays = 0;
        if (state.todayPnL >= (plan.minQualifyingDayProfit ?? -Infinity)) {
            state.qualifyingDays += 1;
        }
    } else {
        state.consecutiveIdleDays += 1;
    }
    const wasClosedForCalendarWeekInactivity =
        didCalendarWeekCloseForInactivity(
            plan.calendarWeekInactivityFor(phase),
            state,
            isTraded,
        );
    plan.drawdownFor(phase).onDayClose(state);
    plan.recordDayClosePeak(state);
    return {
        closedForCalendarWeekInactivity: wasClosedForCalendarWeekInactivity,
    };
}

export function recordBestDay(state: AccountState): void {
    if (state.todayPnL > state.bestDayProfit) {
        state.bestDayProfit = state.todayPnL;
    }
}
