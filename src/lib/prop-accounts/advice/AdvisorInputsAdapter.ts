import {
    type PersonalRules,
    type UsdCents,
    usdCentsToDollars,
} from '~/lib/prop-accounts/core';
import { rebuyLagDefault, type ReplacementStats } from '~/lib/prop-accounts/metrics';
import { type Dollars } from '~/lib/prop-calculator';
import {
    type PersonalCaps,
    type RebuyLagBasis,
} from '~/lib/prop-calculator/advisor';

export interface AdvisorPersonalInputs {
    readonly payoutRequestOverride: Dollars | null;
    readonly personalCaps: PersonalCaps;
    readonly personalDll: Dollars | null;
    readonly rebuyLagBasis: RebuyLagBasis;
    readonly rebuyLagDays: number;
    readonly retainedCushionRequest: Dollars | null;
}

export function advisorInputsFrom(
    personalRules: PersonalRules,
    replacement: ReplacementStats,
    planSerial: string,
): AdvisorPersonalInputs {
    const lag = rebuyLagDefault(replacement, planSerial);
    return {
        payoutRequestOverride: optionalDollars(
            personalRules.payoutRequestOverrideCents,
        ),
        personalCaps: {
            dailyProfitCap: optionalDollars(
                personalRules.dailyProfitCapCents,
            ),
            maxRiskPerTrade: optionalDollars(
                personalRules.maxRiskPerTradeCents,
            ),
            maxTradesPerDay: personalRules.maxTradesPerDay ?? null,
        },
        personalDll: optionalDollars(personalRules.dailyLossLimitCents),
        rebuyLagBasis: lag.basis,
        rebuyLagDays: lag.days,
        retainedCushionRequest: optionalDollars(
            personalRules.retainedCushionCents,
        ),
    };
}

function optionalDollars(cents: undefined | UsdCents): Dollars | null {
    return cents === undefined ? null : usdCentsToDollars(cents);
}
