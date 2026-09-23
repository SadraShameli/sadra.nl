import { type SimInputs } from './types';
import { assertPositiveSafeInteger } from './validation';

export const SIM_DEFAULTS = {
    commissionPerRoundTrip: 0,
    copyAccounts: 1,
    idleDayProbability: 0,
    maxAttempts: 1,
    rebuyLagDays: 0,
} as const satisfies Partial<Record<keyof SimInputs, number>>;

export function resolveCopyAccounts(
    copyAccounts: number = SIM_DEFAULTS.copyAccounts,
): number {
    assertPositiveSafeInteger(copyAccounts, 'copyAccounts');
    return copyAccounts;
}
