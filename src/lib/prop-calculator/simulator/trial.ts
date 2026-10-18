import {
    activationFee,
    type CouponDiscounts,
    evalAttemptDays,
    type EvalPhaseBilling,
    evalPhaseCost,
    rebuyAttemptSubscriptionFee,
    RetryKind,
    retryPath,
    subscriptionFee,
} from '~/lib/prop-calculator/core/FeeSchedule';
import { restoreFundedCycleTracker } from '~/lib/prop-calculator/core/FundedPayoutCycle';
import { type Plan } from '~/lib/prop-calculator/core/Plan';
import { TradingPhase } from '~/lib/prop-calculator/core/TradingPhase';

import { runEvalWithRetries } from './evalPhase';
import { runFundedFromState, runFundedHorizon } from './fundedPhase';
import { NO_LIVE_TRANSFER_CASH } from './livePhase';
import { LossStreak, newPhaseStats, TradeTotals } from './PhaseStats';
import {
    type FinishTrialArguments,
    type FundedSimStart,
    type TrialOptions,
    type TrialOutcome,
    type TrialResult,
} from './types';

export function hasPassedEval(outcome: TrialOutcome): boolean {
    return outcome === 'pass-clean' || outcome === 'bust-funded';
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
        liveTransfer,
        maxAttempts,
        maxEvalDays,
        minRetainedCushion,
        payoutRequestPolicy,
        payoutRequestSize,
        plan,
        positionSizing,
        rng,
        rrRatio,
        rungSizing,
        shouldCaptureEquity,
        start,
        winrate,
    } = options;
    const totals = new TradeTotals();

    if (start?.phase === TradingPhase.Funded) {
        return simulateFundedStartTrial(options, start, totals);
    }

    const evalStart =
        start?.phase === TradingPhase.Eval ? start.attempt : undefined;
    const sunkSubscriptionDays =
        start?.phase === TradingPhase.Eval ? start.sunkSubscriptionDays : 0;

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
        start: evalStart,
        totals,
        winrate,
    });
    const { attempt, attemptsUsed, failedAttemptDays, resetFeesPaid } =
        retryResult;
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
            discounts,
            fundedHorizonDays,
            idleDayProbability,
            intradayPathStepsPerR,
            liveTransfer,
            minRetainedCushion,
            payoutRequestPolicy,
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
                : billableEvalDays + fundedHorizon.firstPayoutDay;

        const outcome: TrialOutcome = isBustedFunded
            ? 'bust-funded'
            : 'pass-clean';

        return finishTrial({
            attemptsUsed,
            closedForInactivity: fundedHorizon.closedForInactivity,
            cumulativeDays,
            daysToPass: passDay,
            equityCurve: lastEquityCurve,
            evalCost: fromStateEvalCost(
                plan,
                { daysToPass: passDay, failedAttemptDays, resetFeesPaid },
                discounts,
                sunkSubscriptionDays,
            ),
            evalDays: billableEvalDays,
            evalTradesAtPass,
            failedAttemptDays,
            finalBalance: attempt.state.balance,
            firstPayoutDay,
            fundedResetFeesPaid: fundedHorizon.fundedResetFeesPaid,
            fundedResetsUsed: fundedHorizon.fundedResetsUsed,
            horizonCredit: fundedHorizon.horizonCredit,
            isAliveAtHorizon: fundedHorizon.isAliveAtHorizon,
            isTransferredLive: fundedHorizon.isTransferredLive,
            liveSlotDays: fundedHorizon.liveSlotDays,
            liveTransferCash: fundedHorizon.liveTransferCash,
            liveTransferOneOff: fundedHorizon.liveTransferOneOff,
            outcome,
            payoutCount: fundedHorizon.payoutCount,
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
        equityCurve: lastEquityCurve,
        evalCost: fromStateEvalCost(
            plan,
            { daysToPass: null, failedAttemptDays, resetFeesPaid },
            discounts,
            sunkSubscriptionDays,
        ),
        evalDays: billableEvalDays,
        evalTradesAtPass: 0,
        failedAttemptDays,
        finalBalance: attempt.state.balance,
        firstPayoutDay: null,
        fundedResetFeesPaid: 0,
        fundedResetsUsed: 0,
        horizonCredit: 0,
        isAliveAtHorizon: false,
        isTransferredLive: false,
        liveSlotDays: 0,
        liveTransferCash: 0,
        liveTransferOneOff: NO_LIVE_TRANSFER_CASH.oneOff,
        outcome: finalOutcome,
        payoutCount: 0,
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
        equityCurve,
        evalCost,
        evalDays,
        evalTradesAtPass,
        failedAttemptDays,
        finalBalance,
        firstPayoutDay,
        fundedResetFeesPaid,
        fundedResetsUsed,
        horizonCredit,
        isAliveAtHorizon,
        isTransferredLive,
        liveSlotDays,
        liveTransferCash,
        liveTransferOneOff,
        outcome,
        payoutCount,
        resetFeesPaid,
        totalPayout,
        totals,
    } = arguments_;
    const grossPayout = totalPayout;
    const totalCost = evalCost + fundedResetFeesPaid;
    const net = grossPayout + liveTransferCash - totalCost;
    return {
        attemptsUsed,
        closedForInactivity,
        daysElapsed: cumulativeDays,
        daysToPass,
        equityCurve,
        evalDays,
        evalTradesAtPass,
        failedAttemptDays,
        finalBalance,
        firstPayoutDay,
        fundedResetFeesPaid,
        fundedResetsUsed,
        grossLosses: totals.grossLosses,
        grossPayout,
        grossWins: totals.grossWins,
        had5LossStreak: totals.maxLosingStreak >= 5,
        had10LossStreak: totals.maxLosingStreak >= 10,
        horizonCredit,
        isAliveAtHorizon,
        isTransferredLive,
        liveSlotDays,
        liveTransferCash,
        liveTransferOneOff,
        maxDrawdown: totals.maxDrawdown,
        maxLosingStreak: totals.maxLosingStreak,
        net,
        outcome,
        payoutCount,
        resetFeesPaid,
        riskTaken: totals.risked,
        totalCost,
        tradesTaken: totals.tradesTaken,
    };
}

