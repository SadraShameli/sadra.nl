import { type DatedCharge } from '../core/DatedCharge';
import { recordBestDay } from '../core/TradingDayLedger';
import { TradingPhase } from '../core/TradingPhase';
import { runDay } from './day';
import { LossStreak, newPhaseStats } from './PhaseStats';
import {
    type AttemptOutcome,
    type EvalAttemptOptions,
    type EvalAttemptResult,
    type EvalDayRunOptions,
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
    const dayOptions: EvalDayRunOptions = {
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
        recordBestDay(state);
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
        maxTotalEvalDays,
        plan,
        positionSizing,
        rng,
        rrRatio,
        rungSizing,
        shouldCaptureEquity,
        totals,
        winrate,
    } = options;
    if (maxAttempts === undefined && maxTotalEvalDays === undefined) {
        throw new Error(
            'runEvalWithRetries needs maxAttempts or maxTotalEvalDays to bound its retries',
        );
    }
    let daysElapsed = 0;
    let attemptsUsed = 0;
    let resetFeesPaid = 0;
    const failedAttemptDays: number[] = [];
    const retryCharges: DatedCharge[] = [];

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
                failedAttemptDays,
                resetFeesPaid,
                retryCharges,
                terminalOutcome: null,
            };
        }

        failedAttemptDays.push(attempt.days);

        const isWithinAttemptCap =
            maxAttempts === undefined || attemptsUsed < maxAttempts;
        const isWithinDayBudget =
            maxTotalEvalDays === undefined ||
            (attempt.days > 0 && daysElapsed < maxTotalEvalDays);
        if (isWithinAttemptCap && isWithinDayBudget) {
            const fee = plan.retryFee(discounts);
            resetFeesPaid += fee;
            retryCharges.push({ dayOffset: daysElapsed, fee });
            continue;
        }

        return {
            attempt,
            attemptsUsed,
            daysElapsed,
            failedAttemptDays,
            resetFeesPaid,
            retryCharges,
            terminalOutcome:
                attempt.outcome === 'busted' ? 'busted' : 'timed-out',
        };
    }
}
