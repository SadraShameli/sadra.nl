import {
    AccountStage,
    AccountTracking,
    paidPayoutCash,
} from '~/lib/prop-accounts/core';

import {
    evalAttemptTally,
    fundedSince,
    type LedgerAccount,
} from './PortfolioLedger';

export function attemptsOf(account: LedgerAccount): number {
    if (account.row.tracking === AccountTracking.LedgerOnly) return 1;
    if (account.plan?.plan.isInstantFunded === true) {
        return fundedSince(account) === null ? 0 : 1;
    }
    const tally = evalAttemptTally(account);
    return tally.passes + tally.fails;
}

export function isFundedAccount(account: LedgerAccount): boolean {
    switch (account.row.tracking) {
        case AccountTracking.LedgerOnly: {
            return (
                account.row.stage !== AccountStage.Eval ||
                account.payouts.some(
                    (payout) => paidPayoutCash(payout) !== null,
                )
            );
        }
        case AccountTracking.Modeled: {
            return fundedSince(account) !== null;
        }
    }
}
