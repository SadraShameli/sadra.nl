import {
    type CopyGroupWorkerMember,
    type CopyGroupWorkerRequest,
} from '~/app/(app)/prop-calculator/_workers/copyGroupWorkerMessages';
import { overviewPlanOptInsOf } from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    type MemberPersonalOverride,
    withPersonalPolicy,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/personalRuleOptions';
import { errorMessage } from '~/lib/errorMessage';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    CENTS_PER_DOLLAR,
    type Dollars,
    dollars,
    findFirm,
    type Plan,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    type Assumption,
    assumptionText,
    buildEnginePolicy,
    type CopyGroupSizingResult,
    CopyGroupSizingResultKind,
    DEFAULT_FUNDED_HORIZON_DAYS,
    DEFAULT_MAX_EVAL_DAYS,
    type DocumentedPolicySpec,
    type ReconstructedFundedOrEvalAccount,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';
import { startStateOf } from '~/lib/prop-calculator/advisor/value';
import { type CopyGroupSimulationOutputs } from '~/lib/prop-calculator/simulator';

export enum CopyGroupSimulationPlanKind {
    Ready = 'ready',
    Unavailable = 'unavailable',
}

enum CopyGroupFigureKey {
    AllBustSameDay = 'all-bust-same-day',
    AnyBust = 'any-bust',
    DaysToFirstBust = 'days-to-first-bust',
    HorizonCredit = 'horizon-credit',
    RealizedPayout = 'realized-payout',
    ResetFees = 'reset-fees',
}

export interface CopyGroupSimulationMemberInput {
    readonly account: ReconstructedFundedOrEvalAccount;
    readonly id: string;
    readonly label: string;
    readonly override: MemberPersonalOverride | undefined;
    readonly plan: Plan;
}

export type CopyGroupSimulationPlan =
    | {
          readonly assumptions: readonly Assumption[];
          readonly groupRisk: Dollars;
          readonly horizonDays: number;
          readonly kind: CopyGroupSimulationPlanKind.Ready;
          readonly leftOutLabels: readonly string[];
          readonly members: readonly CopyGroupSimulationPlanMember[];
          readonly request: CopyGroupWorkerRequest;
      }
    | {
          readonly kind: CopyGroupSimulationPlanKind.Unavailable;
          readonly reason: string;
      };

export interface CopyGroupSimulationPlanInput {
    readonly leftOutLabels: readonly string[];
    readonly members: readonly CopyGroupSimulationMemberInput[];
    readonly result: CopyGroupSizingResult;
    readonly rulebook: RulebookParameters;
}

export interface CopyGroupSimulationPlanMember {
    readonly id: string;
    readonly label: string;
}

interface CopyGroupBuiltMember {
    readonly assumptions: readonly Assumption[];
    readonly member: CopyGroupWorkerMember;
}

interface CopyGroupFigureRow {
    readonly key: CopyGroupFigureKey;
    readonly label: string;
    readonly note: string;
    readonly value: string;
}

interface DocumentedSpecBuild {
    readonly assumptions: readonly Assumption[];
    readonly spec: DocumentedPolicySpec;
}

export const COPY_GROUP_SIMULATION_SEED = 42;
export const COPY_GROUP_SIMULATION_TRIALS = 5000;

export function copyGroupFigureRowsOf(
    outputs: CopyGroupSimulationOutputs,
    horizonDays: number,
): readonly CopyGroupFigureRow[] {
    const rows: CopyGroupFigureRow[] = [
        {
            key: CopyGroupFigureKey.AnyBust,
            label: 'At least one account busts',
            note: 'The share of trials in which any account of the group busts inside the horizon.',
            value: withStandardError(
                formatPercent(outputs.pAnyBust.value),
                formatPercent(outputs.pAnyBust.standardError),
            ),
        },
        {
            key: CopyGroupFigureKey.AllBustSameDay,
            label: 'Every account busts on the same day',
            note: 'The share of trials in which all accounts bust together on one day: the copied loss that takes the whole group out at once.',
            value: withStandardError(
                formatPercent(outputs.pAllBustSameDay.value),
                formatPercent(outputs.pAllBustSameDay.standardError),
            ),
        },
        {
            key: CopyGroupFigureKey.RealizedPayout,
            label: 'Payouts the group receives',
            note: `Expected cash received after the profit split, summed over every account across ${String(horizonDays)} days.`,
            value: withStandardError(
                formatCurrency(outputs.expectedRealizedGroupPayout.value),
                formatCurrency(
                    outputs.expectedRealizedGroupPayout.standardError,
                ),
            ),
        },
        {
            key: CopyGroupFigureKey.HorizonCredit,
            label: 'End-of-horizon credit (not cash)',
            note: 'What the accounts still alive at the horizon could request, one capped request each. Reported apart from the cash above: it is not cash received.',
            value: withStandardError(
                formatCurrency(outputs.expectedGroupHorizonCredit.value),
                formatCurrency(
                    outputs.expectedGroupHorizonCredit.standardError,
                ),
            ),
        },
    ];
    if (outputs.expectedGroupResetFees.value > 0) {
        rows.push({
            key: CopyGroupFigureKey.ResetFees,
            label: 'Funded reset fees',
            note: 'Expected fees paid to reset accounts that hit their drawdown, summed over the group.',
            value: withStandardError(
                formatCurrency(outputs.expectedGroupResetFees.value),
                formatCurrency(outputs.expectedGroupResetFees.standardError),
            ),
        });
    }
    const firstBust = outputs.expectedDaysToFirstBustGivenBust;
    rows.push({
        key: CopyGroupFigureKey.DaysToFirstBust,
        label: 'Days until the first bust',
        note: 'Counted only in trials where at least one account busts.',
        value:
            firstBust === null
                ? 'No account busted in any trial'
                : withStandardError(
                      daysText(firstBust.value),
                      firstBust.standardError === null
                          ? null
                          : daysText(firstBust.standardError),
                  ),
    });
    return rows;
}

