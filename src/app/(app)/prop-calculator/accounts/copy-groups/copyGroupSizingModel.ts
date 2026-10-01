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
    AccountStateUnavailableKind,
    type AccountStateUnavailableReason,
    type CopyGroupExposure,
    describeUnresolvedPlan,
    type ExposureEntry,
    exposureOf,
    ExposureUnavailableKind,
    isActiveAccount,
    type LedgerEventRow,
} from '~/lib/prop-accounts';
import {
    copyGroupSizing,
    type CopyGroupSizingMember,
    type CopyGroupSizingResult,
    CopyGroupSizingResultKind,
    ReconstructedLiveKind,
    ReconstructionErrorReason,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

export interface CopyGroupSizingSection {
    readonly asOf: string;
    readonly exposure: CopyGroupExposure | null;
    readonly result: CopyGroupSizingResult;
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
    const unavailableByAccountId = new Map(
        exposure.unavailable.map((row) => [row.accountId, row.reason]),
    );

    const sections = new Map<string, CopyGroupSizingSection>();
    for (const group of groups) {
        const members: CopyGroupSizingMember[] = [];
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
            members.push({
                account: state.state.latest.reconstructed,
                id: member.id,
                label: member.label,
            });
        }
        sections.set(group.group.id, {
            asOf: today,
            exposure:
                exposure.groups.find(
                    (row) => row.copyGroupId === group.group.id,
                ) ?? null,
            result: copyGroupSizing({ members, rulebook }),
            unsizedMembers,
        });
    }
    return sections;
}

function reconstructionErrorText(reason: ReconstructionErrorReason): string {
    switch (reason) {
        case ReconstructionErrorReason.EodPeakRequired: {
            return 'its EOD-trailing drawdown needs the highest EOD balance on the snapshot';
        }
        case ReconstructionErrorReason.IntradayPeakRequired: {
            return 'its intraday-trailing drawdown needs the highest intraday balance on the snapshot';
        }
    }
}

function reconstructionReasonText(
    account: OverviewAccountRow | undefined,
    reason: AccountStateUnavailableReason,
): string {
    switch (reason.kind) {
        case AccountStateUnavailableKind.ImplausibleSnapshot: {
            return reason.issues
                .map((issue) => issue.message.replace(/\.+$/, ''))
                .join('; ');
        }
        case AccountStateUnavailableKind.LedgerOnly: {
            return 'it is a ledger-only account with no state to reconstruct';
        }
        case AccountStateUnavailableKind.NoSnapshot: {
            return 'it has no snapshot yet';
        }
        case AccountStateUnavailableKind.ReconstructionError: {
            return reconstructionErrorText(reason.reason);
        }
        case AccountStateUnavailableKind.UnresolvedPlan: {
            return account === undefined
                ? 'its plan could not be resolved'
                : describeUnresolvedPlan(
                      {
                          ...account,
                          firmId: account.firmId ?? 'unknown',
                          planSerial: account.planSerial ?? 'unknown',
                      },
                      reason.reason,
                  );
        }
    }
}

function unsizedReasonOf(
    account: OverviewAccountRow | undefined,
    reason: AccountExposureUnavailableReason | undefined,
): string {
    if (reason === undefined) return 'its account state could not be checked';
    switch (reason.kind) {
        case ExposureUnavailableKind.LiveNotModeled: {
            return 'sizing is not modeled yet for live accounts';
        }
        case ExposureUnavailableKind.Reconstruction: {
            return reconstructionReasonText(account, reason.reason);
        }
    }
}
