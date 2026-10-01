import { type Dollars } from '~/lib/prop-calculator/core';

import {
    nextTradeRiskCheck,
    type NextTradeRiskCheckResult,
} from './actions/NextTradeRiskCheck';
import { type Advice } from './Advice';
import { type AdviceStaleness } from './AdviceStaleness';
import { type Assumption, AssumptionBias, inputAssumption } from './Assumption';
import { AssumptionKind } from './AssumptionKind';
import { type DailyPlanCard, dailyPlanCard } from './DailyPlanCard';
import { type DocumentedRule } from './DocumentedRule';
import { type DocumentedSizing } from './DocumentedSizing';
import { type EngineOptimumRequest } from './EngineOptimumRequest';
import { type EngineOptimumRunnerResult } from './EngineOptimumRunner';
import { payoutAdvice } from './PayoutAdvice';
import { PayoutRequestDecisionKind } from './PayoutRequestDecision';
import { type PayoutRuleContext } from './PayoutRequestRule';
import { type RiskCaps } from './RiskCaps';
import { type RulebookParameters } from './Rulebook';
import { type DayProgress, type RuleContext } from './RuleContext';
import { type SizingStage } from './SizingStage';

export abstract class SizingAdvisor<
    TContext extends RuleContext = RuleContext,
> {
    protected constructor(
        readonly stage: SizingStage,
        protected readonly rulebook: RulebookParameters,
        protected readonly rule: DocumentedRule<TContext>,
    ) {}

    private currentContext(): null | TContext {
        return this.staleness().kind === 'stale'
            ? null
            : this.buildContextOrNull();
    }

    abstract assemble(results: readonly EngineOptimumRunnerResult[]): Advice;

    abstract caps(): RiskCaps;

    checkNextTradeRisk(
        proposedRisk: Dollars,
        day: DayProgress,
        dpRisk: Dollars | null = null,
    ): NextTradeRiskCheckResult | null {
        const context = this.currentContext();
        return context === null
            ? null
            : nextTradeRiskCheck({
                  context,
                  day,
                  dpRisk,
                  isPayoutEligible: this.payoutEligibleForRiskCheck(),
                  proposedRisk,
                  rule: this.rule,
              });
    }

    dailyPlanCard(): DailyPlanCard | null {
        const context = this.currentContext();
        return context === null ? null : dailyPlanCard(this.rule, context);
    }

    documented(): DocumentedSizing | null {
        const context = this.currentContext();
        return context === null ? null : this.rule.size(context);
    }

    abstract optimumRequests(): readonly EngineOptimumRequest[];

    abstract staleness(): AdviceStaleness;

    protected abstract buildContext(): TContext;

    protected buildContextOrNull(): null | TContext {
        return this.buildContext();
    }

    protected isPayoutRequestDecision(context: null | PayoutRuleContext): boolean {
        return (
            context !== null &&
            payoutAdvice(this.rulebook, context).documented.kind ===
                PayoutRequestDecisionKind.Request
        );
    }

    protected payoutEligibleForRiskCheck(): boolean {
        return false;
    }

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
