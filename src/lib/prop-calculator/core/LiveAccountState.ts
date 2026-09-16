export interface LiveAccountState {
    balance: number;
    bestDayProfit: number;
    consecutiveIdleDays: number;
    peakDayCloseProfit: number;
    qualifyingDays: number;
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
        consecutiveIdleDays: 0,
        peakDayCloseProfit: 0,
        qualifyingDays: 0,
        startingBalance,
        threshold: initialThreshold,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 0,
    };
}
