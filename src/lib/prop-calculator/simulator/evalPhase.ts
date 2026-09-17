import { resetFactor } from '../core/FeeSchedule';
import { TradingPhase } from '../core/TradingPhase';
import { runDay } from './day';
import { LossStreak, newPhaseStats } from './PhaseStats';
import {
    type AttemptOutcome,
    type EvalAttemptOptions,
    type EvalAttemptResult,
    type EvalWithRetriesOptions,
    type EvalWithRetriesResult,
} from './types';

export function runEvalAttempt(options: EvalAttemptOptions): EvalAttemptResult {
    const {
        commission,
        dayPolicy,
        idleDayProbability,
        intradayPathStepsPerR,
        maxEvalDays,
        plan,
        positionSizing,
        rng,
        rrRatio,
        rungSizing,
        shouldCaptureEquity,
        totals,
        winrate,
    } = options;
    const state = plan.initialState();
    const streak = new LossStreak(totals);
    const stats = newPhaseStats(state.startingBalance, totals, streak);
    const equityCurve: null | number[] = shouldCaptureEquity
        ? [state.balance]
        : null;

    if (plan.isInstantFunded) {
        return {
            closedForInactivity: false,
            days: 0,
            equityCurve,
            outcome: 'passed',
            state,
            stats,
            streak,
        };
    }

    let isClosedForInactivity = false;
    let days = 0;
    let outcome: AttemptOutcome = 'timed-out';

    const dayCap = plan.evalDayCap(maxEvalDays);
    const dayOptions = {
        commission,
        dayPolicy,
        idleDayProbability,
        intradayPathStepsPerR,
        phase: TradingPhase.Eval,
        plan,
        positionSizing,
        rng,
        rrRatio,
        rungSizing,
        state,
        stats,
        winrate,
    };
    for (let day = 0; day < dayCap; day++) {
        const { busted, closedForInactivity: idleClosure } = runDay(dayOptions);
        days += 1;
        if (state.todayPnL > state.bestDayProfit) {
            state.bestDayProfit = state.todayPnL;
        }
        if (equityCurve) equityCurve.push(state.balance);

        if (busted) {
            isClosedForInactivity = idleClosure;
            outcome = 'busted';
            break;
        }
        if (plan.isPassed(state)) {
            outcome = 'passed';
            break;
        }
    }

    return {
        closedForInactivity: isClosedForInactivity,
        days,
        equityCurve,
        outcome,
        state,
        stats,
        streak,
    };
}

export function runEvalWithRetries(
    options: EvalWithRetriesOptions,
): EvalWithRetriesResult {
    const {
        commission,
        dayPolicy,
        discounts,
        idleDayProbability,
        intradayPathStepsPerR,
        maxAttempts,
        maxEvalDays,
        plan,
        positionSizing,
        rng,
        rrRatio,
        rungSizing,
        shouldCaptureEquity,
        totals,
        winrate,
    } = options;
    let daysElapsed = 0;
    let attemptsUsed = 0;
    let resetFeesPaid = 0;

    for (;;) {
        attemptsUsed += 1;
        const attempt = runEvalAttempt({
            commission,
            dayPolicy,
            idleDayProbability,
            intradayPathStepsPerR,
            maxEvalDays,
            plan,
            positionSizing,
            rng,
            rrRatio,
            rungSizing,
            shouldCaptureEquity,
            totals,
            winrate,
        });
        daysElapsed += attempt.days;

        if (attempt.outcome === 'passed') {
            return {
                attempt,
                attemptsUsed,
                daysElapsed,
                resetFeesPaid,
                terminalOutcome: null,
            };
        }

        if (attempt.outcome === 'busted' && attemptsUsed < maxAttempts) {
            resetFeesPaid += plan.fees.reset * resetFactor(discounts);
            continue;
        }

        return {
            attempt,
            attemptsUsed,
            daysElapsed,
            resetFeesPaid,
            terminalOutcome:
                attempt.outcome === 'busted' ? 'busted' : 'timed-out',
        };
    }
}
