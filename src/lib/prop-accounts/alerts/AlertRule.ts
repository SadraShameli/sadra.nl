import { IsoDateError } from '../core';
import {
    type AccountAlert,
    type AlertDisclosure,
    AlertSubjectKind,
} from './AccountAlert';
import { type AlertContext, type MonitoredAccount } from './AlertContext';
import { type AlertKind, alertKindLabel } from './AlertKind';
import { AlertSeverity } from './AlertSeverity';

export abstract class AlertRule {
    abstract readonly kind: AlertKind;

    abstract evaluate(context: AlertContext): readonly AccountAlert[];
}

export abstract class AccountAlertRule extends AlertRule {
    private guardedEvaluate(
        monitored: MonitoredAccount,
        context: AlertContext,
    ): AccountAlert | null {
        try {
            return this.evaluateAccount(monitored, context);
        } catch (error) {
            const label = alertKindLabel(this.kind);
            return this.alertFor(
                monitored,
                AlertSeverity.Warning,
                error instanceof IsoDateError
                    ? `The ${label} alert could not be checked because this account's stored data is invalid (${error.message}); fix the account's stored data`
                    : `The ${label} alert failed in the code for this account (${String(error)}); this is a bug to report, not a problem with the account's data`,
            );
        }
    }

    evaluate(context: AlertContext): readonly AccountAlert[] {
        return context.accounts.flatMap((monitored) => {
            if (!this.checksAccount(monitored)) return [];
            const alert = this.guardedEvaluate(monitored, context);
            return alert === null ? [] : [alert];
        });
    }

    protected checksAccount(monitored: MonitoredAccount): boolean {
        return monitored.invalidDates.length === 0;
    }

    protected alertFor(
        monitored: MonitoredAccount,
        severity: AlertSeverity,
        message: string,
        disclosures: readonly AlertDisclosure[] = [],
    ): AccountAlert {
        return {
            disclosures,
            kind: this.kind,
            message,
            severity,
            subject: {
                accountId: monitored.account.id,
                kind: AlertSubjectKind.Account,
                label: monitored.account.label,
            },
        };
    }

    protected abstract evaluateAccount(
        monitored: MonitoredAccount,
        context: AlertContext,
    ): AccountAlert | null;
}
