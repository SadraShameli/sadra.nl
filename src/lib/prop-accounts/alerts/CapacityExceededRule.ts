import { type AccountAlert, AlertSubjectKind } from './AccountAlert';
import { type AlertContext, isActive } from './AlertContext';
import { AlertKind } from './AlertKind';
import { AlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export class CapacityExceededRule extends AlertRule {
    readonly kind = AlertKind.CapacityExceeded;

    evaluate(context: AlertContext): readonly AccountAlert[] {
        const capacity = context.rulebook.bankroll.dailyAccountCapacity;
        if (capacity === null) return [];
        const active = context.accounts.filter((monitored) =>
            isActive(monitored),
        );
        const copyGroups = new Set(
            active.flatMap((monitored) =>
                monitored.account.copyGroupId === null
                    ? []
                    : [monitored.account.copyGroupId],
            ),
        );
        const standalone = active.filter(
            (monitored) => monitored.account.copyGroupId === null,
        ).length;
        const units = standalone + copyGroups.size;
        if (units <= capacity) return [];
        return [
            {
                disclosures: [],
                kind: this.kind,
                message: `You hold ${String(units)} accounts to manage a day (${String(active.length)} active accounts, each copy group counted once), above your daily capacity of ${String(capacity)}`,
                severity: AlertSeverity.Warning,
                subject: {
                    accountIds: active.map((monitored) => monitored.account.id),
                    kind: AlertSubjectKind.Portfolio,
                },
            },
        ];
    }
}
