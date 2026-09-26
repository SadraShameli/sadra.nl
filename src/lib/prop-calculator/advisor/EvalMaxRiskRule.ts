import {
    DayStopRuleKind,
    type Dollars,
    dollars,
    floorToWholeCents,
    ONE_CENT,
} from '../core';
import {
    assertEvalMode,
    FlatRiskRule,
    SHARED_ASSUMPTIONS,
} from './DocumentedRule';
import {
    type CappedAmount,
    DailyProfitCapKind,
    type PlannedRisk,
    SizingConstraint,
    SizingProvenance,
    type SizingTerms,
} from './DocumentedSizing';
import {
    EvalSizingMode,
    hardRule4Violation,
    type RulebookParameters,
} from './Rulebook';
import {
    type EvalRuleContext,
    evalRuleContextSchema,
    lossBudget,
    profitCeiling,
    tighterOf,
} from './RuleContext';
import { RuleSource } from './RuleSource';

export class EvalMaxRiskRule extends FlatRiskRule<EvalRuleContext> {
    constructor(rulebook: RulebookParameters) {
        super(rulebook, evalRuleContextSchema);
        assertEvalMode(rulebook, EvalSizingMode.MaxRisk, 'EvalMaxRiskRule');
        const overshoot = hardRule4Violation(rulebook);
        if (overshoot !== null) throw new Error(overshoot);
    }

    private dailyCeiling(context: EvalRuleContext): Dollars | null {
        if (context.cushion <= 0) return null;
        const firstRisk = floorToWholeCents(this.maxRisk(context).amount);
        const multiple = this.rulebook.eval.maxRiskDailyCapMultiple;
        return firstRisk < ONE_CENT
            ? null
            : dollars(floorToWholeCents(multiple * firstRisk));
    }

    private maxRisk(context: EvalRuleContext): CappedAmount {
        const { eval: evalParameters, strategy } = this.rulebook;
        const candidates: CappedAmount[] = [
            lossBudget(context),
            {
                amount: dollars(context.remainingProfitToTarget / strategy.rr),
                constraint: SizingConstraint.RemainingTargetCap,
            },
        ];
        if (context.consistencyDailyCap !== null) {
            candidates.push({
                amount: dollars(
                    context.consistencyDailyCap /
                        evalParameters.maxRiskDailyCapMultiple,
                ),
                constraint: SizingConstraint.ConsistencyCap,
            });
        }
        return candidates.reduce((tightest, candidate) =>
            candidate.amount < tightest.amount ? candidate : tightest,
        );
    }

    protected flatRisk(context: EvalRuleContext): PlannedRisk {
        const risk = this.maxRisk(context);
        return {
            amount: dollars(Math.max(0, risk.amount)),
            cappedBy: [risk.constraint],
        };
    }

    protected terms(context: EvalRuleContext): SizingTerms {
        const ceiling = this.dailyCeiling(context);
        return {
            assumptions: SHARED_ASSUMPTIONS,
            dailyProfitCap:
                ceiling === null
                    ? null
                    : { ceiling, kind: DailyProfitCapKind.HardCeiling },
            maxTrades: this.rulebook.strategy.tradesPerDayMax,
            profitCeiling: tighterOf(
                profitCeiling(context),
                ceiling,
                SizingConstraint.DailyProfitCap,
            ),
            provenance: SizingProvenance.MaxRisk,
            rewardMultiple: this.rulebook.strategy.rr,
            sources: [
                RuleSource.HardRule3,
                RuleSource.HardRule4,
                RuleSource.HisNumbers,
            ],
            stopRule:
                ceiling === null
                    ? { kind: DayStopRuleKind.None }
                    : {
                          dollars: ceiling,
                          kind: DayStopRuleKind.AfterTarget,
                      },
        };
    }
}
