import { type z } from 'zod';

import {
    capRiskToRemainingDailyLoss,
    type Dollars,
    dollars,
    floorToWholeCents,
    INSTRUMENTS,
    isAtOrBelowWithinCentTolerance,
    minStopPoints,
    ONE_CENT,
    points,
    type Points,
    shouldStopDay,
} from '../core';
import {
    DayStopReason,
    type DocumentedRung,
    type DocumentedSizing,
    type NextTrade,
    NextTradeKind,
    NO_COMMISSION,
    type PlannedRisk,
    SizingAssumption,
    SizingConstraint,
    type SizingTerms,
} from './DocumentedSizing';
import { type EvalSizingMode, type RulebookParameters } from './Rulebook';
import {
    dailyLossRoom,
    type DayProgress,
    dayProgressSchema,
    type RuleContext,
} from './RuleContext';
import { assertSizingInvariant, assertTradeInvariant } from './SizingInvariant';

export const SHARED_ASSUMPTIONS: readonly SizingAssumption[] = [
    SizingAssumption.NoCommission,
    SizingAssumption.RungsAssumeEarlierLosses,
    SizingAssumption.WinsAddNoLossRoom,
];

export abstract class DocumentedRule<
    TContext extends RuleContext = RuleContext,
> {
    protected constructor(
        readonly rulebook: RulebookParameters,
        private readonly contextSchema: z.ZodType<TContext>,
    ) {}

    nextTrade(context: TContext, day: DayProgress): NextTrade {
        const parsed = this.contextSchema.parse(context);
        const progress = dayProgressSchema.parse(day);
        const sizing = this.size(parsed);
        const trade = this.tradeAfter(parsed, progress, sizing);
        assertTradeInvariant(trade, sizing, parsed, progress);
        return trade;
    }

    size(context: TContext): DocumentedSizing {
        const parsed = this.contextSchema.parse(context);
        const sizing = this.sizeWithin(parsed);
        assertSizingInvariant(sizing, parsed);
        return sizing;
    }

    protected tradeAfter(
        context: TContext,
        day: DayProgress,
        sizing: DocumentedSizing,
    ): NextTrade {
        return resolveNextTrade(
            context,
            sizing,
            day,
            this.plannedRisk(context, day, sizing),
        );
    }

    protected abstract plannedRisk(
        context: TContext,
        day: DayProgress,
        sizing: DocumentedSizing,
    ): null | PlannedRisk;

    protected abstract sizeWithin(context: TContext): DocumentedSizing;
}

export abstract class FlatRiskRule<
    TContext extends RuleContext,
> extends DocumentedRule<TContext> {
    private walkAllLosses(
        context: TContext,
        terms: SizingTerms,
        sequence: RungSequence,
    ): NextTrade {
        const day = sequence.allLossDay();
        return resolveNextTrade(
            context,
            terms,
            day,
            this.flatRisk(context, day.runningLoss),
        );
    }

    protected plannedRisk(context: TContext, day: DayProgress): PlannedRisk {
        return this.flatRisk(context, day.runningLoss);
    }

    protected sizeWithin(context: TContext): DocumentedSizing {
        const terms = this.terms(context);
        const sequence = new RungSequence();
        if (context.cushion <= 0) {
            sequence.note(SizingConstraint.NoCushion);
            return sequence.toSizing(context, terms);
        }
        let trade = this.walkAllLosses(context, terms, sequence);
        while (trade.kind === NextTradeKind.Trade) {
            sequence.add(trade.rung);
            trade = this.walkAllLosses(context, terms, sequence);
        }
        for (const constraint of trade.cappedBy) sequence.note(constraint);
        return sequence.toSizing(context, terms);
    }

    protected abstract flatRisk(
        context: TContext,
        runningLoss: Dollars,
    ): PlannedRisk;

    protected abstract terms(context: TContext): SizingTerms;
}

export class RungSequence {
    private readonly constraints = new Set<SizingConstraint>();

    private readonly rungs: DocumentedRung[] = [];

    runningLoss = dollars(0);

    private minStopPointsAtCap(context: RuleContext): null | Points {
        if (
            this.rungs.length === 0 ||
            context.contractLimit === null ||
            context.instrument === null
        ) {
            return null;
        }
        const largestRisk = Math.max(...this.rungs.map((rung) => rung.risk));
        const stop = minStopPoints(
            largestRisk,
            context.contractLimit,
            INSTRUMENTS[context.instrument].pointValue,
        );
        return stop === null ? null : points(stop);
    }

