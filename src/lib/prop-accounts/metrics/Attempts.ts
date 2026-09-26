import { evalAttemptTally, fundedSince, type LedgerAccount } from './PortfolioLedger';

export function attemptsOf(account: LedgerAccount): number {
    if (account.plan?.plan.isInstantFunded === true) {
        return fundedSince(account) === null ? 0 : 1;
    }
    const tally = evalAttemptTally(account);
    return tally.passes + tally.fails;
}
