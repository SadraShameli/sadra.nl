import {
    type Dollars,
    dollars,
    oneContractRisk,
    resolvePositionSizing,
    type SingleDayProfitTrigger,
} from '~/lib/prop-calculator/core';

import { isConfirmedTrigger } from './ConfirmedTrigger';
import { type DocumentedRule } from './DocumentedRule';
import {
    type CappedAmount,
    type ConsistencyCeilingNote,
    type DayStopReason,
    type DocumentedRung,
    NextTradeKind,
    SizingConstraint,
} from './DocumentedSizing';
import {
    isPlacementChecked,
    RungPlacement,
    rungPlacementOf,
    type SizingPlacement,
} from './PlaceableMinimum';
import {
    dailyLossRoom,
    type DayProgress,
    lossBudget,
    profitCeiling,
    type RuleContext,
    tighterOf,
} from './RuleContext';
import { SizingStage } from './SizingStage';

export const BELOW_ONE_CONTRACT_TEXT =
    'cannot be placed: it is below one contract at the entered stop';

export const LIVE_TRIGGER_CEILING_MARGIN_DOLLARS = 50;

export interface DailyPlanCard {
    readonly consistencyNote: ConsistencyCeilingNote | null;
    readonly cushion: Dollars;
    readonly dailyLossCap: CappedAmount;
    readonly dailyLossRoom: Dollars | null;
    readonly dailyProfitCeiling: CappedAmount | null;
    readonly maxTradesPerWindow: number;
    readonly oneContractRisk: Dollars | null;
    readonly profitCeiling: CappedAmount | null;
    readonly rungPlacements: readonly RungPlacement[];
    readonly rungs: readonly DocumentedRung[];
    readonly stopCappedBy: readonly SizingConstraint[];
    readonly stopReason: DayStopReason;
    readonly valueAfterLoss: null | number;
    readonly valueAfterWin: null | number;
    readonly valueNow: null | number;
}

const ZERO_DAY: DayProgress = {
    dayPnL: dollars(0),
    losses: 0,
    runningLoss: dollars(0),
    wins: 0,
};

export function combinedProfitCeiling(
    existing: Dollars | null,
    liveTrigger: Dollars | null,
): Dollars | null {
    if (existing === null) return liveTrigger;
    return liveTrigger === null
        ? existing
        : dollars(Math.min(existing, liveTrigger));
}

export function dailyPlanCard<TContext extends RuleContext>(
    rule: DocumentedRule<TContext>,
    context: TContext,
    placement: null | SizingPlacement = null,
): DailyPlanCard {
    const rungs: DocumentedRung[] = [];
    let day = ZERO_DAY;
    let trade = rule.nextTrade(context, day);
    while (trade.kind === NextTradeKind.Trade) {
        rungs.push(trade.rung);
        day = dayAfterLoss(day, trade.rung);
        trade = rule.nextTrade(context, day);
    }
    const loss = lossBudget(context);
    return {
        consistencyNote:
            context.stage === SizingStage.Funded
                ? (context.consistencyNote ?? null)
                : null,
        cushion: context.cushion,
        dailyLossCap: { ...loss, amount: dollars(Math.max(0, loss.amount)) },
        dailyLossRoom: dailyLossRoom(context)?.amount ?? null,
        dailyProfitCeiling: tighterOf(
            rule.size(context).profitCeiling,
            context.personalCaps.dailyProfitCap,
            SizingConstraint.PersonalCap,
        ),
        maxTradesPerWindow: rule.rulebook.execution.maxTradesPerWindow,
        oneContractRisk: oneContractRiskOf(context, placement),
        profitCeiling: profitCeiling(context),
        rungPlacements: rungs.map((rung) =>
            isPlacementChecked(context.stage)
                ? rungPlacementOf(rung.risk, placement)
                : RungPlacement.NotChecked,
        ),
        rungs,
        stopCappedBy: trade.cappedBy,
        stopReason: trade.reason,
        valueAfterLoss: null,
        valueAfterWin: null,
        valueNow: null,
    };
}

export function liveTriggerCeilingFor(
    trigger: null | SingleDayProfitTrigger,
    marginDollars: number = LIVE_TRIGGER_CEILING_MARGIN_DOLLARS,
): Dollars | null {
    return trigger === null || !isConfirmedTrigger(trigger)
        ? null
        : dollars(Math.max(0, trigger.amount - marginDollars));
}

function dayAfterLoss(day: DayProgress, rung: DocumentedRung): DayProgress {
    const runningLossAfter: number = rung.runningLossAfter;
    return {
        dayPnL: dollars(-runningLossAfter),
        losses: day.losses + 1,
        runningLoss: rung.runningLossAfter,
        wins: day.wins,
    };
}

function oneContractRiskOf(
    context: RuleContext,
    placement: null | SizingPlacement,
): Dollars | null {
    if (!placement || !isPlacementChecked(context.stage)) return null;
    const resolved = resolvePositionSizing(
        placement.instrument,
        placement.stopPoints,
    );
    return resolved === null ? null : dollars(oneContractRisk(resolved));
}
