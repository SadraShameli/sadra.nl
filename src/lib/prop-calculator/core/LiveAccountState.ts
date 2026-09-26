export interface LiveAccountState {
    balance: number;
    bestDayProfit: number;
    calendarWeekSessionsElapsed?: number;
    calendarWeekSessionsTraded?: number;
    consecutiveIdleDays: number;
    peakDayCloseProfit: number;
    qualifyingDays: number;
    qualifyingDaysAtLastPayout: number;
    startingBalance: number;
    threshold: number;
    thresholdLocked: boolean;
    todayPnL: number;
    tradingDays: number;
}

export function createInitialLiveAccountState(
    startingBalance: number,
    initialThreshold: number,
): LiveAccountState {
    return {
        balance: startingBalance,
        bestDayProfit: 0,
        calendarWeekSessionsElapsed: 0,
        calendarWeekSessionsTraded: 0,
        consecutiveIdleDays: 0,
        peakDayCloseProfit: 0,
        qualifyingDays: 0,
        qualifyingDaysAtLastPayout: 0,
        startingBalance,
        threshold: initialThreshold,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 0,
    };
}
