import { CentsDisplay, formatUsdCents } from '../core';
import { type AccountAlert } from './AccountAlert';
import {
    grossDisclosureOf,
    type MonitoredAccount,
    paidLedgerTotal,
    paidPayoutsThrough,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

const TOLERANCE_CENTS = 100;

export class PayoutDollarMismatchRule extends AccountAlertRule {
    readonly kind = AlertKind.PayoutDollarMismatch;

    protected evaluateAccount(
        monitored: MonitoredAccount,
    ): AccountAlert | null {
        const snapshot = monitored.latestSnapshot;
        if (snapshot?.cumulativePayoutCents == null) return null;
        const ledger = paidLedgerTotal(
            paidPayoutsThrough(monitored, snapshot.asOf),
        );
        return Math.abs(snapshot.cumulativePayoutCents - ledger.cents) <=
            TOLERANCE_CENTS
            ? null
            : this.alertFor(
                  monitored,
                  AlertSeverity.Warning,
                  `Snapshot from ${snapshot.asOf} records ${formatUsdCents(snapshot.cumulativePayoutCents, CentsDisplay.Always)} received in payouts, the ledger's paid payouts on or before that date sum to ${formatUsdCents(ledger.cents, CentsDisplay.Always)} (${ledger.grossCounted} counted at gross)`,
                  grossDisclosureOf(ledger.grossCounted),
              );
    }
}
