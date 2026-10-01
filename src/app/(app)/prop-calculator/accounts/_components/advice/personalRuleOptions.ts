import type { OverviewAccountRow } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';

import {
    type PayoutReadinessAccountOverride,
    type PersonalRules,
    readPersonalRulesOrNull,
    type UsdCents,
    usdCentsToDollars,
} from '~/lib/prop-accounts';
import {
    type Dollars,
    dollars,
    findFirm,
    type Plan,
} from '~/lib/prop-calculator';
import {
    createSizingAdvisor,
    type DocumentedPolicySpec,
    InstantFundedEvalAdvisorError,
    type MeasuredRebuyLag,
    type PersonalCaps,
    type ReconstructedAccount,
    ReconstructedLiveKind,
    type RulebookParameters,
    type SizingAdvisor,
    type SizingAdvisorCreateOptions,
} from '~/lib/prop-calculator/advisor';

export enum SizingAdvisorBuildKind {
    NotModeled = 'not-modeled',
    Ready = 'ready',
}

export interface PersonalAdvisorOptionsInput {
    readonly account: ReconstructedAccount;
    readonly measuredRebuyLag: MeasuredRebuyLag | null;
    readonly personalRules: unknown;
    readonly plan: Plan;
    readonly rulebook: RulebookParameters;
    readonly snapshotAsOf: string;
    readonly today: string;
}

export interface PersonalPolicyOverrides {
    readonly payoutRequestOverride: Dollars | null;
    readonly retainedCushionRequest: Dollars | null;
}

export type SizingAdvisorBuild =
    | {
          readonly advisor: SizingAdvisor;
          readonly kind: SizingAdvisorBuildKind.Ready;
      }
    | {
          readonly kind: SizingAdvisorBuildKind.NotModeled;
          readonly reason: string;
      };

export function buildSizingAdvisor(
    account: ReconstructedAccount,
    options: SizingAdvisorCreateOptions,
): SizingAdvisorBuild {
    try {
        return {
            advisor: createSizingAdvisor(account, options),
            kind: SizingAdvisorBuildKind.Ready,
        };
    } catch (error) {
        if (error instanceof InstantFundedEvalAdvisorError) {
            return {
                kind: SizingAdvisorBuildKind.NotModeled,
                reason: error.message,
            };
        }
        throw error;
    }
}

export function optionalDollars(cents: undefined | UsdCents): Dollars | null {
    return cents === undefined ? null : usdCentsToDollars(cents);
}

export function personalAdvisorOptionsOf(
    input: PersonalAdvisorOptionsInput,
): SizingAdvisorCreateOptions {
    const { account, plan } = input;
    const personalRules = readPersonalRulesOrNull(input.personalRules);
    const personalCaps: PersonalCaps = {
        dailyProfitCap: optionalDollars(personalRules?.dailyProfitCapCents),
        maxRiskPerTrade:
            account.kind === ReconstructedLiveKind.Live ||
            account.personalMaxRiskPerTrade == null
                ? null
                : dollars(account.personalMaxRiskPerTrade),
        maxTradesPerDay: personalRules?.maxTradesPerDay ?? null,
    };
    return {
        accountPolicy: findFirm(plan.id.firm)?.accountPolicy,
        measuredRebuyLag: input.measuredRebuyLag,
        personalCaps,
        personalDll: optionalDollars(personalRules?.dailyLossLimitCents),
        personalPayoutOverride: optionalDollars(
            personalRules?.payoutRequestOverrideCents,
        ),
        personalRetainedCushion: optionalDollars(
            personalRules?.retainedCushionCents,
        ),
        rulebook: input.rulebook,
        snapshotAsOf: input.snapshotAsOf,
        today: input.today,
    };
}

export function personalPolicyOverridesOf(
    personalRules: null | PersonalRules,
): PersonalPolicyOverrides {
    return {
        payoutRequestOverride: optionalDollars(
            personalRules?.payoutRequestOverrideCents,
        ),
        retainedCushionRequest: optionalDollars(
            personalRules?.retainedCushionCents,
        ),
    };
}

export function readinessOverridesOf(
    accounts: readonly Pick<OverviewAccountRow, 'id' | 'personalRules'>[],
): ReadonlyMap<string, PayoutReadinessAccountOverride> {
    return new Map(
        accounts.map((account) => {
            const rules = account.personalRules;
            return [
                account.id,
                {
                    personalRequestOverride: optionalDollars(
                        rules?.payoutRequestOverrideCents,
                    ),
                    personalRetainedCushion: optionalDollars(
                        rules?.retainedCushionCents,
                    ),
                },
            ];
        }),
    );
}

export function withPersonalPolicy(
    spec: DocumentedPolicySpec,
    overrides: PersonalPolicyOverrides,
): DocumentedPolicySpec {
    const { payoutRequestOverride, retainedCushionRequest } = overrides;
    if (payoutRequestOverride === null && retainedCushionRequest === null) {
        return spec;
    }
    const { enginePolicy } = spec;
    return {
        ...spec,
        enginePolicy: {
            ...enginePolicy,
            payoutRequestOverride:
                payoutRequestOverride ?? enginePolicy.payoutRequestOverride,
            retainedCushionRequest:
                retainedCushionRequest === null
                    ? enginePolicy.retainedCushionRequest
                    : Math.max(
                          enginePolicy.retainedCushionRequest ?? 0,
                          retainedCushionRequest,
                      ),
        },
    };
}
