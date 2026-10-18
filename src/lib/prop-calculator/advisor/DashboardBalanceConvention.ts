import { dollars, type Dollars } from '~/lib/prop-calculator/core';

export enum DashboardBalanceConvention {
    Nominal = 'nominal',
    ZeroBased = 'zero-based',
}

export function nominalBalanceOf(
    amount: Dollars,
    convention: DashboardBalanceConvention,
    accountSize: Dollars,
): Dollars {
    switch (convention) {
        case DashboardBalanceConvention.Nominal: {
            return amount;
        }
        case DashboardBalanceConvention.ZeroBased: {
            return dollars(amount + accountSize);
        }
    }
}
