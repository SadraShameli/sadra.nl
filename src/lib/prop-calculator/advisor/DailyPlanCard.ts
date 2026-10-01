import {
    type Dollars,
    dollars,
    PolicyVerification,
    type SingleDayProfitTrigger,
} from '~/lib/prop-calculator/core';

import { type DocumentedRule } from './DocumentedRule';
import {
    type DayStopReason,
    type DocumentedRung,
    NextTradeKind,
    type SizingConstraint,
} from './DocumentedSizing';
import { type DayProgress, type RuleContext } from './RuleContext';

export const LIVE_TRIGGER_CEILING_MARGIN_DOLLARS = 50;

export interface DailyPlanCard {
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
        valueAfterLoss: null,
        valueAfterWin: null,
        valueNow: null,
    };
}

export function liveTriggerCeilingFor(
    trigger: null | SingleDayProfitTrigger,
    marginDollars: number = LIVE_TRIGGER_CEILING_MARGIN_DOLLARS,
): Dollars | null {
    return trigger === null ||
        trigger.source?.verification !== PolicyVerification.Confirmed
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
