import {
    overviewAccountRequestsFor,
    overviewPlanOptInsOf,
    type OverviewRequest,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    type AccountStateEntry,
    type AccountStatus,
    accountSubstateOf,
    type FirmPayoutCount,
    optionalDollars,
    paidPayoutsSinceLastLiveAccountFor,
    type PayoutReadinessAccountOverride,
    personalMaxRiskOf,
    type PersonalRules,
    readPersonalRulesOrNull,
    type StoredFirmId,
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
    readonly paidPayoutsSinceLastLiveAccount: null | number;
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

interface ReadinessBoardAccount extends ReadinessOverrideAccount {
    readonly status: AccountStatus;
}

interface ReadinessBoardInputs {
    readonly overrides: ReadonlyMap<string, MemberPersonalOverride>;
    readonly states: readonly AccountStateEntry[];
}

interface ReadinessOverrideAccount {
    readonly firmId?: null | StoredFirmId;
    readonly id: string;
    readonly personalRules?: unknown;
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
        paidPayoutsSinceLastLiveAccount: input.paidPayoutsSinceLastLiveAccount,
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

export function readinessBoardInputsOf(
    accounts: readonly ReadinessBoardAccount[],
    states: readonly AccountStateEntry[],
    firmCounts: readonly FirmPayoutCount[],
): ReadinessBoardInputs {
    const suspendedIds = new Set(
        accounts
            .filter((account) => accountSubstateOf(account.status) !== null)
            .map((account) => account.id),
    );
    return {
        overrides: readinessOverridesOf(accounts, firmCounts),
        states: states.filter((entry) => !suspendedIds.has(entry.accountId)),
    };
}

export function readinessOverridesOf(
    accounts: readonly ReadinessOverrideAccount[],
    firmCounts: readonly FirmPayoutCount[],
): ReadonlyMap<string, MemberPersonalOverride> {
    return new Map(
        accounts.map((account) => {
            const rules = readPersonalRulesOrNull(account.personalRules);
            return [
                account.id,
                {
                    paidPayoutsSinceLastLiveAccount:
                        account.firmId == null
                            ? null
                            : paidPayoutsSinceLastLiveAccountFor(
                                  firmCounts,
                                  account.firmId,
                              ),
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