    get lastRisk(): number {
        return this.rungs.at(-1)?.risk ?? 0;
    }

    add(rung: DocumentedRung): void {
        this.rungs.push(rung);
        for (const constraint of rung.cappedBy) this.note(constraint);
        this.runningLoss = rung.runningLossAfter;
    }

    allLossDay(): DayProgress {
        const runningLoss: number = this.runningLoss;
        return {
            dayPnL: dollars(-runningLoss),
            losses: this.rungs.length,
            runningLoss: this.runningLoss,
            wins: 0,
        };
    }

    note(constraint: SizingConstraint): void {
        this.constraints.add(constraint);
    }

    toSizing(context: RuleContext, terms: SizingTerms): DocumentedSizing {
        return {
            ...terms,
            constraints: [...this.constraints],
            minStopPointsAtCap: this.minStopPointsAtCap(context),
            rungs: [...this.rungs],
        };
    }
}

export function assertEvalMode(
    rulebook: RulebookParameters,
    mode: EvalSizingMode,
    ruleName: string,
): void {
    if (rulebook.eval.mode !== mode) {
        throw new Error(
            `${ruleName} sizes the ${mode} eval mode, but this rulebook selects ${rulebook.eval.mode}; build the rule with createDocumentedRule`,
        );
    }
}

export function documentedRung(
    risk: number,
    runningLossBefore: number,
    rewardMultiple: number,
    cappedBy: readonly SizingConstraint[],
): DocumentedRung {
    return {
        cappedBy: [...new Set(cappedBy)],
        risk: dollars(risk),
        runningLossAfter: dollars(floorToWholeCents(runningLossBefore + risk)),
        runningLossBefore: dollars(runningLossBefore),
        takeProfit: dollars(floorToWholeCents(risk * rewardMultiple)),
    };
}

export function resolveNextTrade(
    context: RuleContext,
    terms: SizingTerms,
    day: DayProgress,
    planned: null | PlannedRisk,
): NextTrade {
    if (day.wins + day.losses >= terms.maxTrades) {
        return stopFor(DayStopReason.MaxTrades, []);
    }
    if (shouldStopDay(terms.stopRule, day.wins > 0, day.losses, day.dayPnL)) {
        return stopFor(DayStopReason.StopRule, []);
    }
    const ceiling = terms.profitCeiling;
    const ceilingRoom =
        ceiling === null
            ? Infinity
            : (ceiling.amount - day.dayPnL) / terms.rewardMultiple;
    if (ceiling !== null && ceilingRoom < ONE_CENT) {
        return stopFor(DayStopReason.CeilingReached, [ceiling.constraint]);
    }
    const runningLoss: number = day.runningLoss;
    const cappedBy = new Set(planned?.cappedBy);
    let risk: number = planned?.amount ?? Infinity;
    const capAt = (limit: number, constraint: SizingConstraint): void => {
        if (isAtOrBelowWithinCentTolerance(risk, limit)) return;
        cappedBy.add(constraint);
        risk = Math.max(0, limit);
    };
    capAt(context.cushion - runningLoss, SizingConstraint.CushionCap);
    const room = dailyLossRoom(context);
    if (room !== null) {
        capAt(
            capRiskToRemainingDailyLoss(
                risk,
                room.amount,
                -runningLoss,
                NO_COMMISSION,
            ),
            room.constraint,
        );
    }
    if (ceiling !== null) capAt(ceilingRoom, ceiling.constraint);
    const placed = floorToWholeCents(risk);
    if (placed < ONE_CENT) {
        return stopFor(DayStopReason.NoLossRoom, [...cappedBy]);
    }
    if (planned === null) return stopFor(DayStopReason.LadderExhausted, []);
    return {
        kind: NextTradeKind.Trade,
        rung: documentedRung(placed, day.runningLoss, terms.rewardMultiple, [
            ...cappedBy,
        ]),
    };
}

function stopFor(
    reason: DayStopReason,
    cappedBy: readonly SizingConstraint[],
): NextTrade {
    return { cappedBy, kind: NextTradeKind.Stop, reason };
}
