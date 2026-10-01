import { type AccountListAccount } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    AccountStage,
    AccountTracking,
    type ExclusivityAccount,
    isConfirmedPolicySource,
    LiveExclusivityAction,
    liveExclusivityEffectsOf,
    PlanKeyResolutionKind,
    resolvePlanKey,
    trackedAccountOf,
    type TrackedAccountRow,
} from '~/lib/prop-accounts';
import {
    findFirm,
    type FirmId,
    parseFirmId,
    type Plan,
} from '~/lib/prop-calculator';

export interface LiveExclusivityPreview {
    readonly confirmedAccountIds: readonly string[];
    readonly effects: readonly LiveExclusivityPreviewEffect[];
    readonly lines: readonly string[];
    readonly title: string;
}

export interface LiveExclusivityPreviewEffect {
    readonly accountId: string;
    readonly action: LiveExclusivityAction;
    readonly label: string;
}

export type LivePreviewAccount = Pick<
    AccountListAccount,
    | 'accountSize'
    | 'archivedAt'
    | 'externalFirmId'
    | 'firmId'
    | 'id'
    | 'label'
    | 'optIns'
    | 'planLabel'
    | 'planSerial'
    | 'readIssues'
    | 'stage'
    | 'status'
    | 'tracking'
>;

type PreviewRow = TrackedAccountRow<LivePreviewAccount>;

const HOUSEHOLD_LINE =
    "The firm's rules also reach accounts held by others in your household; those are not tracked here and are not changed.";

export function liveExclusivityPreviewOf(
    accounts: readonly LivePreviewAccount[],
    movedLiveAccountId: string,
): LiveExclusivityPreview | null {
    const rows = accounts.map((account) => trackedAccountOf(account));
    const moved = rows.find((row) => row.id === movedLiveAccountId);
    if (moved === undefined) return null;
    const movedPlan = resolvedPlanOf(moved);
    const firm = movedPlan === null ? undefined : findFirm(movedPlan.id.firm);
    if (movedPlan === null || firm === undefined) return null;
    const policy = firm.accountPolicy.liveExclusivityFor(movedPlan);
    if (!isConfirmedPolicySource(policy.source)) return null;

    const siblings: ExclusivityAccount[] = [];
    let unreadable = 0;
    for (const row of rows) {
        if (row.id === moved.id || row.archivedAt !== null) continue;
        const sibling = siblingOf(row, movedPlan, firm.accountPolicy);
        if (sibling !== undefined) {
            siblings.push(sibling);
        } else if (
            row.tracking === AccountTracking.Modeled &&
            row.firmId === moved.firmId
        ) {
            unreadable += 1;
        }
    }
    const outcome = liveExclusivityEffectsOf(
        [
            {
                accountPolicy: firm.accountPolicy,
                events: [],
                firmId: movedPlan.id.firm,
                id: moved.id,
                plan: movedPlan,
                stage: AccountStage.Live,
                status: moved.status,
            },
            ...siblings,
        ],
        moved.id,
    );
    const labels = new Map(rows.map((row) => [row.id, row.label]));
    const effects = outcome.effects.map((effect) => ({
        accountId: effect.accountId,
        action: effect.action,
        label: labels.get(effect.accountId) ?? effect.accountId,
    }));
    const lines = [
        ...effects.map(effectLine),
        ...(outcome.householdDisclosed ? [HOUSEHOLD_LINE] : []),
        ...(unreadable > 0 ? [unreadableLine(unreadable)] : []),
    ];
    if (lines.length === 0) return null;
    return {
        confirmedAccountIds: effects
            .filter((effect) => effect.action === LiveExclusivityAction.Suspend)
            .map((effect) => effect.accountId),
        effects,
        lines,
        title:
            effects.length === 0
                ? `What the firm's rules say about ${moved.label} going live`
                : `${moved.label} going live changes ${String(effects.length)} other ${effects.length === 1 ? 'account' : 'accounts'}`,
    };
}

function effectLine(effect: LiveExclusivityPreviewEffect): string {
    switch (effect.action) {
        case LiveExclusivityAction.Flag: {
            return `${effect.label}: flagged, because the firm's verified policy puts its other accounts on hold while live; record that yourself, moving live does not change it`;
        }
        case LiveExclusivityAction.None: {
            return `${effect.label}: unchanged`;
        }
        case LiveExclusivityAction.Suspend: {
            return `${effect.label}: suspended, because the firm's verified policy takes its other accounts out of play while live`;
        }
    }
}

function resolvedPlanOf(row: PreviewRow): null | Plan {
    switch (row.tracking) {
        case AccountTracking.LedgerOnly: {
            return null;
        }
        case AccountTracking.Modeled: {
            const resolution = resolvePlanKey(row);
            return resolution.kind === PlanKeyResolutionKind.Resolved
                ? resolution.plan
                : null;
        }
    }
}

function siblingFirmIdOf(row: PreviewRow): FirmId | undefined {
    switch (row.tracking) {
        case AccountTracking.LedgerOnly: {
            return row.firmId === null ? undefined : parseFirmId(row.firmId);
        }
        case AccountTracking.Modeled: {
            return resolvedPlanOf(row)?.id.firm;
        }
    }
}

function siblingOf(
    row: PreviewRow,
    movedPlan: Plan,
    accountPolicy: ExclusivityAccount['accountPolicy'],
): ExclusivityAccount | undefined {
    const firmId = siblingFirmIdOf(row);
    if (firmId === undefined) return undefined;
    return {
        accountPolicy,
        events: [],
        firmId,
        id: row.id,
        plan: resolvedPlanOf(row) ?? movedPlan,
        stage: row.stage,
        status: row.status,
    };
}

function unreadableLine(count: number): string {
    return count === 1
        ? '1 account at this firm has a plan that cannot be read, so it is not offered here and keeps its status.'
        : `${String(count)} accounts at this firm have a plan that cannot be read, so they are not offered here and keep their status.`;
}
