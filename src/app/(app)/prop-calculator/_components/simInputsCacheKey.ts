import {
    DEFAULT_PAYOUT_REQUEST_POLICY,
    SIM_DEFAULTS,
    type SimInputs,
    type SimStart,
} from '~/lib/prop-calculator';

export enum SimInputsKeyField {
    ActivationDiscount = 'act',
    Attempts = 'attempts',
    BundleDiscount = 'bundle',
    Commission = 'commission',
    CopyAccounts = 'copy',
    DayStop = 'dayStop',
    EarlyWithdrawal = 'earlyWithdrawal',
    EvalDayPolicy = 'evalDayPolicy',
    EvalDiscount = 'eval',
    FundedCushionPercent = 'fundedCushion',
    FundedDayPolicy = 'fundedDayPolicy',
    FundedHorizonDays = 'funded',
    FundedReset = 'fundedReset',
    FundedRiskPerTrade = 'fundedRisk',
    FundedRrRatio = 'fundedRr',
    FundedTradesPerDay = 'fundedTpd',
    IdleDayProbability = 'idle',
    Instrument = 'instrument',
    IntradayPathStepsPerR = 'pathSteps',
    LiveTransferHazard = 'liveTransferHazard',
    MaxEvalDays = 'max',
    MinRetainedCushion = 'minCushion',
    MonthlyDiscount = 'monthly',
    PayoutRequestPolicy = 'payoutPolicy',
    PayoutRequestSize = 'payoutRequest',
    PlanId = 'planId',
    RebuyLagDays = 'rebuyLag',
    ResetDiscount = 'reset',
    RiskPerTrade = 'risk',
    RrRatio = 'rr',
    RungSizing = 'rungSizing',
    Seed = 'seed',
    Start = 'start',
    StopPoints = 'stopPoints',
    TradesPerDay = 'tpd',
    Trials = 'trials',
    VerifiedCumulativePayoutTrigger = 'verifiedCumulativePayoutTrigger',
    Winrate = 'winrate',
}

type KeyInputs = Omit<
    SimInputs,
    'fundedHorizonDays' | 'plan' | 'riskPerTrade'
> &
    Partial<Pick<SimInputs, 'fundedHorizonDays' | 'plan' | 'riskPerTrade'>> & {
        start?: SimStart;
    };

export function simInputsCacheKey(
    inputs: KeyInputs,
    options?: {
        extra?: Readonly<Record<string, unknown>>;
        omit?: readonly SimInputsKeyField[];
    },
): string {
    const omit = new Set<string>(options?.omit);
    const all: Record<SimInputsKeyField, unknown> = {
        [SimInputsKeyField.ActivationDiscount]:
            inputs.discounts?.activationPercent ?? 0,
        [SimInputsKeyField.Attempts]:
            inputs.maxAttempts ?? SIM_DEFAULTS.maxAttempts,
        [SimInputsKeyField.BundleDiscount]:
            inputs.discounts?.bundlePercent ?? 0,
        [SimInputsKeyField.Commission]:
            inputs.commissionPerRoundTrip ??
            SIM_DEFAULTS.commissionPerRoundTrip,
        [SimInputsKeyField.CopyAccounts]:
            inputs.copyAccounts ?? SIM_DEFAULTS.copyAccounts,
        [SimInputsKeyField.DayStop]: inputs.dayStop ?? null,
        [SimInputsKeyField.EarlyWithdrawal]:
            inputs.plan?.takesOneTimeEarlyWithdrawal ?? false,
        [SimInputsKeyField.EvalDayPolicy]: inputs.evalDayPolicy ?? null,
        [SimInputsKeyField.EvalDiscount]: inputs.discounts?.evalPercent ?? 0,
        [SimInputsKeyField.FundedCushionPercent]:
            inputs.fundedCushionPercent ?? null,
        [SimInputsKeyField.FundedDayPolicy]: inputs.fundedDayPolicy ?? null,
        [SimInputsKeyField.FundedHorizonDays]: inputs.fundedHorizonDays ?? null,
        [SimInputsKeyField.FundedReset]: inputs.plan?.takesFundedReset ?? false,
        [SimInputsKeyField.FundedRiskPerTrade]:
            inputs.fundedRiskPerTrade ?? null,
        [SimInputsKeyField.FundedRrRatio]: inputs.fundedRrRatio ?? null,
        [SimInputsKeyField.FundedTradesPerDay]:
            inputs.fundedTradesPerDay ?? null,
        [SimInputsKeyField.IdleDayProbability]:
            inputs.idleDayProbability ?? SIM_DEFAULTS.idleDayProbability,
        [SimInputsKeyField.Instrument]: inputs.instrument ?? null,
        [SimInputsKeyField.IntradayPathStepsPerR]:
            inputs.intradayPathStepsPerR ?? null,
        [SimInputsKeyField.LiveTransferHazard]:
            inputs.liveTransferHazard ?? null,
        [SimInputsKeyField.MaxEvalDays]: inputs.maxEvalDays,
        [SimInputsKeyField.MinRetainedCushion]:
            inputs.minRetainedCushion ?? null,
        [SimInputsKeyField.MonthlyDiscount]:
            inputs.discounts?.monthlySubscriptionPercent ?? 0,
        [SimInputsKeyField.PayoutRequestPolicy]:
            inputs.payoutRequestPolicy ?? DEFAULT_PAYOUT_REQUEST_POLICY,
        [SimInputsKeyField.PayoutRequestSize]: inputs.payoutRequestSize ?? null,
        [SimInputsKeyField.PlanId]: inputs.plan?.id ?? null,
        [SimInputsKeyField.RebuyLagDays]:
            inputs.rebuyLagDays ?? SIM_DEFAULTS.rebuyLagDays,
        [SimInputsKeyField.ResetDiscount]: inputs.discounts?.resetPercent ?? 0,
        [SimInputsKeyField.RiskPerTrade]: inputs.riskPerTrade ?? null,
        [SimInputsKeyField.RrRatio]: inputs.rrRatio,
        [SimInputsKeyField.RungSizing]: inputs.rungSizing ?? null,
        [SimInputsKeyField.Seed]: inputs.seed,
        [SimInputsKeyField.Start]: inputs.start ?? null,
        [SimInputsKeyField.StopPoints]: inputs.stopPoints ?? null,
        [SimInputsKeyField.TradesPerDay]: inputs.tradesPerDay,
        [SimInputsKeyField.Trials]: inputs.trials,
        [SimInputsKeyField.VerifiedCumulativePayoutTrigger]:
            inputs.verifiedCumulativePayoutTrigger ?? null,
        [SimInputsKeyField.Winrate]: inputs.winrate,
    };

    const kept: Record<string, unknown> = {};
    for (const field of Object.keys(all)) {
        if (omit.has(field)) continue;
        kept[field] = all[field as SimInputsKeyField];
    }
    return JSON.stringify({ ...kept, ...options?.extra });
}
