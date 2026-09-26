import { AccountStage } from '../core';
import { type AccountAlert, AlertSubjectKind } from './AccountAlert';
import { type AlertContext, isActive } from './AlertContext';
import { AlertKind } from './AlertKind';
import { AlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export class MixedStageCopyGroupRule extends AlertRule {
    readonly kind = AlertKind.MixedStageCopyGroup;

    evaluate(context: AlertContext): readonly AccountAlert[] {
        return context.copyGroups.flatMap((group) => {
            const members = context.accounts.filter(
                (monitored) =>
                    isActive(monitored) &&
                    monitored.account.copyGroupId === group.id,
            );
            const stageCounts = Object.values(AccountStage)
                .map((stage) => ({
                    count: members.filter(
                        (monitored) => monitored.account.stage === stage,
                    ).length,
                    stage,
                }))
                .filter(({ count }) => count > 0);
            if (stageCounts.length <= 1) return [];
            const breakdown = stageCounts
                .map(({ count, stage }) => `${count} ${stage}`)
                .join(', ');
            return [
                {
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
                },
            ];
        });
    }
}
