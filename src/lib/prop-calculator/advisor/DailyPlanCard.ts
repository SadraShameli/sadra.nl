import { dollars } from '../core';
import { type DocumentedRule } from './DocumentedRule';
import {
    type DayStopReason,
    type DocumentedRung,
    NextTradeKind,
    type SizingConstraint,
} from './DocumentedSizing';
import { type DayProgress, type RuleContext } from './RuleContext';

export interface DailyPlanCard {
    readonly rungs: readonly DocumentedRung[];
    readonly stopCappedBy: readonly SizingConstraint[];
    readonly stopReason: DayStopReason;
}

const ZERO_DAY: DayProgress = {
    dayPnL: dollars(0),
    losses: 0,
    runningLoss: dollars(0),
    wins: 0,
};

export function dailyPlanCard<TContext extends RuleContext>(
    rule: DocumentedRule<TContext>,
    context: TContext,
): DailyPlanCard {
    const rungs: DocumentedRung[] = [];
    let day = ZERO_DAY;
    let trade = rule.nextTrade(context, day);
    while (trade.kind === NextTradeKind.Trade) {
        rungs.push(trade.rung);
        day = dayAfterLoss(day, trade.rung);
        trade = rule.nextTrade(context, day);
    }
    return {
        rungs,
        stopCappedBy: trade.cappedBy,
        stopReason: trade.reason,
    };
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
