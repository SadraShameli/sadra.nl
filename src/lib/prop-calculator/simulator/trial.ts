import { runEvalWithRetries } from './evalPhase';
import { runFundedHorizon } from './fundedPhase';
import { TradeTotals } from './PhaseStats';
import {
    type FinishTrialArguments,
    type TrialOptions,
    type TrialOutcome,
    type TrialResult,
} from './types';

export function isPassingOutcome(o: TrialOutcome): boolean {
    return o === 'pass-clean';
}

export function simulateTrial(options: TrialOptions): TrialResult {
    const {
        commission,
        discounts,
        evalDayPolicy,
        fundedDayPolicy,
        fundedHorizonDays,
        maxAttempts,
        maxEvalDays,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        rng,
        rrRatio,
        rungSizing,
        shouldCaptureEquity,
        winrate,
    } = options;
    const totals = new TradeTotals();

    const retryResult = runEvalWithRetries({
        commission,
        dayPolicy: evalDayPolicy,
        maxAttempts,
        maxEvalDays,
        plan,
        rng,
        rrRatio,
        rungSizing,
        shouldCaptureEquity,
        totals,
        winrate,
    });
    const { attempt, attemptsUsed, resetFeesPaid } = retryResult;
    const evalDays = retryResult.daysElapsed;
    let cumulativeDays = evalDays;
    const lastEquityCurve = attempt.equityCurve;

    if (retryResult.terminalOutcome === null) {
        const passDay = attempt.days;
        const evalTradesAtPass = attempt.stats.tradesTaken;

        const fundedHorizon = runFundedHorizon({
            attempt,
            commission,
            dayPolicy: fundedDayPolicy,
            fundedHorizonDays,
            minRetainedCushion,
            payoutRequestSize,
            plan,
            rng,
            rrRatio,
            rungSizing,
            winrate,
        });
        cumulativeDays += fundedHorizon.daysElapsed;
        const isBustedFunded = fundedHorizon.isBustedFunded;

        const firstPayoutDay =
            fundedHorizon.firstPayoutDay === null
                ? null
                : passDay + fundedHorizon.firstPayoutDay;

        const outcome: TrialOutcome = isBustedFunded
            ? 'bust-funded'
            : 'pass-clean';

        return finishTrial({
            attemptsUsed,
            cumulativeDays,
            daysToPass: passDay,
            discounts,
            equityCurve: lastEquityCurve,
            evalDays,
            evalTradesAtPass,
            finalBalance: attempt.state.balance,
            firstPayoutDay,
            outcome,
            plan,
            resetFeesPaid,
            totalPayout: fundedHorizon.totalPayout,
            totals,
        });
    }

    const finalOutcome: TrialOutcome =
        retryResult.terminalOutcome === 'busted' ? 'bust-eval' : 'timeout-eval';
    return finishTrial({
        attemptsUsed,
        cumulativeDays,
        daysToPass: null,
        discounts,
        equityCurve: lastEquityCurve,
        evalDays,
        evalTradesAtPass: 0,
        finalBalance: attempt.state.balance,
        firstPayoutDay: null,
        outcome: finalOutcome,
        plan,
        resetFeesPaid,
        totalPayout: 0,
        totals,
    });
}

function finishTrial(arguments_: FinishTrialArguments): TrialResult {
    const {
        attemptsUsed,
        cumulativeDays,
        daysToPass,
        discounts,
        equityCurve,
        evalDays,
        evalTradesAtPass,
        finalBalance,
        firstPayoutDay,
        outcome,
        plan,
        resetFeesPaid,
        totalPayout,
        totals,
    } = arguments_;
    const grossPayout = totalPayout;
    const baseCost = plan.totalCostThroughDay(evalDays, discounts);
    const totalCost = baseCost + resetFeesPaid;
    const net = grossPayout - totalCost;
    return {
        attemptsUsed,
        daysElapsed: cumulativeDays,
        daysToPass,
        equityCurve,
        evalTradesAtPass,
        finalBalance,
        firstPayoutDay,
        grossLosses: totals.grossLosses,
        grossPayout,
        grossWins: totals.grossWins,
        had5LossStreak: totals.maxLosingStreak >= 5,
        had10LossStreak: totals.maxLosingStreak >= 10,
        maxDrawdown: totals.maxDrawdown,
        maxLosingStreak: totals.maxLosingStreak,
        net,
        outcome,
        resetFeesPaid,
        totalCost,
        tradesTaken: totals.tradesTaken,
    };
}
