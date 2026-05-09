export interface AccountState {
    startingBalance: number;
    balance: number;
    threshold: number;
    thresholdLocked: boolean;
    todayHigh: number;
    todayPnL: number;
    tradingDays: number;
    bestDayProfit: number;
    daysElapsed: number;
}

export function createInitialState(
    startingBalance: number,
    initialThreshold: number,
): AccountState {
    return {
        startingBalance,
        balance: startingBalance,
        threshold: initialThreshold,
        thresholdLocked: false,
        todayHigh: startingBalance,
        todayPnL: 0,
        tradingDays: 0,
        bestDayProfit: 0,
        daysElapsed: 0,
    };
}

export function resetForNewDay(state: AccountState): void {
    state.todayHigh = state.balance;
    state.todayPnL = 0;
}
