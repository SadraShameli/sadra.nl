import { runEvalWithRetries } from './evalPhase';
import { runFundedHorizon } from './fundedPhase';
import { newPathStats } from './PathStats';
import {
    type FinishTrialArguments,
    type TrialOptions,
    type TrialOutcome,
    type TrialResult,
} from './types';

export function isPassingOutcome(o: TrialOutcome): boolean {
    return o === 'pass-clean' || o === 'pass-violation';
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
    const cumulative = newPathStats(plan.accountSize);

    const retryResult = runEvalWithRetries({
        commission,
        dayPolicy: evalDayPolicy,
        maxAttempts,
        maxEvalDays,
        onFailedAttempt: (failedAttempt) =>
            cumulative.rollUp(failedAttempt.stats),
        plan,
        rng,
        rrRatio,
        rungSizing,
        shouldCaptureEquity,
        winrate,
    });
    const { attempt, attemptsUsed, resetFeesPaid } = retryResult;
    let cumulativeDays = retryResult.daysElapsed;
    const lastEquityCurve = attempt.equityCurve;

    if (retryResult.terminalOutcome === null) {
        const passDay = attempt.days;
        const passBalance = attempt.state.balance;
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

        cumulative.rollUp(attempt.stats);

        const fundedProfit = Math.max(0, attempt.state.balance - passBalance);
        let firstPayoutDay: null | number = null;
        if (plan.payoutLadder) {
            firstPayoutDay =
                fundedHorizon.firstPayoutDay === null
                    ? null
                    : passDay + fundedHorizon.firstPayoutDay;
        } else if (fundedProfit >= plan.minPayoutProfit) {
            const earliest = passDay + plan.minDaysAfterPassForPayout;
            firstPayoutDay = Math.max(earliest, passDay + 1);
        }

        const evalProfit = passBalance - attempt.state.startingBalance;
        const isConsistencyViolated =
            plan
                .evalConsistencyRule()
                ?.isViolated(attempt.bestDayProfit, evalProfit) ?? false;

        let outcome: TrialOutcome;
        if (isBustedFunded) outcome = 'bust-funded';
        else if (isConsistencyViolated) outcome = 'pass-violation';
        else outcome = 'pass-clean';

        return finishTrial({
            attemptsUsed,
            cumulative,
            cumulativeDays,
            daysToPass: passDay,
            discounts,
            equityCurve: lastEquityCurve,
            evalTradesAtPass,
            finalBalance: attempt.state.balance,
            firstPayoutDay,
            fundedProfit,
            ladderPayout: fundedHorizon.totalPayout,
            outcome,
            plan,
            resetFeesPaid,
        });
    }

    const finalOutcome: TrialOutcome =
        retryResult.terminalOutcome === 'busted' ? 'bust-eval' : 'timeout-eval';
    return finishTrial({
        attemptsUsed,
        cumulative,
        cumulativeDays,
        daysToPass: null,
        discounts,
        equityCurve: lastEquityCurve,
        evalTradesAtPass: 0,
        finalBalance: attempt.state.balance,
        firstPayoutDay: null,
        fundedProfit: 0,
        ladderPayout: 0,
        outcome: finalOutcome,
        plan,
        resetFeesPaid,
    });
}

function finishTrial(arguments_: FinishTrialArguments): TrialResult {
    const {
        attemptsUsed,
        cumulative,
        cumulativeDays,
        daysToPass,
        discounts,
        equityCurve,
        evalTradesAtPass,
        finalBalance,
        firstPayoutDay,
        fundedProfit,
        ladderPayout,
        outcome,
        plan,
        resetFeesPaid,
    } = arguments_;
    const isPassed = isPassingOutcome(outcome);
    const grossPayout = isPassed
        ? plan.payoutLadder
            ? ladderPayout
            : plan.payoutFromProfit(fundedProfit)
        : 0;
    const baseCost = plan.totalCostThroughDay(cumulativeDays, discounts);
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
        fundedProfit,
        grossLosses: cumulative.grossLosses,
        grossPayout,
        grossWins: cumulative.grossWins,
        had5LossStreak: cumulative.maxLosingStreak >= 5,
        had10LossStreak: cumulative.maxLosingStreak >= 10,
        maxDrawdown: cumulative.maxDrawdown,
        maxLosingStreak: cumulative.maxLosingStreak,
        net,
        outcome,
        resetFeesPaid,
        totalCost,
        tradesTaken: cumulative.tradesTaken,
    };
}