function fromStateEvalCost(
    plan: Plan,
    billing: EvalPhaseBilling,
    discounts: CouponDiscounts | undefined,
    sunkSubscriptionDays: number,
): number {
    const fees = plan.fees;
    if (sunkSubscriptionDays <= 0) {
        return evalPhaseCost(fees, billing, discounts);
    }
    const attemptDays = evalAttemptDays(billing);
    const isRebuy = retryPath(fees, discounts) === RetryKind.Rebuy;
    let subscriptionCost: number;
    if (isRebuy) {
        const [firstAttemptDays = 0, ...rebuyDays] = attemptDays;
        const firstSubscription = Math.max(
            0,
            subscriptionFee(
                fees,
                sunkSubscriptionDays + firstAttemptDays,
                discounts,
            ) - subscriptionFee(fees, sunkSubscriptionDays, discounts),
        );
        subscriptionCost = rebuyDays.reduce(
            (total, days) =>
                total + rebuyAttemptSubscriptionFee(fees, days, discounts),
            firstSubscription,
        );
    } else {
        const chainDays = attemptDays.reduce((sum, days) => sum + days, 0);
        subscriptionCost = Math.max(
            0,
            subscriptionFee(fees, sunkSubscriptionDays + chainDays, discounts) -
                subscriptionFee(fees, sunkSubscriptionDays, discounts),
        );
    }
    const evalCost = subscriptionCost + billing.resetFeesPaid;
    return billing.daysToPass === null
        ? evalCost
        : evalCost + activationFee(fees, discounts);
}

function simulateFundedStartTrial(
    options: TrialOptions,
    start: FundedSimStart,
    totals: TradeTotals,
): TrialResult {
    const {
        commission,
        discounts,
        fundedDayPolicy,
        fundedHorizonDays,
        fundedRrRatio,
        idleDayProbability,
        intradayPathStepsPerR,
        liveTransfer,
        minRetainedCushion,
        payoutRequestPolicy,
        payoutRequestSize,
        plan,
        positionSizing,
        rng,
        rrRatio,
        rungSizing,
        winrate,
    } = options;
    const state = { ...start.state };
    const streak = new LossStreak(totals);
    const stats = newPhaseStats(state.balance, totals, streak);
    const initialTracker = restoreFundedCycleTracker(state, start.seed);

    const fundedHorizon = runFundedFromState({
        commission,
        dayPolicy: fundedDayPolicy,
        discounts,
        equityCurve: null,
        fundedHorizonDays,
        idleDayProbability,
        initialTracker,
        intradayPathStepsPerR,
        liveTransfer,
        minRetainedCushion,
        payoutRequestPolicy,
        payoutRequestSize,
        plan,
        positionSizing,
        priorFundedResetsUsed: start.seed.fundedResetsUsed,
        rng,
        rrRatio: fundedRrRatio ?? rrRatio,
        rungSizing,
        state,
        stats,
        winrate,
    });

    return finishTrial({
        attemptsUsed: 1,
        closedForInactivity: fundedHorizon.closedForInactivity,
        cumulativeDays: fundedHorizon.daysElapsed,
        daysToPass: 0,
        equityCurve: null,
        evalCost: 0,
        evalDays: 0,
        evalTradesAtPass: 0,
        failedAttemptDays: [],
        finalBalance: state.balance,
        firstPayoutDay: fundedHorizon.firstPayoutDay,
        fundedResetFeesPaid: fundedHorizon.fundedResetFeesPaid,
        fundedResetsUsed: fundedHorizon.fundedResetsUsed,
        horizonCredit: fundedHorizon.horizonCredit,
        isAliveAtHorizon: fundedHorizon.isAliveAtHorizon,
        isTransferredLive: fundedHorizon.isTransferredLive,
        liveSlotDays: fundedHorizon.liveSlotDays,
        liveTransferCash: fundedHorizon.liveTransferCash,
        liveTransferOneOff: fundedHorizon.liveTransferOneOff,
        outcome: fundedHorizon.isBustedFunded ? 'bust-funded' : 'pass-clean',
        payoutCount: fundedHorizon.payoutCount,
        resetFeesPaid: 0,
        totalPayout: fundedHorizon.totalPayout,
        totals,
    });
}
