import {
    overviewAccountRequestsFor,
    overviewPlanOptInsOf,
    type OverviewRequest,
    type PersonalPolicyOverrides,
    withPersonalPolicy,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    type AccountStage,
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
    findFirm,
    type Plan,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    type AccountPendingPayoutCounts,
    type AccountSnapshotInput,
    createSizingAdvisor,
    dollarsOrNull,
    InstantFundedEvalAdvisorError,
    type MeasuredRebuyLag,
    NO_PERSONAL_CAPS,
    type PersonalCaps,
    type PlanRulesFingerprintCheck,
    type ReconstructedAccount,
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
    readonly policy: PersonalPolicyOverrides;
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
    readonly planRulesFingerprint?: null | PlanRulesFingerprintCheck;
    readonly positionSizing?: SizingAdvisorCreateOptions['positionSizing'];
    readonly rulebook: RulebookParameters;
    readonly snapshotAsOf: string;
    readonly status: AccountStatus;
    readonly today: string;
}

interface PersonalLimitOptions {
    readonly personalCaps: PersonalCaps;
    readonly personalDll: Dollars | null;
    readonly personalPayoutOverride?: Dollars | null;
    readonly personalRetainedCushion?: Dollars | null;
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
    readonly stage: AccountStage;
}

export function accountFromStateRequestOf(input: {
    readonly account: AccountSnapshotInput;
    readonly measuredRebuyLag: MeasuredRebuyLag | null;
    readonly pendingPayoutCounts: AccountPendingPayoutCounts;
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
                pendingPayoutCounts: input.pendingPayoutCounts,
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

export function memberPolicyOverridesOf(
    override: MemberPersonalOverride | undefined,
): PersonalPolicyOverrides {
    return override?.policy ?? personalPolicyOverridesOf(null, null);
}

export function personalAccountRequestOf(
    request: OverviewRequest,
    personalRules: unknown,
    personalMaxRiskPerTrade: Dollars | null,
): OverviewRequest {
    const spec = withPersonalPolicy(
        request.spec,
        personalPolicyOverridesOf(
            readPersonalRulesOrNull(personalRules),
            personalMaxRiskPerTrade,
        ),
    );
    return spec === request.spec ? request : { ...request, spec };
}

export function personalAdvisorOptionsOf(
    input: PersonalAdvisorOptionsInput,
): SizingAdvisorCreateOptions {
    const { account, plan } = input;
    const policy = personalPolicyOverridesOf(
        readPersonalRulesOrNull(input.personalRules),
        reconstructedMaxRiskOf(account),
    );
    return {
        accountPolicy: findFirm(plan.id.firm)?.accountPolicy,
        measuredRebuyLag: input.measuredRebuyLag,
        paidPayoutsSinceLastLiveAccount: input.paidPayoutsSinceLastLiveAccount,
        personalCaps: policy.personalCaps,
        personalDll: policy.personalDll,
        personalPayoutOverride: policy.payoutRequestOverride,
        personalRetainedCushion: policy.retainedCushionRequest,
        ...(input.planRulesFingerprint !== undefined && {
            planRulesFingerprint: input.planRulesFingerprint,
        }),
        positionSizing:
            account.kind === TradingPhase.Eval
                ? null
                : (input.positionSizing ?? null),
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

export function personalPolicyOverridesOfOptions(
    options: PersonalLimitOptions,
): PersonalPolicyOverrides {
    return {
        payoutRequestOverride: options.personalPayoutOverride ?? null,
        personalCaps: options.personalCaps,
        personalDll: options.personalDll,
        retainedCushionRequest: options.personalRetainedCushion ?? null,
    };
}

export function planRulesFingerprintCheckOf(account: {
    readonly currentPlanRulesFingerprint: null | string;
    readonly planRulesFingerprint: null | string;
}): null | PlanRulesFingerprintCheck {
    return account.currentPlanRulesFingerprint === null
        ? null
        : {
              atAdvice: account.planRulesFingerprint,
              current: account.currentPlanRulesFingerprint,
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
            const policy = personalPolicyOverridesOf(
                rules,
                personalMaxRiskOf(rules),
            );
            return [
                account.id,
                {
                    paidPayoutsSinceLastLiveAccount:
                        account.firmId === undefined || account.firmId === null
                            ? null
                            : paidPayoutsSinceLastLiveAccountFor(
                                  firmCounts,
                                  account.firmId,
                              ),
                    personalRequestOverride: policy.payoutRequestOverride,
                    personalRetainedCushion: policy.retainedCushionRequest,
                    policy,
                },
            ];
        }),
    );
}

export function reconstructedMaxRiskOf(
    account: ReconstructedAccount,
): Dollars | null {
    return dollarsOrNull(account.personalMaxRiskPerTrade);
}

function personalPolicyOverridesOf(
    personalRules: null | PersonalRules,
    maxRiskPerTrade: Dollars | null,
): PersonalPolicyOverrides {
    return {
        payoutRequestOverride:
            optionalDollars(personalRules?.payoutRequestOverrideCents) ?? null,
        personalCaps: {
            dailyProfitCap:
                optionalDollars(personalRules?.dailyProfitCapCents) ?? null,
            maxRiskPerTrade,
            maxTradesPerDay: personalRules?.maxTradesPerDay ?? null,
        },
        personalDll:
            optionalDollars(personalRules?.dailyLossLimitCents) ?? null,
        retainedCushionRequest:
            optionalDollars(personalRules?.retainedCushionCents) ?? null,
    };
}
