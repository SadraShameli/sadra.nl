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
        fundedRrRatio,
        idleDayProbability,
        intradayPathStepsPerR,
        maxAttempts,
        maxEvalDays,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        positionSizing,
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
    });
    const { attempt, attemptsUsed, resetFeesPaid } = retryResult;
    let cumulativeDays = retryResult.daysElapsed;
    const billableEvalDays = retryResult.daysElapsed;
    const lastEquityCurve = attempt.equityCurve;

    if (retryResult.terminalOutcome === null) {
        const passDay = attempt.days;
        const evalTradesAtPass = attempt.stats.tradesTaken;

        const fundedHorizon = runFundedHorizon({
            attempt,
            commission,
            dayPolicy: fundedDayPolicy,
            fundedHorizonDays,
            idleDayProbability,
            intradayPathStepsPerR,
            minRetainedCushion,
            payoutRequestSize,
            plan,
            positionSizing,
            rng,
            rrRatio: fundedRrRatio ?? rrRatio,
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
            closedForInactivity: fundedHorizon.closedForInactivity,
            cumulativeDays,
            daysToPass: passDay,
            discounts,
            equityCurve: lastEquityCurve,
            evalDays: billableEvalDays,
            evalTradesAtPass,
            finalBalance: attempt.state.balance,
            firstPayoutDay,
            outcome,
            payoutCount: fundedHorizon.payoutCount,
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
        closedForInactivity: attempt.closedForInactivity,
        cumulativeDays,
        daysToPass: null,
        discounts,
        equityCurve: lastEquityCurve,
        evalDays: billableEvalDays,
        evalTradesAtPass: 0,
        finalBalance: attempt.state.balance,
        firstPayoutDay: null,
        outcome: finalOutcome,
        payoutCount: 0,
        plan,
        resetFeesPaid,
        totalPayout: 0,
        totals,
    });
}

function finishTrial(arguments_: FinishTrialArguments): TrialResult {
    const {
        attemptsUsed,
        closedForInactivity,
        cumulativeDays,
        daysToPass,
        discounts,
        equityCurve,
        evalDays,
        evalTradesAtPass,
        finalBalance,
        firstPayoutDay,
        outcome,
        payoutCount,
        plan,
        resetFeesPaid,
        totalPayout,
        totals,
    } = arguments_;
    const grossPayout = totalPayout;
    const isNeverReachedFundedAccount =
        outcome === 'bust-eval' || outcome === 'timeout-eval';
    const baseCost = isNeverReachedFundedAccount
        ? plan.feesUntilPass(evalDays, discounts)
        : plan.totalCostThroughDay(evalDays, discounts);
    const totalCost = baseCost + resetFeesPaid;
    const net = grossPayout - totalCost;
    return {
        attemptsUsed,
        closedForInactivity,
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
        payoutCount,
        resetFeesPaid,
        totalCost,
        tradesTaken: totals.tradesTaken,
    };
}
