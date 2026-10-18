import {
    CENTS_PER_DOLLAR,
    DayStopRuleKind,
    floorToWholeCents,
    isAtOrBelowWithinCentTolerance,
    ONE_CENT,
} from '~/lib/prop-calculator/core';

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
    type DocumentedRung,
    type DocumentedSizing,
    type PlannedRisk,
    SizingConstraint,
    SizingProvenance,
    type SizingTerms,
} from './DocumentedSizing';
import { NO_PERSONAL_CAPS } from './PersonalCaps';
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
    tighterOf,
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

    private ladderWithin(
        context: EvalRuleContext,
        documented: DocumentedSizing | null,
    ): DocumentedSizing {
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
        const { maxRiskPerTrade, maxTradesPerDay } = context.personalCaps;
        const slots =
            maxTradesPerDay === null
                ? terms.maxTrades
                : Math.min(terms.maxTrades, maxTradesPerDay);
        const ceiling = tighterOf(
            terms.profitCeiling,
            context.personalCaps.dailyProfitCap,
            SizingConstraint.PersonalCap,
        );
        const stepCents = this.rulebook.eval.roundingStepCents;
        const step = stepCents / CENTS_PER_DOLLAR;
        for (let index = 0; index < slots; index++) {
            const room = budget.amount - sequence.runningLoss;
            if (room < ONE_CENT) break;
            const cappedBy: SizingConstraint[] = [...budgetCaps];
            const isFinal = index === terms.maxTrades - 1;
            let risk: number;
            let natural: DocumentedRung | undefined;
            if (documented === null) {
                risk = isFinal
                    ? room
                    : roundRung(
                          this.rungTarget(
                              index,
                              budget.amount,
                              sequence.lastRisk,
                          ),
                          stepCents,
                      );
                if (!isAtOrBelowWithinCentTolerance(risk, room)) {
                    cappedBy.push(budget.constraint);
                    risk = room;
                }
            } else {
                natural = documented.rungs[index];
                if (natural === undefined) break;
                risk = natural.risk;
            }
            if (
                maxRiskPerTrade !== null &&
                !isAtOrBelowWithinCentTolerance(risk, maxRiskPerTrade)
            ) {
                cappedBy.push(SizingConstraint.PersonalCap);
                risk = maxRiskPerTrade;
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
            if (
                natural !== undefined &&
                isAtOrBelowWithinCentTolerance(natural.risk, risk)
            ) {
                cappedBy.push(...natural.cappedBy);
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
        const { dailyProfitCap, maxRiskPerTrade, maxTradesPerDay } =
            context.personalCaps;
        if (
            dailyProfitCap === null &&
            maxRiskPerTrade === null &&
            maxTradesPerDay === null
        ) {
            return this.ladderWithin(context, null);
        }
        const documented = this.ladderWithin(
            { ...context, personalCaps: NO_PERSONAL_CAPS },
            null,
        );
        return this.ladderWithin(context, documented);
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
