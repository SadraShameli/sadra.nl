import {
    overviewAccountRequestsFor,
    overviewPlanOptInsOf,
    type OverviewRequest,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    type AccountStatus,
    accountSubstateOf,
    optionalDollars,
    type PayoutReadinessAccountOverride,
    personalMaxRiskOf,
    type PersonalRules,
    readPersonalRulesOrNull,
} from '~/lib/prop-accounts';
import {
    type Dollars,
    dollars,
    findFirm,
    type Plan,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    type AccountSnapshotInput,
    createSizingAdvisor,
    type DocumentedPolicySpec,
    hasPersonalCaps,
    InstantFundedEvalAdvisorError,
    type MeasuredRebuyLag,
    NO_PERSONAL_CAPS,
    type PersonalCaps,
    type ReconstructedAccount,
    ReconstructedLiveKind,
    type RulebookParameters,
    type SizingAdvisor,
    type SizingAdvisorCreateOptions,
} from '~/lib/prop-calculator/advisor';

import { type PersonalLimits } from './adviceViewModel';

export enum SizingAdvisorBuildKind {
    NotModeled = 'not-modeled',
    Ready = 'ready',
}

export interface MemberPersonalOverride extends PayoutReadinessAccountOverride {
    readonly personalCaps: PersonalCaps;
    readonly personalDll: Dollars | null;
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

interface PersonalAdvisorOptionsInput {
    readonly account: ReconstructedAccount;
    readonly measuredRebuyLag: MeasuredRebuyLag | null;
    readonly personalRules: unknown;
    readonly plan: Plan;
    readonly rulebook: RulebookParameters;
    readonly snapshotAsOf: string;
    readonly status: AccountStatus;
    readonly today: string;
}

interface PersonalPolicyOverrides {
    readonly payoutRequestOverride: Dollars | null;
    readonly personalCaps?: PersonalCaps;
    readonly personalDll?: Dollars | null;
    readonly retainedCushionRequest: Dollars | null;
}

export function accountFromStateRequestOf(input: {
    readonly account: AccountSnapshotInput;
    readonly measuredRebuyLag: MeasuredRebuyLag | null;
    readonly personalMaxRiskPerTrade: Dollars | null;
    readonly personalRules: unknown;
    readonly plan: Plan;
    readonly rulebook: RulebookParameters;
}): OverviewRequest | undefined {
    const { plan } = input;
    const [request] = overviewAccountRequestsFor(
        [
            {
                account: input.account,
                firmId: plan.id.firm,
                measuredRebuyLag: input.measuredRebuyLag,
                optIns: overviewPlanOptInsOf(plan),
                planSerial: serializePlanId(plan.id),
            },
        ],
        input.rulebook,
    );
    return request === undefined
        ? undefined
        : personalAccountRequestOf(
              request,
              input.personalRules,
              input.personalMaxRiskPerTrade,
          );
}

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

export function personalAccountRequestOf(
    request: OverviewRequest,
    personalRules: unknown,
    personalMaxRiskPerTrade: Dollars | null,
): OverviewRequest {
    const overrides = personalPolicyOverridesOf(
        readPersonalRulesOrNull(personalRules),
        personalMaxRiskPerTrade,
    );
    const spec = withPersonalPolicy(request.spec, overrides);
    return spec === request.spec ? request : { ...request, spec };
}

export function personalAdvisorOptionsOf(
    input: PersonalAdvisorOptionsInput,
): SizingAdvisorCreateOptions {
    const { account, plan } = input;
    const personalRules = readPersonalRulesOrNull(input.personalRules);
    return {
        accountPolicy: findFirm(plan.id.firm)?.accountPolicy,
        measuredRebuyLag: input.measuredRebuyLag,
        personalCaps: personalCapsOf(
            personalRules,
            account.kind === ReconstructedLiveKind.Live ||
                account.personalMaxRiskPerTrade == null
                ? null
                : dollars(account.personalMaxRiskPerTrade),
        ),
        personalDll:
            optionalDollars(personalRules?.dailyLossLimitCents) ?? null,
        personalPayoutOverride:
            optionalDollars(personalRules?.payoutRequestOverrideCents) ?? null,
        personalRetainedCushion:
            optionalDollars(personalRules?.retainedCushionCents) ?? null,
        rulebook: input.rulebook,
        snapshotAsOf: input.snapshotAsOf,
        substate: accountSubstateOf(input.status),
        today: input.today,
    };
}

export function personalLimitsOf(
    options: Pick<SizingAdvisorCreateOptions, 'personalCaps' | 'personalDll'>,
): PersonalLimits {
    return {
        caps: options.personalCaps ?? NO_PERSONAL_CAPS,
        dailyLossLimit: options.personalDll ?? null,
    };
}

export function readinessOverridesOf(
    accounts: readonly {
        readonly id: string;
        readonly personalRules?: unknown;
    }[],
): ReadonlyMap<string, MemberPersonalOverride> {
    return new Map(
        accounts.map((account) => {
            const rules = readPersonalRulesOrNull(account.personalRules);
            return [
                account.id,
                {
                    personalCaps: personalCapsOf(
                        rules,
                        personalMaxRiskOf(rules),
                    ),
                    personalDll:
                        optionalDollars(rules?.dailyLossLimitCents) ?? null,
                    personalRequestOverride:
                        optionalDollars(rules?.payoutRequestOverrideCents) ??
                        null,
                    personalRetainedCushion:
                        optionalDollars(rules?.retainedCushionCents) ?? null,
                },
            ];
        }),
    );
}

export function withPersonalPolicy(
    spec: DocumentedPolicySpec,
    overrides: PersonalPolicyOverrides,
): DocumentedPolicySpec {
    const {
        payoutRequestOverride,
        personalCaps,
        personalDll,
        retainedCushionRequest,
    } = overrides;
    const hasCaps = hasPersonalCaps(personalCaps);
    const hasDll = personalDll !== null && personalDll !== undefined;
    if (
        payoutRequestOverride === null &&
        retainedCushionRequest === null &&
        !hasCaps &&
        !hasDll
    ) {
        return spec;
    }
    const { enginePolicy } = spec;
    return {
        ...spec,
        enginePolicy: {
            ...enginePolicy,
            ...(hasCaps && { personalCaps }),
            ...(hasDll && { personalDll }),
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

function personalCapsOf(
    personalRules: null | PersonalRules,
    maxRiskPerTrade: Dollars | null,
): PersonalCaps {
    return {
        dailyProfitCap:
            optionalDollars(personalRules?.dailyProfitCapCents) ?? null,
        maxRiskPerTrade,
        maxTradesPerDay: personalRules?.maxTradesPerDay ?? null,
    };
}

function personalPolicyOverridesOf(
    personalRules: null | PersonalRules,
    maxRiskPerTrade: Dollars | null,
): PersonalPolicyOverrides {
    return {
        payoutRequestOverride:
            optionalDollars(personalRules?.payoutRequestOverrideCents) ?? null,
        personalCaps: personalCapsOf(personalRules, maxRiskPerTrade),
        personalDll:
            optionalDollars(personalRules?.dailyLossLimitCents) ?? null,
        retainedCushionRequest:
            optionalDollars(personalRules?.retainedCushionCents) ?? null,
    };
}
