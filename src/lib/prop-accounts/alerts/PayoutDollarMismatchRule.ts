import { CentsDisplay, formatUsdCents, isWithinPayoutTolerance } from '~/lib/prop-accounts/core';

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
        return isWithinPayoutTolerance(snapshot.cumulativePayoutCents - ledger.cents)
            ? null
            : this.alertFor(
                  monitored,
                  AlertSeverity.Warning,
                  `Snapshot from ${snapshot.asOf} records ${formatUsdCents(snapshot.cumulativePayoutCents, CentsDisplay.Always)} received in payouts, the ledger's paid payouts on or before that date sum to ${formatUsdCents(ledger.cents, CentsDisplay.Always)} (${ledger.grossCounted} counted at gross)`,
                  grossDisclosureOf(ledger.grossCounted),
              );
    }
}
