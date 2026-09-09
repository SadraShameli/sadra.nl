import { runDay } from './day';
import { newPathStats } from './PathStats';
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
        maxEvalDays,
        plan,
        rng,
        rrRatio,
        rungSizing,
        shouldCaptureEquity,
        winrate,
    } = options;
    const state = plan.initialState();
    const stats = newPathStats(state.startingBalance);
    const equityCurve: null | number[] = shouldCaptureEquity
        ? [state.balance]
        : null;
    let bestDayProfit = 0;
    let days = 0;
    let outcome: AttemptOutcome = 'timed-out';

    for (let day = 0; day < maxEvalDays; day++) {
        const { busted } = runDay({
            commission,
            dayPolicy,
            phase: 'eval',
            plan,
            rng,
            rrRatio,
            rungSizing,
            state,
            stats,
            winrate,
        });
        days += 1;
        state.daysElapsed = days;
        if (state.todayPnL > bestDayProfit) bestDayProfit = state.todayPnL;
        if (state.todayPnL > state.bestDayProfit) {
            state.bestDayProfit = state.todayPnL;
        }
        if (equityCurve) equityCurve.push(state.balance);

        if (busted) {
            outcome = 'busted';
            break;
        }
        if (plan.isPassed(state)) {
            outcome = 'passed';
            break;
        }
    }

    return { bestDayProfit, days, equityCurve, outcome, state, stats };
}

export function runEvalWithRetries(
    options: EvalWithRetriesOptions,
): EvalWithRetriesResult {
    const {
        commission,
        dayPolicy,
        maxAttempts,
        maxEvalDays,
        onFailedAttempt,
        plan,
        rng,
        rrRatio,
        rungSizing,
        shouldCaptureEquity,
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
            maxEvalDays,
            plan,
            rng,
            rrRatio,
            rungSizing,
            shouldCaptureEquity,
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

        onFailedAttempt?.(attempt);

        if (attempt.outcome === 'busted' && attemptsUsed < maxAttempts) {
            resetFeesPaid += plan.fees.reset;
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
