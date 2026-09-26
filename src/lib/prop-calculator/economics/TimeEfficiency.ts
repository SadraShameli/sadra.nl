import { type Dollars, TRADING_DAYS_PER_MONTH } from '../core';
import {
    type EconomicsEstimate,
    EconomicsReason,
    isCount,
    isNonNegativeAmount,
    missingQuantity,
    type Quantity,
    quantityOf,
} from './EdgeMath';

export interface ScreenHourInputs {
    accountsPerSession: number;
    expectedMonthlyNet: Dollars;
    expectedMonthlyNetStandardError?: number;
    sessionHoursPerDay: number;
}

export function netPerScreenHour(
    inputs: ScreenHourInputs,
): Quantity<EconomicsEstimate> {
    const {
        accountsPerSession,
        expectedMonthlyNet,
        expectedMonthlyNetStandardError,
        sessionHoursPerDay,
    } = inputs;
    if (
        !Number.isFinite(expectedMonthlyNet) ||
        !isCount(accountsPerSession) ||
        accountsPerSession < 1 ||
        !(Number.isFinite(sessionHoursPerDay) && sessionHoursPerDay > 0) ||
        (expectedMonthlyNetStandardError !== undefined &&
            !isNonNegativeAmount(expectedMonthlyNetStandardError))
    ) {
        return missingQuantity(EconomicsReason.InvalidInput);
    }
    const factor =
        accountsPerSession / (TRADING_DAYS_PER_MONTH * sessionHoursPerDay);
    return quantityOf({
        standardError:
            expectedMonthlyNetStandardError === undefined
                ? null
                : expectedMonthlyNetStandardError * factor,
        value: expectedMonthlyNet * factor,
    });
}
