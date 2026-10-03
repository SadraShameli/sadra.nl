import { type SimInputs, withPlanOptIns } from '~/lib/prop-calculator';

import { toCouponDiscounts } from './couponDiscounts';
import { riskPercentToDollars } from './riskConversion';
import { type CalculatorState, SizingMode } from './types';

export type SimInputsSource = Pick<
    CalculatorState,
    | 'activationDiscountPercent'
    | 'commissionPerRoundTrip'
    | 'copyAccounts'
    | 'dayStop'
    | 'evalDayPolicy'
    | 'evalDiscountPercent'
    | 'fundedHorizonDays'
    | 'idleDayProbability'
    | 'instrument'
    | 'linkActivationDiscount'
    | 'maxAttempts'
    | 'maxEvalDays'
    | 'monthlySubscriptionDiscountPercent'
    | 'payoutRequestSize'
    | 'plan'
    | 'resetDiscountPercent'
    | 'retainedCushion'
    | 'riskDollars'
    | 'riskPercent'
    | 'rrRatio'
    | 'rungSizing'
    | 'seed'
    | 'sizingMode'
    | 'stopPoints'
    | 'takesFundedReset'
    | 'takesOneTimeEarlyWithdrawal'
    | 'tradesPerDay'
    | 'trials'
    | 'winrate'
>;

export function buildSimInputs(source: SimInputsSource): SimInputs {
    const riskPerTrade =
        source.sizingMode === SizingMode.Dollar
            ? source.riskDollars
            : riskPercentToDollars(source.riskPercent, source.plan.accountSize);
    return {
        commissionPerRoundTrip: source.commissionPerRoundTrip,
        copyAccounts: source.copyAccounts,
        dayStop: source.dayStop,
        discounts: toCouponDiscounts({
            activationDiscountPercent: source.activationDiscountPercent,
            evalDiscountPercent: source.evalDiscountPercent,
            linkActivationDiscount: source.linkActivationDiscount,
            monthlySubscriptionDiscountPercent:
                source.monthlySubscriptionDiscountPercent,
            resetDiscountPercent: source.resetDiscountPercent,
        }),
        evalDayPolicy: source.evalDayPolicy ?? undefined,
        fundedHorizonDays: source.fundedHorizonDays,
        idleDayProbability: source.idleDayProbability,
        instrument: source.instrument ?? undefined,
        maxAttempts: source.maxAttempts,
        maxEvalDays: source.maxEvalDays,
        minRetainedCushion: source.retainedCushion ?? undefined,
        payoutRequestSize: source.payoutRequestSize ?? undefined,
        plan: withPlanOptIns(source.plan, {
            takesFundedReset: source.takesFundedReset,
            takesOneTimeEarlyWithdrawal: source.takesOneTimeEarlyWithdrawal,
        }),
        riskPerTrade,
        rrRatio: source.rrRatio,
        rungSizing: source.rungSizing,
        seed: source.seed,
        stopPoints: source.stopPoints ?? undefined,
        tradesPerDay: source.tradesPerDay,
        trials: source.trials,
        winrate: source.winrate,
    };
}