export function copyGroupSimulationPlanOf(
    input: CopyGroupSimulationPlanInput,
): CopyGroupSimulationPlan {
    const { leftOutLabels, members, result, rulebook } = input;
    if (result.kind !== CopyGroupSizingResultKind.Sized) {
        return unavailable(result.rejection.message);
    }
    const groupRisk = result.sizing.rungs[0]?.risk;
    if (groupRisk === undefined) {
        return unavailable(
            'The group has no documented size to simulate at yet.',
        );
    }
    const groupRiskCents = Math.round(groupRisk * CENTS_PER_DOLLAR);
    try {
        const built = members.map((member) =>
            workerMemberOf(member, rulebook, groupRiskCents),
        );
        return {
            assumptions: uniqueAssumptionsOf(
                built.flatMap(({ assumptions }) => assumptions),
            ),
            groupRisk,
            horizonDays: DEFAULT_FUNDED_HORIZON_DAYS,
            kind: CopyGroupSimulationPlanKind.Ready,
            leftOutLabels,
            members: members.map(({ id, label }) => ({ id, label })),
            request: {
                members: built.map(({ member }) => member),
                seed: COPY_GROUP_SIMULATION_SEED,
                trials: COPY_GROUP_SIMULATION_TRIALS,
            },
        };
    } catch (error) {
        return unavailable(errorMessage(error));
    }
}

function daysText(days: number): string {
    return `${days.toFixed(1)} d`;
}

function documentedSpecOf(
    member: CopyGroupSimulationMemberInput,
    rulebook: RulebookParameters,
    groupRiskCents: number,
): DocumentedSpecBuild {
    const { plan } = member;
    const { assumptions, policy } = buildEnginePolicy({
        accountPolicy: findFirm(plan.id.firm)?.accountPolicy,
        fundedHorizonDays: DEFAULT_FUNDED_HORIZON_DAYS,
        measuredRebuyLag: null,
        plan,
        positionSizing: null,
        rulebook,
    });
    const { funded } = rulebook;
    const spec = withPersonalPolicy(
        {
            enginePolicy: policy,
            planSerial: serializePlanId(plan.id),
            rulebook: {
                ...rulebook,
                funded: {
                    ...funded,
                    riskCents: groupRiskCents,
                    takeProfitCents: Math.round(
                        (groupRiskCents * funded.takeProfitCents) /
                            funded.riskCents,
                    ),
                },
            },
            run: {
                maxEvalDays: DEFAULT_MAX_EVAL_DAYS,
                seed: COPY_GROUP_SIMULATION_SEED,
                trials: COPY_GROUP_SIMULATION_TRIALS,
            },
        },
        {
            payoutRequestOverride: dollarsOrNull(
                member.override?.personalRequestOverride,
            ),
            personalCaps: member.override?.personalCaps,
            personalDll: member.override?.personalDll,
            retainedCushionRequest: dollarsOrNull(
                member.override?.personalRetainedCushion,
            ),
        },
    );
    return { assumptions, spec };
}

function dollarsOrNull(amount: null | number | undefined): Dollars | null {
    return amount === null || amount === undefined ? null : dollars(amount);
}

function unavailable(reason: string): CopyGroupSimulationPlan {
    return { kind: CopyGroupSimulationPlanKind.Unavailable, reason };
}

function uniqueAssumptionsOf(
    assumptions: readonly Assumption[],
): readonly Assumption[] {
    const byText = new Map<string, Assumption>();
    for (const assumption of assumptions) {
        const text = assumptionText(assumption);
        if (!byText.has(text)) byText.set(text, assumption);
    }
    return byText.values().toArray();
}

function withStandardError(
    value: string,
    standardError: null | string,
): string {
    return standardError === null ? value : `${value} (± ${standardError})`;
}

function workerMemberOf(
    member: CopyGroupSimulationMemberInput,
    rulebook: RulebookParameters,
    groupRiskCents: number,
): CopyGroupBuiltMember {
    const { plan } = member;
    const { assumptions, spec } = documentedSpecOf(
        member,
        rulebook,
        groupRiskCents,
    );
    return {
        assumptions,
        member: {
            firmId: plan.id.firm,
            id: member.id,
            optIns: overviewPlanOptInsOf(plan),
            planSerial: serializePlanId(plan.id),
            spec,
            start: startStateOf(plan, member.account),
        },
    };
}
