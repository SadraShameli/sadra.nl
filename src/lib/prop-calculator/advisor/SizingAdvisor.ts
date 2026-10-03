import { dollars, type Dollars } from '~/lib/prop-calculator/core';

import { AccountSubstate } from './AccountSubstate';
import {
    nextTradeRiskCheck,
    type NextTradeRiskCheckResult,
} from './actions/NextTradeRiskCheck';
import { type Advice } from './Advice';
import { engineRunOf } from './AdviceProvenance';
import {
    type AdviceStaleness,
    AdviceStalenessKind,
    AdviceStalenessReason,
    type StaleAdviceStaleness,
} from './AdviceStaleness';
import { type Assumption, AssumptionBias, inputAssumption } from './Assumption';
import { AssumptionKind } from './AssumptionKind';
import { type DailyPlanCard, dailyPlanCard } from './DailyPlanCard';
import {
    DifferenceReason,
    type DifferenceReasonDetail,
} from './DifferenceReason';
import { type DocumentedRule } from './DocumentedRule';
import { type DocumentedSizing } from './DocumentedSizing';
import { type EngineOptimumRequest } from './EngineOptimumRequest';
import { type EngineOptimumRunnerResult } from './EngineOptimumRunner';
import { payoutAdvice } from './PayoutAdvice';
import { PayoutRequestDecisionKind } from './PayoutRequestDecision';
import { type PayoutRuleContext } from './PayoutRequestRule';
import { type SizingPlacement } from './PlaceableMinimum';
import { type RiskCaps } from './RiskCaps';
import { type RulebookParameters } from './Rulebook';
import { type DayProgress, type RuleContext } from './RuleContext';
import { type SizingStage } from './SizingStage';

export const DEFAULT_FUNDED_HORIZON_DAYS = 252;

export abstract class SizingAdvisor<
    TContext extends RuleContext = RuleContext,
> {
    protected constructor(
        readonly stage: SizingStage,
        protected readonly rulebook: RulebookParameters,
        protected readonly rule: DocumentedRule<TContext>,
        protected readonly substate: AccountSubstate.Suspended | null,
    ) {}

    private currentContext(): null | TContext {
        return this.isSuspended() ||
            this.staleness().kind === AdviceStalenessKind.Stale
            ? null
            : this.buildContextOrNull();
    }

    private staleAdvice(
        advice: Advice,
        staleness: StaleAdviceStaleness,
    ): Advice {
        const staleReason: DifferenceReasonDetail = {
            kind: DifferenceReason.StaleAdvice,
            snapshotDate: staleness.snapshotAsOf,
        };
        const rulesReason: readonly DifferenceReasonDetail[] =
            staleness.reasons.includes(AdviceStalenessReason.PlanRulesChanged)
                ? [{ kind: DifferenceReason.PlanRulesChanged }]
                : [];
        return {
            ...advice,
            dailyPlanCard: null,
            differenceReasons: [staleReason, ...rulesReason],
            documented: null,
            optima: [],
            payoutAdvice: null,
            requests: [],
        };
    }

    private suspendedAdvice(advice: Advice): Advice {
        const reason: DifferenceReasonDetail = {
            kind: DifferenceReason.Suspended,
        };
        return {
            ...advice,
            dailyPlanCard: null,
            differenceReasons: [reason],
            documented: null,
            optima: [],
            payoutAdvice: null,
            requests: [],
        };
    }

    assemble(results: readonly EngineOptimumRunnerResult[]): Advice {
        const advice = this.assembleAdvice(results);
        const { staleness } = advice;
        const final = this.isSuspended()
            ? this.suspendedAdvice(advice)
            : staleness.kind === AdviceStalenessKind.Stale
              ? this.staleAdvice(advice, staleness)
              : advice;
        return {
            ...final,
            provenance: {
                ...final.provenance,
                ...engineRunOf(final.requests),
            },
        };
    }

    caps(): RiskCaps {
        const caps = this.sizedCaps();
        return this.isSuspended() ? { ...caps, affordable: dollars(0) } : caps;
    }

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
                  placement: this.enteredPlacement(),
                  proposedRisk,
                  rule: this.rule,
              });
    }

    dailyPlanCard(): DailyPlanCard | null {
        const context = this.currentContext();
        return context === null
            ? null
            : dailyPlanCard(this.rule, context, this.enteredPlacement());
    }

    documented(): DocumentedSizing | null {
        const context = this.currentContext();
        return context === null ? null : this.rule.size(context);
    }

    isSuspended(): boolean {
        return this.substate === AccountSubstate.Suspended;
    }

    optimumRequests(): readonly EngineOptimumRequest[] {
        return this.isSuspended() ? [] : this.engineRequests();
    }

    abstract staleness(): AdviceStaleness;

    protected abstract assembleAdvice(
        results: readonly EngineOptimumRunnerResult[],
    ): Advice;

    protected abstract buildContext(): TContext;

    protected buildContextOrNull(): null | TContext {
        return this.buildContext();
    }

    protected abstract engineRequests(): readonly EngineOptimumRequest[];

    protected enteredPlacement(): null | SizingPlacement {
        return null;
    }

    protected isPayoutRequestDecision(
        context: null | PayoutRuleContext,
    ): boolean {
        return (
            context !== null &&
            payoutAdvice(this.rulebook, context).documented.kind ===
                PayoutRequestDecisionKind.Request
        );
    }

    protected payoutEligibleForRiskCheck(): boolean {
        return false;
    }

    protected abstract sizedCaps(): RiskCaps;

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
