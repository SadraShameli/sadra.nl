import { type Dollars, type FirmAccountPolicy } from '~/lib/prop-calculator';
import {
    documentedSizingOf,
    type PersonalCaps,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

import {
    type AccountStateEntry,
    AccountStateKind,
    type AccountStateUnavailableReason,
} from './AccountStates';

export enum ExposureBasis {
    DocumentedDollars = 'documented-dollars',
}

export enum ExposureUnavailableKind {
    LiveNotModeled = 'live-not-modeled',
    Reconstruction = 'reconstruction',
}

export interface AccountExposure {
    readonly accountId: string;
    readonly basis: ExposureBasis;
    readonly cushion: number;
    readonly firstTradeRisk: number;
    readonly maxDailyLoss: number;
    readonly shareOfCushionAtRisk: null | number;
}

export type AccountExposureUnavailableReason =
    | {
          readonly kind: ExposureUnavailableKind.LiveNotModeled;
      }
    | {
          readonly kind: ExposureUnavailableKind.Reconstruction;
          readonly reason: AccountStateUnavailableReason;
      };

export interface CopyGroupExposure {
    readonly accountIds: readonly string[];
    readonly copyGroupId: string;
    readonly leftOutAccountIds: readonly string[];
    readonly maxDailyLoss: number;
    readonly shareOfCushionAtRisk: null | number;
    readonly totalCushion: number;
}

export interface Exposure {
    readonly accounts: readonly AccountExposure[];
    readonly groups: readonly CopyGroupExposure[];
    readonly unavailable: readonly ExposureUnavailableRow[];
}

export interface ExposureEntry extends AccountStateEntry {
    readonly accountPolicy?: FirmAccountPolicy;
    readonly copyGroupId: null | string;
    readonly paidPayoutsSinceLastLiveAccount?: null | number;
    readonly personalCaps?: PersonalCaps;
    readonly personalDll?: Dollars | null;
}

export interface ExposureUnavailableRow {
    readonly accountId: string;
    readonly reason: AccountExposureUnavailableReason;
}

export function exposureOf(
    rulebook: RulebookParameters,
    entries: readonly ExposureEntry[],
): Exposure {
    const accounts: AccountExposure[] = [];
    const unavailable: ExposureUnavailableRow[] = [];
    const membersByGroup = new Map<string, AccountExposure[]>();
    const leftOutByGroup = new Map<string, string[]>();
    const leaveOut = (entry: ExposureEntry) => {
        if (entry.copyGroupId === null) return;
        const leftOut = leftOutByGroup.get(entry.copyGroupId);
        if (leftOut === undefined) {
            leftOutByGroup.set(entry.copyGroupId, [entry.accountId]);
        } else {
            leftOut.push(entry.accountId);
        }
    };
    for (const entry of entries) {
        const { state } = entry;
        if (state.kind === AccountStateKind.Unavailable) {
            unavailable.push({
                accountId: entry.accountId,
                reason: {
                    kind: ExposureUnavailableKind.Reconstruction,
                    reason: state.reason,
                },
            });
            leaveOut(entry);
            continue;
        }
        const { reconstructed } = state.latest;
        if (reconstructed.kind === ReconstructedLiveKind.Live) {
            unavailable.push({
                accountId: entry.accountId,
                reason: { kind: ExposureUnavailableKind.LiveNotModeled },
            });
            leaveOut(entry);
            continue;
        }
        const exposure = accountExposureOf(
            entry.accountId,
            reconstructed,
            rulebook,
            entry,
        );
        accounts.push(exposure);
        if (entry.copyGroupId === null) continue;
        const members = membersByGroup.get(entry.copyGroupId);
        if (members === undefined) {
            membersByGroup.set(entry.copyGroupId, [exposure]);
        } else {
            members.push(exposure);
        }
    }
    const groups = [...membersByGroup].map(([copyGroupId, members]) =>
        copyGroupExposureOf(
            copyGroupId,
            members,
            leftOutByGroup.get(copyGroupId) ?? [],
        ),
    );
    return { accounts, groups, unavailable };
}

function accountExposureOf(
    accountId: string,
    account: ReconstructedFundedOrEvalAccount,
    rulebook: RulebookParameters,
    limits: Pick<
        ExposureEntry,
        | 'accountPolicy'
        | 'paidPayoutsSinceLastLiveAccount'
        | 'personalCaps'
        | 'personalDll'
    >,
): AccountExposure {
    const { sizing } = documentedSizingOf(account, rulebook, {
        ...(limits.accountPolicy !== undefined && {
            accountPolicy: limits.accountPolicy,
        }),
        paidPayoutsSinceLastLiveAccount:
            limits.paidPayoutsSinceLastLiveAccount ?? null,
        personalCaps: limits.personalCaps,
        personalDll: limits.personalDll ?? null,
    });
    const firstTradeRisk = sizing.rungs[0]?.risk ?? 0;
    const maxDailyLoss = sizing.rungs.reduce((sum, rung) => sum + rung.risk, 0);
    return {
        accountId,
        basis: ExposureBasis.DocumentedDollars,
        cushion: account.cushion,
        firstTradeRisk,
        maxDailyLoss,
        shareOfCushionAtRisk: shareOf(maxDailyLoss, account.cushion),
    };
}

function copyGroupExposureOf(
    copyGroupId: string,
    members: readonly AccountExposure[],
    leftOutAccountIds: readonly string[],
): CopyGroupExposure {
    const maxDailyLoss = members.reduce(
        (sum, member) => sum + member.maxDailyLoss,
        0,
    );
    const totalCushion = members.reduce(
        (sum, member) => sum + member.cushion,
        0,
    );
    return {
        accountIds: members.map((member) => member.accountId),
        copyGroupId,
        leftOutAccountIds,
        maxDailyLoss,
        shareOfCushionAtRisk: shareOf(maxDailyLoss, totalCushion),
        totalCushion,
    };
}

function shareOf(amount: number, basis: number): null | number {
    return basis > 0 ? amount / basis : null;
}
