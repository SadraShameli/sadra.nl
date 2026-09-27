import {
    CENTS_PER_DOLLAR,
    DayStopRuleKind,
    floorToWholeCents,
    isAtOrBelowWithinCentTolerance,
    ONE_CENT,
} from '../core';
import {
    assertEvalMode,
    DocumentedRule,
    documentedRung,
    RungSequence,
    SHARED_ASSUMPTIONS,
} from './DocumentedRule';
import {
    type DailyProfitCap,
    DailyProfitCapKind,
    type DocumentedSizing,
    type PlannedRisk,
    SizingConstraint,
    SizingProvenance,
    type SizingTerms,
} from './DocumentedSizing';
import {
    EvalSizingMode,
    LadderFractionSource,
    type RulebookParameters,
} from './Rulebook';
import {
    type DayProgress,
    type EvalRuleContext,
    evalRuleContextSchema,
    lossBudget,
    profitCeiling,
} from './RuleContext';
import { RuleSource } from './RuleSource';

export class EvalLadderRule extends DocumentedRule<EvalRuleContext> {
    readonly fractionSource: LadderFractionSource;

    constructor(rulebook: RulebookParameters) {
        super(rulebook, evalRuleContextSchema);
        assertEvalMode(rulebook, EvalSizingMode.Ladder, 'EvalLadderRule');
        this.fractionSource = rulebook.eval.ladderFractionSource;
    }

    private rungTarget(
        index: number,
        budget: number,
        previousRisk: number,
    ): number {
        switch (this.fractionSource) {
            case LadderFractionSource.GeneralDerivation: {
                const { escalation, firstRungFraction } =
                    this.rulebook.eval.generalDerivation;
                return index === 0
                    ? firstRungFraction * budget
                    : escalation * previousRisk;
            }
            case LadderFractionSource.MffRapidEodSearch: {
                const fraction = this.rulebook.eval.mffSearchFractions[index];
                if (fraction === undefined) {
                    throw new Error(
                        `MFF search ladder has no fraction for rung ${index + 1}`,
                    );
                }
                return fraction * budget;
            }
        }
    }

    private slotCount(): number {
        const { eval: evalParameters, strategy } = this.rulebook;
        switch (this.fractionSource) {
            case LadderFractionSource.GeneralDerivation: {
                return strategy.tradesPerDayMax;
            }
            case LadderFractionSource.MffRapidEodSearch: {
                return Math.min(
                    evalParameters.mffSearchFractions.length,
                    strategy.tradesPerDayMax,
                );
            }
        }
    }

    private terms(context: EvalRuleContext): SizingTerms {
        const dailyProfitCap: DailyProfitCap | null =
            context.consistencyDailyCap === null
                ? null
                : {
                      ceiling: context.consistencyDailyCap,
                      kind: DailyProfitCapKind.HardCeiling,
                  };
        const shared = {
            assumptions: SHARED_ASSUMPTIONS,
            dailyProfitCap,
            maxTrades: this.slotCount(),
            profitCeiling: profitCeiling(context),
            rewardMultiple: this.rulebook.strategy.rr,
            stopRule: { kind: DayStopRuleKind.DayGreen },
        } as const;
        switch (this.fractionSource) {
            case LadderFractionSource.GeneralDerivation: {
                return {
                    ...shared,
                    provenance: SizingProvenance.GeneralDerivation,
                    sources: [
                        RuleSource.GeneralDerivation,
                        RuleSource.HisNumbers,
                    ],
                };
            }
            case LadderFractionSource.MffRapidEodSearch: {
                return {
                    ...shared,
                    provenance: SizingProvenance.MffRapidEodSearch,
                    sources: [RuleSource.EvalLadder, RuleSource.HisNumbers],
                };
            }
        }
    }

    protected plannedRisk(
        _context: EvalRuleContext,
        day: DayProgress,
        sizing: DocumentedSizing,
    ): null | PlannedRisk {
        const rung = sizing.rungs[day.wins + day.losses];
        return rung === undefined
            ? null
            : { amount: rung.risk, cappedBy: rung.cappedBy };
    }

    protected sizeWithin(context: EvalRuleContext): DocumentedSizing {
        const terms = this.terms(context);
        const sequence = new RungSequence();
        if (context.cushion <= 0) {
            sequence.note(SizingConstraint.NoCushion);
            return sequence.toSizing(context, terms);
        }
        const budget = lossBudget(context);
        const budgetCaps: readonly SizingConstraint[] =
            budget.constraint === SizingConstraint.CushionCap
                ? []
                : [budget.constraint];
        for (const constraint of budgetCaps) sequence.note(constraint);
        const ceiling = terms.profitCeiling;
        const stepCents = this.rulebook.eval.roundingStepCents;
        const step = stepCents / CENTS_PER_DOLLAR;
        for (let index = 0; index < terms.maxTrades; index++) {
            const room = budget.amount - sequence.runningLoss;
            if (room < ONE_CENT) break;
            const cappedBy: SizingConstraint[] = [...budgetCaps];
            const isFinal = index === terms.maxTrades - 1;
            let risk = isFinal
                ? room
                : roundRung(
                      this.rungTarget(index, budget.amount, sequence.lastRisk),
                      stepCents,
                  );
            if (!isAtOrBelowWithinCentTolerance(risk, room)) {
                cappedBy.push(budget.constraint);
                risk = room;
            }
            if (ceiling !== null) {
                const ceilingRoom =
                    (ceiling.amount + sequence.runningLoss) /
                    terms.rewardMultiple;
                if (!isAtOrBelowWithinCentTolerance(risk, ceilingRoom)) {
                    cappedBy.push(ceiling.constraint);
                    const capped = Math.max(0, ceilingRoom);
                    risk =
                        !isFinal && isAtOrBelowWithinCentTolerance(step, capped)
                            ? floorToStep(capped, stepCents)
                            : capped;
                }
            }
            const placed = floorToWholeCents(risk);
            if (placed < ONE_CENT) {
                for (const constraint of cappedBy) sequence.note(constraint);
                break;
            }
            sequence.add(
                documentedRung(
                    placed,
                    sequence.runningLoss,
                    terms.rewardMultiple,
                    cappedBy,
                ),
            );
        }
        return sequence.toSizing(context, terms);
    }
}

function floorToStep(amount: number, stepCents: number): number {
    const wholeCents = Math.round(floorToWholeCents(amount) * CENTS_PER_DOLLAR);
    return (Math.floor(wholeCents / stepCents) * stepCents) / CENTS_PER_DOLLAR;
}

function roundRung(target: number, stepCents: number): number {
    return Math.max(
        stepCents / CENTS_PER_DOLLAR,
        floorToStep(target, stepCents),
    );
}
