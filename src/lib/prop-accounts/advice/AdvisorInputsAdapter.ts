import { usdCents, usdCentsToDollars } from '~/lib/prop-accounts/core';
import { type Dollars } from '~/lib/prop-calculator';

export function optionalDollars(
    cents: null | number | undefined,
): Dollars | undefined {
    return cents === null || cents === undefined
        ? undefined
        : usdCentsToDollars(usdCents(cents));
}
