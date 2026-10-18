import {
    type Dollars,
    type FundedCycleSnapshot,
    type Plan,
} from '~/lib/prop-calculator/core';

import { ConsistencyCeilingNote } from './DocumentedSizing';
import { type ReconstructedFundedOrEvalAccount } from './ReconstructedAccount';

type FundedConsistencyCycle = Pick<
    FundedCycleSnapshot,
    'cycleBestDayProfit' | 'lastPayoutBalance' | 'payoutsIssued'
>;

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
    return fundedConsistencyStatusOf(account).ceiling;
}

export function fundedConsistencyNote(
    account: ReconstructedFundedOrEvalAccount,
): ConsistencyCeilingNote | null {
    return fundedConsistencyStatusOf(account).note;
}

export function fundedConsistencyStatusAt(
    plan: Plan,
    balance: number,
    cycle: FundedConsistencyCycle | null,
): FundedConsistencyStatus {
    if (cycle === null) return NO_CONSISTENCY_LIMIT;
    const rule = plan.fundedConsistencyRule(cycle.payoutsIssued);
    if (rule === null) return NO_CONSISTENCY_LIMIT;
    const cycleProfit = balance - cycle.lastPayoutBalance;
    const ceiling = rule.maxDayProfitBeforeViolation(cycleProfit);
    if (!Number.isFinite(ceiling)) return NO_CONSISTENCY_LIMIT;
    if (cycleProfit <= 0) {
        return { ceiling: null, note: ConsistencyCeilingNote.FreshCycle };
    }
    return cycle.cycleBestDayProfit > ceiling
        ? { ceiling: null, note: ConsistencyCeilingNote.AlreadyPushedOut }
        : { ceiling, note: null };
}

function fundedConsistencyStatusOf(
    account: ReconstructedFundedOrEvalAccount,
): FundedConsistencyStatus {
    return fundedConsistencyStatusAt(
        account.plan,
        account.state.balance,
        account.fundedTracker,
    );
}
