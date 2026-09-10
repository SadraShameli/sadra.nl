import { type SimInputs } from '~/lib/prop-calculator';

export enum SimInputsKeyField {
    ActivationDiscount = 'act',
    Attempts = 'attempts',
    Commission = 'commission',
    CopyAccounts = 'copy',
    DayStop = 'dayStop',
    EvalDayPolicy = 'evalDayPolicy',
    EvalDiscount = 'eval',
    FundedHorizonDays = 'funded',
    MaxEvalDays = 'max',
    PlanId = 'planId',
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
        [SimInputsKeyField.Commission]: inputs.commissionPerRoundTrip ?? 0,
        [SimInputsKeyField.CopyAccounts]: inputs.copyAccounts ?? 1,
        [SimInputsKeyField.DayStop]: inputs.dayStop ?? null,
        [SimInputsKeyField.EvalDayPolicy]: inputs.evalDayPolicy ?? null,
        [SimInputsKeyField.EvalDiscount]: inputs.discounts?.evalPercent ?? 0,
        [SimInputsKeyField.FundedHorizonDays]: inputs.fundedHorizonDays,
        [SimInputsKeyField.MaxEvalDays]: inputs.maxEvalDays,
        [SimInputsKeyField.PlanId]: inputs.plan?.id ?? null,
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
