import { exposureUnavailableText } from '~/app/(app)/prop-calculator/accounts/_components/accountStateReasonText';
import { readinessOverridesOf } from '~/app/(app)/prop-calculator/accounts/_components/advice/personalRuleOptions';
import { type CopyGroupRow } from '~/app/(app)/prop-calculator/accounts/_components/copyGroups/copyGroupRows';
import {
    accountStatesForRows,
    ledgerOrDateFailure,
    type OverviewAccountRow,
    type OverviewPayoutRow,
    OverviewSectionStatus,
    type OverviewSnapshotRow,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
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
} from '~/lib/prop-accounts';
import { findFirm } from '~/lib/prop-calculator';
import {
    copyGroupSizing,
    type CopyGroupSizingInput,
    type CopyGroupSizingMember,
    type CopyGroupSizingResult,
    CopyGroupSizingResultKind,
    ReconstructedLiveKind,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

import {
    type CopyGroupSimulationMemberInput,
    type CopyGroupSimulationPlan,
    copyGroupSimulationPlanOf,
} from './copyGroupSimulationModel';

export const COPY_GROUP_LIVE_TRIGGERS_ENFORCED_TEXT =
    "The group size applies each member firm's verified live-account triggers.";

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
    readonly unsizedMembers: readonly UnsizedCopyGroupMember[];
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
    const exposure = exposureOf(
        rulebook,
        accountStates.map((entry): ExposureEntry => {
            const account = accountById.get(entry.accountId);
            return {
                ...entry,
                copyGroupId:
                    account !== undefined && isActiveAccount(account)
                        ? account.copyGroupId
                        : null,
            };
        }),
    );
    const counted = ledgerOrDateFailure(() =>
        firmPayoutCounts(
            PortfolioLedger.fromRows(userId, {
                accounts,
                events,
                fees: [],
                payouts,
            }),
            today,
        ),
    );
    const overrides = readinessOverridesOf(
        accounts,
        counted.kind === OverviewSectionStatus.Ready
            ? counted.value
            : NO_FIRM_PAYOUT_COUNTS,
    );
    const unavailableByAccountId = new Map(
        exposure.unavailable.map((row) => [row.accountId, row.reason]),
    );

    const sections = new Map<string, CopyGroupSizingSection>();
    for (const group of groups) {
        const members: CopyGroupSizingMember[] = [];
        const simulationMembers: CopyGroupSimulationMemberInput[] = [];
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
            const override = overrides.get(member.id);
            members.push({
                account,
                accountPolicy: findFirm(plan.id.firm)?.accountPolicy ?? null,
                id: member.id,
                label: member.label,
                paidPayoutsSinceLastLiveAccount:
                    override?.paidPayoutsSinceLastLiveAccount ?? null,
                personalCaps: override?.personalCaps,
                personalDll: override?.personalDll ?? null,
            });
            simulationMembers.push({
                account,
                id: member.id,
                label: member.label,
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
                    asOf: today,
                    exposure:
                        exposure.groups.find(
                            (row) => row.copyGroupId === group.group.id,
                        ) ?? null,
                    inputs,
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

function unsizedReasonOf(
    account: OverviewAccountRow | undefined,
    reason: AccountExposureUnavailableReason | undefined,
): string {
    return reason === undefined
        ? 'its account state could not be checked'
        : exposureUnavailableText(account, reason);
}
