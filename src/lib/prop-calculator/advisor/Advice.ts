import { type AdviceProvenance } from './AdviceProvenance';
import { type AdviceStaleness } from './AdviceStaleness';
import { type Assumption } from './Assumption';
import { type DailyPlanCard } from './DailyPlanCard';
import { type DifferenceReasonDetail } from './DifferenceReason';
import { type DocumentedSizing } from './DocumentedSizing';
import { type EngineOptimumRequest } from './EngineOptimumRequest';
import { type EngineOptimumRunnerResult } from './EngineOptimumRunner';
import { type PayoutAdvice } from './PayoutAdvice';
import { type SizingStage } from './SizingStage';

export interface Advice {
    readonly assumptions: readonly Assumption[];
    readonly dailyPlanCard: DailyPlanCard | null;
    readonly differenceReasons: readonly DifferenceReasonDetail[];
    readonly documented: DocumentedSizing | null;
    readonly headline: string;
    readonly optima: readonly EngineOptimumRunnerResult[];
    readonly payoutAdvice: null | PayoutAdvice;
    readonly provenance: AdviceProvenance;
    readonly requests: readonly EngineOptimumRequest[];
    readonly stage: SizingStage;
    readonly staleness: AdviceStaleness;
}
