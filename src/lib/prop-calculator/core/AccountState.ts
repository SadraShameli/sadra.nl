export interface AccountState {
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

export function createInitialState(
    startingBalance: number,
    initialThreshold: number,
): AccountState {
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

export function resetForNewDay(state: AccountState): void {
    state.todayPnL = 0;
}
