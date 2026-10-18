import { z } from 'zod';

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

export const accountStateSchema = z.looseObject({
    balance: z.number().nonnegative(),
    bestDayProfit: z.number(),
    calendarWeekSessionsElapsed: z.number().optional(),
    calendarWeekSessionsTraded: z.number().optional(),
    consecutiveIdleDays: z.number(),
    elapsedDays: z.number().optional(),
    intradayHighProfit: z.number(),
    peakDayCloseProfit: z.number(),
    peakIntradayProfit: z.number(),
    qualifyingDays: z.number(),
    startingBalance: z.number(),
    threshold: z.number(),
    thresholdLocked: z.boolean(),
    todayPnL: z.number(),
    tradingDays: z.number(),
}) satisfies z.ZodType<AccountState>;

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
