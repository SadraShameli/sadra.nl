import {
    type AccountState,
    type ComputeRisk,
    type FundedCycleSnapshot,
} from '~/lib/prop-calculator';

export function withFreshFundedCycle(risk: ComputeRisk): ComputeRisk {
    return (state, tradeIndexToday, fundedCycle) =>
        risk(state, tradeIndexToday, fundedCycle ?? freshFundedCycleAt(state));
}

function freshFundedCycleAt(state: AccountState): FundedCycleSnapshot {
    return {
        cycleBestDayProfit: 0,
        dayGateProgress: 0,
        fundedResetsUsed: 0,
        lastPayoutBalance: state.balance,
        payoutsIssued: 0,
    };
}
