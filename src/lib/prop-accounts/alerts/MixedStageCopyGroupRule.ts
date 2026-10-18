import { AccountStage, accountStageBreakdown } from '~/lib/prop-accounts/core';

import { type AccountAlert, AlertSubjectKind } from './AccountAlert';
import { type AlertContext, isActive } from './AlertContext';
import { AlertKind } from './AlertKind';
import { AlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export interface StageCount {
    readonly count: number;
    readonly stage: AccountStage;
}

export class MixedStageCopyGroupRule extends AlertRule {
    readonly kind = AlertKind.MixedStageCopyGroup;

    evaluate(context: AlertContext): readonly AccountAlert[] {
        return context.copyGroups.flatMap((group) => {
            const members = context.accounts.filter(
                (monitored) =>
                    isActive(monitored) &&
                    monitored.account.copyGroupId === group.id,
            );
            const stages = members.map((monitored) => monitored.account.stage);
            if (!hasMixedStages(stages)) return [];
            const breakdown = accountStageBreakdown(stageCountsOf(stages));
            return {
                disclosures: [],
                kind: this.kind,
                message: `Copy group "${group.name}" mixes stages (${breakdown}); group sizing needs every member in one stage`,
                severity: AlertSeverity.Warning,
                subject: {
                    accountIds: members.map(
                        (monitored) => monitored.account.id,
                    ),
                    copyGroupId: group.id,
                    kind: AlertSubjectKind.CopyGroup,
                    name: group.name,
                },
            };
        });
    }
}

export function hasMixedStages(stages: readonly AccountStage[]): boolean {
    return stageCountsOf(stages).length > 1;
}

export function stageCountsOf(
    stages: readonly AccountStage[],
): readonly StageCount[] {
    return Object.values(AccountStage)
        .map((stage) => ({
            count: stages.filter((candidate) => candidate === stage).length,
            stage,
        }))
        .filter(({ count }) => count > 0);
}
