import { payoutBlockReasonText } from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerModel';
import { exposureUnavailableText } from '~/app/(app)/prop-calculator/accounts/_components/accountStateReasonText';
import { readinessOverridesOf } from '~/app/(app)/prop-calculator/accounts/_components/advice/personalRuleOptions';
import { type CopyGroupRow } from '~/app/(app)/prop-calculator/accounts/_components/copyGroups/copyGroupRows';
import { measuredRebuyLagFromStats } from '~/app/(app)/prop-calculator/accounts/_components/measuredRebuyLag';
import {
    accountStatesForRows,
    ledgerOrDateFailure,
    type OverviewAccountRow,
    type OverviewPayoutRow,
    OverviewSectionStatus,
    type OverviewSnapshotRow,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { formatConjunctionList, formatCurrency } from '~/lib/format';
import {
    type AccountExposureUnavailableReason,
    AccountStateKind,
    type CopyGroupExposure,
    type ExposureEntry,
    exposureOf,
    firmPayoutCounts,
    isActiveAccount,
    type LedgerEventRow,
    NO_FIRM_PAYOUT_COUNTS,
    PortfolioLedger,
    replacementStats,
} from '~/lib/prop-accounts';
import {
    DayStopRuleKind,
    findFirm,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    type CopyGroupPayoutCountBlock,
    copyGroupSizing,
    type CopyGroupSizingInput,
    type CopyGroupSizingMember,
    type CopyGroupSizingResult,
    CopyGroupSizingResultKind,
    type DailyProfitCap,
    DailyProfitCapKind,
    type DocumentedSizing,
    isSnapshotStale,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
    type RulebookParameters,
    SIZING_CONSTRAINT_TEXT,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

import {
    type CopyGroupSimulationMemberInput,
    type CopyGroupSimulationPlan,
    copyGroupSimulationPlanOf,
} from './copyGroupSimulationModel';

export const COPY_GROUP_LIVE_TRIGGERS_ENFORCED_TEXT =
    "The group size applies each member firm's verified live-account triggers.";

export const COPY_GROUP_PAYOUT_COUNT_CONCURRENT_TEXT =
    'This counts the members ready to request a payout, with no request pending, as filing together.';

export const COPY_GROUP_PAYOUT_COUNT_NOT_CHECKED_TEXT =
    "Firm payout limit not checked: the firm's paid payout count is unknown for this group, so whether the members filing together would reach the verified firm limit was not checked.";

export const COPY_GROUP_LIVE_TRIGGERS_NOT_CHECKED_TEXT =
    "Live triggers not checked: this group's firm rules for moving an account live are not all verified here, or its firm-wide payout count is unknown, so the group size may be one the firm moves live.";

export type CopyGroupPositionSizing = NonNullable<
    CopyGroupSizingInput['positionSizing']
>;

export interface CopyGroupSizingInputs {
    readonly leftOutLabels: readonly string[];
    readonly members: readonly CopyGroupSizingMember[];
    readonly rulebook: RulebookParameters;
    readonly simulationMembers: readonly CopyGroupSimulationMemberInput[];
}

export interface CopyGroupSizingSection {
    readonly asOf: string;
    readonly exposure: CopyGroupExposure | null;
    readonly inputs: CopyGroupSizingInputs;
    readonly result: CopyGroupSizingResult;
    readonly simulation: CopyGroupSimulationPlan;
    readonly staleMembers: readonly StaleCopyGroupMember[];
    readonly unsizedMembers: readonly UnsizedCopyGroupMember[];
}

export interface StaleCopyGroupMember {
    readonly asOf: string;
    readonly label: string;
    readonly memberId: string;
}

export interface UnsizedCopyGroupMember {
    readonly label: string;
    readonly memberId: string;
    readonly reason: string;
}

export function bindingMemberIdsOf(
    result: CopyGroupSizingResult,
): readonly string[] {
    if (result.kind !== CopyGroupSizingResultKind.Sized) return [];
    const divergentAtFirstRung = new Set(
        result.divergences
            .filter((divergence) => divergence.rungIndex === 0)
            .map((divergence) => divergence.memberId),
    );
    return result.memberIds.filter((id) => !divergentAtFirstRung.has(id));
}

export function copyGroupPayoutCountBlockText(
    block: CopyGroupPayoutCountBlock,
    labelOf: (memberId: string) => string,
): string {
    return `Requesting from ${formatConjunctionList(block.memberIds.map(labelOf))} together: ${payoutBlockReasonText(block.reason)}.`;
}

export function copyGroupRuleTermsOf(
    sizing: DocumentedSizing,
): readonly string[] {
    const { dailyProfitCap, maxTrades, profitCeiling, stopRule } = sizing;
    return [
        ...(dailyProfitCap === null
            ? []
            : [dailyProfitCapTermOf(dailyProfitCap)]),
        ...(profitCeiling === null
            ? []
            : [
                  `Profit ceiling today: ${formatCurrency(profitCeiling.amount, 2)}. ${SIZING_CONSTRAINT_TEXT[profitCeiling.constraint]}`,
              ]),
        `At most ${String(maxTrades)} ${maxTrades === 1 ? 'trade' : 'trades'} a day.`,
        stopRuleTermOf(stopRule),
    ];
}

export function copyGroupSizingSectionsOf(
    rulebook: RulebookParameters,
    userId: string,
    today: string,
    accounts: readonly OverviewAccountRow[],
    events: readonly LedgerEventRow[],
    payouts: readonly OverviewPayoutRow[],
    snapshots: readonly OverviewSnapshotRow[],
    groups: readonly CopyGroupRow[],
): ReadonlyMap<string, CopyGroupSizingSection> {
    const accountStates = accountStatesForRows(
        userId,
        today,
        accounts,
        events,
        payouts,
        snapshots,
    );
    const stateByAccountId = new Map(
        accountStates.map((entry) => [entry.accountId, entry]),
    );
    const accountById = new Map(
        accounts.map((account) => [account.id, account]),
    );
    const ledger = ledgerOrDateFailure(() => {
        const portfolio = PortfolioLedger.fromRows(userId, {
            accounts,
            events,
            fees: [],
            payouts,
        });
        return {
            firmCounts: firmPayoutCounts(portfolio, today),
            replacements: replacementStats(portfolio),
        };
    });
    const ledgerFigures =
        ledger.kind === OverviewSectionStatus.Ready ? ledger.value : null;
    const overrides = readinessOverridesOf(
        accounts,
        ledgerFigures?.firmCounts ?? NO_FIRM_PAYOUT_COUNTS,
    );
    const exposure = exposureOf(
        rulebook,
        accountStates.map((entry): ExposureEntry => {
            const account = accountById.get(entry.accountId);
            const override = overrides.get(entry.accountId);
            return {
                ...entry,
                accountPolicy:
                    entry.state.kind === AccountStateKind.Reconstructed
                        ? findFirm(entry.state.plan.id.firm)?.accountPolicy
                        : undefined,
                copyGroupId:
                    account !== undefined && isActiveAccount(account)
                        ? account.copyGroupId
                        : null,
                paidPayoutsSinceLastLiveAccount:
                    override?.paidPayoutsSinceLastLiveAccount ?? null,
                personalCaps: override?.policy.personalCaps,
                personalDll: override?.policy.personalDll ?? null,
            };
        }),
    );
    const unavailableByAccountId = new Map(
        exposure.unavailable.map((row) => [row.accountId, row.reason]),
    );

    const sections = new Map<string, CopyGroupSizingSection>();
    for (const group of groups) {
        const members: CopyGroupSizingMember[] = [];
        const memberDates: string[] = [];
        const simulationMembers: CopyGroupSimulationMemberInput[] = [];
        const staleMembers: StaleCopyGroupMember[] = [];
        const unsizedMembers: UnsizedCopyGroupMember[] = [];
        for (const member of group.members) {
            const state = stateByAccountId.get(member.id);
            const unavailable = unavailableByAccountId.get(member.id);
            if (
                unavailable !== undefined ||
                state?.state.kind !== AccountStateKind.Reconstructed ||
                state.state.latest.reconstructed.kind ===
                    ReconstructedLiveKind.Live
            ) {
                unsizedMembers.push({
                    label: member.label,
                    memberId: member.id,
                    reason: unsizedReasonOf(
                        accountById.get(member.id),
                        unavailable,
                    ),
                });
                continue;
            }
            const account = state.state.latest.reconstructed;
            const { plan } = state.state;
            const { asOf } = state.state.latest;
            const override = overrides.get(member.id);
            memberDates.push(asOf);
            if (
                isSnapshotStale(
                    sizingStageOf(account),
                    asOf,
                    today,
                    rulebook.review.fundedStaleDays,
                )
            ) {
                staleMembers.push({
                    asOf,
                    label: member.label,
                    memberId: member.id,
                });
            }
            members.push({
                account,
                accountPolicy: findFirm(plan.id.firm)?.accountPolicy ?? null,
                id: member.id,
                label: member.label,
                paidPayoutsSinceLastLiveAccount:
                    override?.paidPayoutsSinceLastLiveAccount ?? null,
                personalCaps: override?.policy.personalCaps,
                personalDll: override?.policy.personalDll ?? null,
                personalRequestOverride:
                    override?.policy.payoutRequestOverride ?? null,
                personalRetainedCushion:
                    override?.policy.retainedCushionRequest ?? null,
            });
            simulationMembers.push({
                account,
                id: member.id,
                label: member.label,
                measuredRebuyLag:
                    ledgerFigures === null
                        ? null
                        : measuredRebuyLagFromStats(
                              ledgerFigures.replacements,
                              serializePlanId(plan.id),
                          ),
                override,
                plan,
            });
        }
        const inputs: CopyGroupSizingInputs = {
            leftOutLabels: unsizedMembers.map((member) => member.label),
            members,
            rulebook,
            simulationMembers,
        };
        sections.set(
            group.group.id,
            withPositionSizing(
                {
                    asOf: oldestDateOf(memberDates) ?? today,
                    exposure:
                        exposure.groups.find(
                            (row) => row.copyGroupId === group.group.id,
                        ) ?? null,
                    inputs,
                    staleMembers,
                    unsizedMembers,
                },
                null,
            ),
        );
    }
    return sections;
}

export function withPositionSizing(
    section: Omit<CopyGroupSizingSection, 'result' | 'simulation'>,
    positionSizing: CopyGroupPositionSizing | null,
): CopyGroupSizingSection {
    const { inputs } = section;
    const result = copyGroupSizing({
        members: inputs.members,
        positionSizing,
        rulebook: inputs.rulebook,
    });
    return {
        ...section,
        result,
        simulation: copyGroupSimulationPlanOf({
            leftOutLabels: inputs.leftOutLabels,
            members: inputs.simulationMembers,
            result,
            rulebook: inputs.rulebook,
        }),
    };
}

function dailyProfitCapTermOf(cap: DailyProfitCap): string {
    switch (cap.kind) {
        case DailyProfitCapKind.HardCeiling: {
            return `Daily profit ceiling: ${formatCurrency(cap.ceiling, 2)}.`;
        }
        case DailyProfitCapKind.StopTrigger: {
            return `Daily stop trigger: ${formatCurrency(cap.stopAfter, 2)}.`;
        }
    }
}

function oldestDateOf(dates: readonly string[]): null | string {
    return dates.reduce<null | string>(
        (oldest, date) => (oldest === null || date < oldest ? date : oldest),
        null,
    );
}

function sizingStageOf(
    account: ReconstructedFundedOrEvalAccount,
): SizingStage.Eval | SizingStage.Funded {
    return account.kind === TradingPhase.Funded
        ? SizingStage.Funded
        : SizingStage.Eval;
}

function stopRuleTermOf(rule: DocumentedSizing['stopRule']): string {
    switch (rule.kind) {
        case DayStopRuleKind.AfterKLosses: {
            return `Stop rule: stop after ${String(rule.k)} ${rule.k === 1 ? 'loss' : 'losses'}.`;
        }
        case DayStopRuleKind.AfterTarget: {
            return `Stop rule: stop after ${formatCurrency(rule.dollars, 2)} of profit.`;
        }
        case DayStopRuleKind.DayGreen: {
            return 'Stop rule: stop once the day is green.';
        }
        case DayStopRuleKind.FirstWin: {
            return 'Stop rule: stop after the first win.';
        }
        case DayStopRuleKind.None: {
            return 'Stop rule: none.';
        }
    }
}

function unsizedReasonOf(
    account: OverviewAccountRow | undefined,
    reason: AccountExposureUnavailableReason | undefined,
): string {
    return reason === undefined
        ? 'its account state could not be checked'
        : exposureUnavailableText(account, reason);
}
