import { type Dollars } from '~/lib/prop-calculator/core';

import { ConsistencyCeilingNote } from './DocumentedSizing';
import { type ReconstructedFundedOrEvalAccount } from './ReconstructedAccount';

interface FundedConsistencyStatus {
    readonly ceiling: Dollars | null;
    readonly note: ConsistencyCeilingNote | null;
}

const NO_CONSISTENCY_LIMIT: FundedConsistencyStatus = {
    ceiling: null,
    note: null,
};

export function fundedConsistencyCeiling(
    account: ReconstructedFundedOrEvalAccount,
): Dollars | null {
    return fundedConsistencyStatus(account).ceiling;
}

export function fundedConsistencyNote(
    account: ReconstructedFundedOrEvalAccount,
): ConsistencyCeilingNote | null {
    return fundedConsistencyStatus(account).note;
}

function fundedConsistencyStatus(
    account: ReconstructedFundedOrEvalAccount,
): FundedConsistencyStatus {
    const { fundedTracker } = account;
    if (fundedTracker === null) return NO_CONSISTENCY_LIMIT;
    const rule = account.plan.fundedConsistencyRule(
        fundedTracker.payoutsIssued,
    );
    if (rule === null) return NO_CONSISTENCY_LIMIT;
    const cycleProfit = account.state.balance - fundedTracker.lastPayoutBalance;
    const ceiling = rule.maxDayProfitBeforeViolation(cycleProfit);
    if (!Number.isFinite(ceiling)) return NO_CONSISTENCY_LIMIT;
    if (cycleProfit <= 0) {
        return { ceiling: null, note: ConsistencyCeilingNote.FreshCycle };
    }
    return fundedTracker.cycleBestDayProfit > ceiling
        ? { ceiling: null, note: ConsistencyCeilingNote.AlreadyPushedOut }
        : { ceiling, note: null };
}
