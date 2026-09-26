export interface AccountState {
    balance: number;
    bestDayProfit: number;
    calendarWeekSessionsElapsed?: number;
    calendarWeekSessionsTraded?: number;
    consecutiveIdleDays: number;
    elapsedDays?: number;
    intradayHighProfit: number;
    peakDayCloseProfit: number;
    peakIntradayProfit: number;
    qualifyingDays: number;
    startingBalance: number;
    threshold: number;
    thresholdLocked: boolean;
    todayPnL: number;
    tradingDays: number;
}

export function createInitialState(
    startingBalance: number,
    initialThreshold: number,
): AccountState {
    return {
        balance: startingBalance,
        bestDayProfit: 0,
        calendarWeekSessionsElapsed: 0,
        calendarWeekSessionsTraded: 0,
        consecutiveIdleDays: 0,
        elapsedDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 0,
        startingBalance,
        threshold: initialThreshold,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 0,
    };
}

export function resetForNewDay(state: Pick<AccountState, 'todayPnL'>): void {
    state.todayPnL = 0;
}
