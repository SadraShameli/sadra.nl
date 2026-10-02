import { type Dollars } from '~/lib/prop-calculator/core';

import { type ReconstructedFundedOrEvalAccount } from './ReconstructedAccount';

export function fundedConsistencyCeiling(
    account: ReconstructedFundedOrEvalAccount,
): Dollars | null {
    const { fundedTracker } = account;
    if (fundedTracker === null) return null;
    const rule = account.plan.fundedConsistencyRule(
        fundedTracker.payoutsIssued,
    );
    return rule === null
        ? null
        : rule.maxDayProfitBeforeViolation(
              account.state.balance - fundedTracker.lastPayoutBalance,
          );
}
