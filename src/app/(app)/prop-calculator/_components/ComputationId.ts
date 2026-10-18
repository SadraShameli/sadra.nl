import type { AdvisorWorkerResult } from '~/app/(app)/prop-calculator/_workers/advisorWorkerMessages';
import type { FundedSweepResult } from '~/app/(app)/prop-calculator/_workers/fundedSweepWorkerMessages';
import type { OverviewWorkerResult } from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import type {
    PayoutOutlookResult,
    PayoutSweepResult,
} from '~/app/(app)/prop-calculator/_workers/payoutSweepWorkerMessages';
import type { LiveOutputs, SimOutputs } from '~/lib/prop-calculator';
import type { PortfolioTimelineResult } from '~/lib/prop-calculator/portfolioTimeline';

import type { Row as FirmComparisonRow } from './FirmComparisonTable';
import type { Row as OptimalRiskRow } from './OptimalRiskTable';
import type { Row as PlanComparisonRow } from './PlanComparisonTable';
import type { SimmedEntry } from './PortfolioPanel';
import type { ScenarioRow } from './RuleStressTestPanel';
import type { Cell } from './SensitivityHeatmap';
import type { LabResult } from './useLabSimulation';

export enum ComputationId {
    Advice = 'advice',
    BaseSimulation = 'base-simulation',
    CashFlow = 'cash-flow',
    FirmComparison = 'firm-comparison',
    FundedOptimizer = 'funded-optimizer',
    Live = 'live',
    OptimalRisk = 'optimal-risk',
    Overview = 'overview',
    PayoutOutlook = 'payout-outlook',
    PayoutSweep = 'payout-sweep',
    PlanComparison = 'plan-comparison',
    Planner = 'planner',
    RuleStress = 'rule-stress',
    Sensitivity = 'sensitivity',
    StrategyLab = 'strategy-lab',
}

export interface ComputationResultMap {
    [ComputationId.Advice]: AdvisorWorkerResult;
    [ComputationId.BaseSimulation]: SimOutputs;
    [ComputationId.CashFlow]: null | PortfolioTimelineResult;
    [ComputationId.FirmComparison]: FirmComparisonRow[];
    [ComputationId.FundedOptimizer]: FundedSweepResult;
    [ComputationId.Live]: LiveOutputs | null;
    [ComputationId.OptimalRisk]: OptimalRiskRow[];
    [ComputationId.Overview]: OverviewWorkerResult;
    [ComputationId.PayoutOutlook]: PayoutOutlookResult;
    [ComputationId.PayoutSweep]: PayoutSweepResult;
    [ComputationId.PlanComparison]: PlanComparisonRow[];
    [ComputationId.Planner]: SimmedEntry[];
    [ComputationId.RuleStress]: ScenarioRow[];
    [ComputationId.Sensitivity]: Cell[];
    [ComputationId.StrategyLab]: Map<string, LabResult>;
}
