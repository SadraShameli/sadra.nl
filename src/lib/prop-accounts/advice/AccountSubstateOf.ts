import { AccountStatus } from '~/lib/prop-accounts/core';
import { AccountSubstate } from '~/lib/prop-calculator/advisor';

export function accountSubstateOf(
    status: AccountStatus,
): AccountSubstate.Suspended | null {
    switch (status) {
        case AccountStatus.Active:
        case AccountStatus.Busted:
        case AccountStatus.Closed:
        case AccountStatus.Concluded: {
            return null;
        }
        case AccountStatus.Suspended: {
            return AccountSubstate.Suspended;
        }
    }
}
