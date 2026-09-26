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
    BaseSimulation = 'base-simulation',
    CashFlow = 'cash-flow',
    FirmComparison = 'firm-comparison',
    Live = 'live',
    OptimalRisk = 'optimal-risk',
    PlanComparison = 'plan-comparison',
    Planner = 'planner',
    RuleStress = 'rule-stress',
    Sensitivity = 'sensitivity',
    StrategyLab = 'strategy-lab',
}

export interface ComputationResultMap {
    [ComputationId.BaseSimulation]: SimOutputs;
    [ComputationId.CashFlow]: null | PortfolioTimelineResult;
    [ComputationId.FirmComparison]: FirmComparisonRow[];
    [ComputationId.Live]: LiveOutputs | null;
    [ComputationId.OptimalRisk]: OptimalRiskRow[];
    [ComputationId.PlanComparison]: PlanComparisonRow[];
    [ComputationId.Planner]: SimmedEntry[];
    [ComputationId.RuleStress]: ScenarioRow[];
    [ComputationId.Sensitivity]: Cell[];
    [ComputationId.StrategyLab]: Map<string, LabResult>;
}
