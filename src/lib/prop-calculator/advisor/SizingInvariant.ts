import { isAtOrBelowWithinCentTolerance, resolveAffordableRisk } from '~/lib/prop-calculator/core';

import {
    type DocumentedRung,
    type DocumentedSizing,
    hardProfitCeiling,
    type NextTrade,
    NextTradeKind,
    NO_COMMISSION,
    SizingConstraint,
    type SizingTerms,
} from './DocumentedSizing';
import {
    type DayProgress,
    lossBudget,
    profitCeiling,
    type RuleContext,
    tighterOf,
} from './RuleContext';

export enum SizingInvariantBreach {
    InvalidRung = 'invalid-rung',
    RungAboveAffordable = 'rung-above-affordable',
    RunningLossAboveRoom = 'running-loss-above-room',
    RunningLossColumnMismatch = 'running-loss-column-mismatch',
    WinAboveCeiling = 'win-above-ceiling',
}

export class SizingInvariantError extends Error {
    constructor(
        readonly breach: SizingInvariantBreach,
        readonly rungIndex: number,
        message: string,
    ) {
        super(message);
        this.name = 'SizingInvariantError';
    }
}

export function assertSizingInvariant(
    sizing: DocumentedSizing,
    context: RuleContext,
): void {
    let runningLoss = 0;
    for (const [index, rung] of sizing.rungs.entries()) {
        assertRung(rung, index, sizing, context, -runningLoss, runningLoss);
        runningLoss += rung.risk;
    }
}

export function assertTradeInvariant(
    trade: NextTrade,
    terms: SizingTerms,
    context: RuleContext,
    day: DayProgress,
): void {
    if (trade.kind === NextTradeKind.Stop) return;
    assertRung(
        trade.rung,
        day.wins + day.losses,
        terms,
        context,
        day.dayPnL,
        day.runningLoss,
    );
}

function assertRung(
    rung: DocumentedRung,
    index: number,
    terms: SizingTerms,
    context: RuleContext,
    dayPnL: number,
    runningLoss: number,
): void {
    const label = `trade ${index + 1}`;
    if (!Number.isFinite(rung.risk) || rung.risk <= 0) {
        throw new SizingInvariantError(
            SizingInvariantBreach.InvalidRung,
            index,
            `${label} risks ${rung.risk}; every trade must risk a positive finite amount`,
        );
    }
    if (!isSameCents(rung.runningLossBefore, runningLoss)) {
        throw new SizingInvariantError(
            SizingInvariantBreach.RunningLossColumnMismatch,
            index,
            `${label} reports a running loss of ${rung.runningLossBefore} before it, the earlier losses sum to ${runningLoss}`,
        );
    }
    const affordable = resolveAffordableRisk(
        context.cushion - runningLoss,
        context.dayStartDllRoom,
        -runningLoss,
        NO_COMMISSION,
    );
    if (!isAtOrBelowWithinCentTolerance(rung.risk, affordable)) {
        throw new SizingInvariantError(
            SizingInvariantBreach.RungAboveAffordable,
            index,
            `${label} risks ${rung.risk} but only ${affordable} is affordable after a running loss of ${runningLoss}`,
        );
    }
    const lossAfter = runningLoss + rung.risk;
    if (!isSameCents(rung.runningLossAfter, lossAfter)) {
        throw new SizingInvariantError(
            SizingInvariantBreach.RunningLossColumnMismatch,
            index,
            `${label} reports a running loss of ${rung.runningLossAfter} after it, the losses sum to ${lossAfter}`,
        );
    }
    const room = lossBudget(context).amount;
    if (!isAtOrBelowWithinCentTolerance(lossAfter, room)) {
        throw new SizingInvariantError(
            SizingInvariantBreach.RunningLossAboveRoom,
            index,
            `${label} takes the running loss to ${lossAfter}, above the loss room of ${room} (cushion, day-start DLL room and personal DLL)`,
        );
    }
    const ceiling = tighterOf(
        profitCeiling(context),
        hardProfitCeiling(terms.dailyProfitCap),
        SizingConstraint.DailyProfitCap,
    );
    if (
        ceiling !== null &&
        !isAtOrBelowWithinCentTolerance(
            dayPnL + rung.takeProfit,
            ceiling.amount,
        )
    ) {
        throw new SizingInvariantError(
            SizingInvariantBreach.WinAboveCeiling,
            index,
            `${label} wins ${rung.takeProfit} from a day at ${dayPnL}, above the ${ceiling.constraint} of ${ceiling.amount}`,
        );
    }
}

function isSameCents(a: number, b: number): boolean {
    return (
        isAtOrBelowWithinCentTolerance(a, b) &&
        isAtOrBelowWithinCentTolerance(b, a)
    );
}
