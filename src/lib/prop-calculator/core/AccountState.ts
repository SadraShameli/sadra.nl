export interface AccountState {
    balance: number;
    bestDayProfit: number;
    daysElapsed: number;
    fundingBaseline: number;
    qualifyingDays: number;
    startingBalance: number;
    threshold: number;
    thresholdLocked: boolean;
    todayHigh: number;
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
        daysElapsed: 0,
        // Not meaningful until the account is funded; set for real the
        // moment the funded phase begins (see `runFundedHorizon`).
        fundingBaseline: startingBalance,
        qualifyingDays: 0,
        startingBalance,
        threshold: initialThreshold,
        thresholdLocked: false,
        todayHigh: startingBalance,
        todayPnL: 0,
        tradingDays: 0,
    };
}

export function resetForNewDay(state: AccountState): void {
    state.todayHigh = state.balance;
    state.todayPnL = 0;
}
