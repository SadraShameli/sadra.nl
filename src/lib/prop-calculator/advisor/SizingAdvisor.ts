import { type Advice } from './Advice';
import { type AdviceStaleness } from './AdviceStaleness';
import { type Assumption, AssumptionBias, inputAssumption } from './Assumption';
import { AssumptionKind } from './AssumptionKind';
import { type DailyPlanCard, dailyPlanCard } from './DailyPlanCard';
import { type DocumentedRule } from './DocumentedRule';
import { type DocumentedSizing } from './DocumentedSizing';
import { type EngineOptimumRequest } from './EngineOptimumRequest';
import { type EngineOptimumRunnerResult } from './EngineOptimumRunner';
import { type RiskCaps } from './RiskCaps';
import { type RulebookParameters } from './Rulebook';
import { type RuleContext } from './RuleContext';
import { type SizingStage } from './SizingStage';

export abstract class SizingAdvisor<
    TContext extends RuleContext = RuleContext,
> {
    protected constructor(
        readonly stage: SizingStage,
        protected readonly rulebook: RulebookParameters,
        protected readonly rule: DocumentedRule<TContext>,
    ) {}

    abstract assemble(results: readonly EngineOptimumRunnerResult[]): Advice;

    abstract caps(): RiskCaps;

    dailyPlanCard(): DailyPlanCard | null {
        return this.staleness().kind === 'stale'
            ? null
            : dailyPlanCard(this.rule, this.buildContext());
    }

    documented(): DocumentedSizing | null {
        return this.staleness().kind === 'stale'
            ? null
            : this.rule.size(this.buildContext());
    }

    abstract optimumRequests(): readonly EngineOptimumRequest[];

    abstract staleness(): AdviceStaleness;

    protected abstract buildContext(): TContext;

    protected withLiveTriggersNotChecked(
        base: readonly Assumption[],
    ): readonly Assumption[] {
        return [
            ...base,
            inputAssumption(
                AssumptionKind.LiveTriggersNotChecked,
                AssumptionBias.Optimistic,
            ),
        ];
    }
}
