import { type SimInputs } from '~/lib/prop-calculator';

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
    FundedHorizonDays = 'funded',
    FundedReset = 'fundedReset',
    MaxEvalDays = 'max',
    MonthlyDiscount = 'monthly',
    PlanId = 'planId',
    ResetDiscount = 'reset',
    RiskPerTrade = 'risk',
    RrRatio = 'rr',
    Seed = 'seed',
    TradesPerDay = 'tpd',
    Trials = 'trials',
    Winrate = 'winrate',
}

type KeyInputs = Omit<SimInputs, 'plan' | 'riskPerTrade'> &
    Partial<Pick<SimInputs, 'plan' | 'riskPerTrade'>>;

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
        [SimInputsKeyField.Attempts]: inputs.maxAttempts ?? 1,
        [SimInputsKeyField.BundleDiscount]: inputs.discounts?.bundlePercent ?? 0,
        [SimInputsKeyField.Commission]: inputs.commissionPerRoundTrip ?? 0,
        [SimInputsKeyField.CopyAccounts]: inputs.copyAccounts ?? 1,
        [SimInputsKeyField.DayStop]: inputs.dayStop ?? null,
        [SimInputsKeyField.EarlyWithdrawal]:
            inputs.plan?.takesOneTimeEarlyWithdrawal ?? false,
        [SimInputsKeyField.EvalDayPolicy]: inputs.evalDayPolicy ?? null,
        [SimInputsKeyField.EvalDiscount]: inputs.discounts?.evalPercent ?? 0,
        [SimInputsKeyField.FundedHorizonDays]: inputs.fundedHorizonDays,
        [SimInputsKeyField.FundedReset]: inputs.plan?.takesFundedReset ?? false,
        [SimInputsKeyField.MaxEvalDays]: inputs.maxEvalDays,
        [SimInputsKeyField.MonthlyDiscount]:
            inputs.discounts?.monthlySubscriptionPercent ?? 0,
        [SimInputsKeyField.PlanId]: inputs.plan?.id ?? null,
        [SimInputsKeyField.ResetDiscount]: inputs.discounts?.resetPercent ?? 0,
        [SimInputsKeyField.RiskPerTrade]: inputs.riskPerTrade ?? null,
        [SimInputsKeyField.RrRatio]: inputs.rrRatio,
        [SimInputsKeyField.Seed]: inputs.seed,
        [SimInputsKeyField.TradesPerDay]: inputs.tradesPerDay,
        [SimInputsKeyField.Trials]: inputs.trials,
        [SimInputsKeyField.Winrate]: inputs.winrate,
    };

    const kept: Record<string, unknown> = {};
    for (const field of Object.keys(all)) {
        if (omit.has(field)) continue;
        kept[field] = all[field as SimInputsKeyField];
    }
    return JSON.stringify({ ...kept, ...options?.extra });
}
