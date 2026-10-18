import { type AccountAlert } from './AccountAlert';
import { type MonitoredAccount, paidPayoutsThrough } from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export class PayoutCountMismatchRule extends AccountAlertRule {
    readonly kind = AlertKind.PayoutCountMismatch;

    protected evaluateAccount(
        monitored: MonitoredAccount,
    ): AccountAlert | null {
        const snapshot = monitored.latestSnapshot;
        if (snapshot?.payoutsTaken == null) return null;
        const paidCount = paidPayoutsThrough(monitored, snapshot.asOf).length;
        return paidCount === snapshot.payoutsTaken
            ? null
            : this.alertFor(
                  monitored,
                  AlertSeverity.Warning,
                  `Snapshot from ${snapshot.asOf} says ${snapshot.payoutsTaken} payouts taken, the ledger has ${paidCount} paid payouts on or before that date`,
              );
    }
}
