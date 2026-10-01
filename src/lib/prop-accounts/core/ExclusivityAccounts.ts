import { findFirm, type FirmId, type Plan } from '~/lib/prop-calculator';

import { type AccountStage } from './AccountStage';
import { type AccountStatus } from './AccountStatus';
import {
    type ExclusivityAccount,
    LiveExclusivityAction,
    type LiveExclusivityOutcome,
} from './LiveExclusivityEffects';

export interface ExclusivityMovedAccount {
    readonly id: string;
    readonly plan: Plan;
    readonly stage: AccountStage;
    readonly status: AccountStatus;
}

export interface ExclusivitySibling {
    readonly firmId: FirmId | undefined;
    readonly id: string;
    readonly isArchived: boolean;
    readonly plan: null | Plan;
    readonly stage: AccountStage;
    readonly status: AccountStatus;
}

export function exclusivityAccountsOf(
    moved: ExclusivityMovedAccount,
    siblings: readonly ExclusivitySibling[],
): readonly ExclusivityAccount[] {
    const firm = findFirm(moved.plan.id.firm);
    if (firm === undefined) return [];
    const { accountPolicy } = firm;
    return [
        {
            accountPolicy,
            events: [],
            firmId: moved.plan.id.firm,
            id: moved.id,
            plan: moved.plan,
            stage: moved.stage,
            status: moved.status,
        },
        ...siblings.flatMap((sibling) =>
            sibling.firmId === undefined || sibling.isArchived
                ? []
                : [
                      {
                          accountPolicy,
                          events: [],
                          firmId: sibling.firmId,
                          id: sibling.id,
                          plan: sibling.plan ?? moved.plan,
                          stage: sibling.stage,
                          status: sibling.status,
                      },
                  ],
        ),
    ];
}

export function suspendedAccountIdsOf(
    outcome: LiveExclusivityOutcome,
): readonly string[] {
    return outcome.effects.flatMap((effect) =>
        effect.action === LiveExclusivityAction.Suspend
            ? [effect.accountId]
            : [],
    );
}
