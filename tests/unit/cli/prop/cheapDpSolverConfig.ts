import { type AverageRewardConfig } from '~/lib/prop-calculator/core/AverageRewardSolver';
import { RenewalCycleObjective } from '~/lib/prop-calculator/core/RenewalCycleObjective';

import { withoutPayoutStructure } from '../../lib/prop-calculator/withoutPayoutStructure';

export function cheapDpSolverConfig(
    config: AverageRewardConfig,
): AverageRewardConfig {
    const { objective } = config;
    return {
        ...config,
        objective: new RenewalCycleObjective({
            copyAccounts: objective.copyAccounts,
            discounts: objective.discounts,
            fundedHorizonDays: objective.fundedHorizonDays,
            maxEvalDays: objective.maxEvalDays,
            plan: withoutPayoutStructure(objective.plan),
            rebuyLagDays: objective.rebuyLagDays,
        }),
    };
}
