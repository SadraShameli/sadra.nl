import { exposureUnavailableText } from '~/app/(app)/prop-calculator/accounts/_components/accountStateReasonText';
import { readinessOverridesOf } from '~/app/(app)/prop-calculator/accounts/_components/advice/personalRuleOptions';
import { type CopyGroupRow } from '~/app/(app)/prop-calculator/accounts/_components/copyGroups/copyGroupRows';
import {
    accountStatesForRows,
    type OverviewAccountRow,
    type OverviewPayoutRow,
    type OverviewSnapshotRow,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    type AccountExposureUnavailableReason,
    AccountStateKind,
    type CopyGroupExposure,
    type ExposureEntry,
    exposureOf,
    isActiveAccount,
    type LedgerEventRow,
} from '~/lib/prop-accounts';
import {
    copyGroupSizing,
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

export interface CopyGroupSizingSection {
    readonly asOf: string;
    readonly exposure: CopyGroupExposure | null;
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
    const overrides = readinessOverridesOf(accounts);
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
            members.push({ account, id: member.id, label: member.label });
            simulationMembers.push({
                account,
                id: member.id,
                label: member.label,
                override: overrides.get(member.id),
                plan: state.state.plan,
            });
        }
        const result = copyGroupSizing({ members, rulebook });
        sections.set(group.group.id, {
            asOf: today,
            exposure:
                exposure.groups.find(
                    (row) => row.copyGroupId === group.group.id,
                ) ?? null,
            result,
            simulation: copyGroupSimulationPlanOf({
                leftOutLabels: unsizedMembers.map((member) => member.label),
                members: simulationMembers,
                result,
                rulebook,
            }),
            unsizedMembers,
        });
    }
    return sections;
}

function unsizedReasonOf(
    account: OverviewAccountRow | undefined,
    reason: AccountExposureUnavailableReason | undefined,
): string {
    return reason === undefined
        ? 'its account state could not be checked'
        : exposureUnavailableText(account, reason);
}
