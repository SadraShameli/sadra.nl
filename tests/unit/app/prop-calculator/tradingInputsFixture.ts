import { type ComponentProps } from 'react';
import { vi } from 'vitest';

import type TradingInputs from '~/app/(app)/prop-calculator/_components/TradingInputs';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';

export type TradingInputsProperties = ComponentProps<typeof TradingInputs>;

export function tradingInputsProperties(
    overrides: Partial<TradingInputsProperties> = {},
): TradingInputsProperties {
    const state = defaultCalculatorState();
    const noop = vi.fn();
    const defaults: TradingInputsProperties = {
        activationDiscountPercent: state.activationDiscountPercent,
        commissionPerRoundTrip: state.commissionPerRoundTrip,
        copyAccounts: state.copyAccounts,
        dayStop: state.dayStop,
        evalDiscountPercent: state.evalDiscountPercent,
        firmDisplayName: state.firm.displayName,
        idleDayProbability: state.idleDayProbability,
        instrument: state.instrument,
        linkActivationDiscount: state.linkActivationDiscount,
        liveTransferHazard: state.liveTransferHazard,
        maxAttempts: state.maxAttempts,
        maxCopyAccounts: state.firm.maxFundedAccounts(state.plan),
        maxEvalDays: state.maxEvalDays,
        monthlySubscriptionDiscountPercent:
            state.monthlySubscriptionDiscountPercent,
        onActivationDiscountPercentChange: noop,
        onCommissionPerRoundTripChange: noop,
        onCopyAccountsChange: noop,
        onDayStopChange: noop,
        onEvalDiscountPercentChange: noop,
        onIdleDayProbabilityChange: noop,
        onInstrumentChange: noop,
        onLinkActivationDiscountChange: noop,
        onLiveTransferHazardChange: noop,
        onMaxAttemptsChange: noop,
        onMaxEvalDaysChange: noop,
        onMonthlySubscriptionDiscountPercentChange: noop,
        onPayoutRequestSizeChange: noop,
        onResetCoupon: noop,
        onResetDiscountPercentChange: noop,
        onRetainedCushionChange: noop,
        onRiskDollarsChange: noop,
        onRiskPercentChange: noop,
        onRrRatioChange: noop,
        onRungSizingChange: noop,
        onSeedChange: noop,
        onSizingModeChange: noop,
        onStopPointsChange: noop,
        onTakesFundedResetChange: noop,
        onTakesOneTimeEarlyWithdrawalChange: noop,
        onTradesPerDayChange: noop,
        onTrialsChange: noop,
        onWinrateChange: noop,
        payoutRequestSize: state.payoutRequestSize,
        plan: state.plan,
        resetDiscountPercent: state.resetDiscountPercent,
        retainedCushion: state.retainedCushion,
        riskDollars: state.riskDollars,
        riskPercent: state.riskPercent,
        rrRatio: state.rrRatio,
        rungSizing: state.rungSizing,
        seed: state.seed,
        sizingMode: state.sizingMode,
        stopPoints: state.stopPoints,
        takesFundedReset: state.takesFundedReset,
        takesOneTimeEarlyWithdrawal: state.takesOneTimeEarlyWithdrawal,
        tradesPerDay: state.tradesPerDay,
        trials: state.trials,
        winrate: state.winrate,
    };
    return { ...defaults, ...overrides };
}
