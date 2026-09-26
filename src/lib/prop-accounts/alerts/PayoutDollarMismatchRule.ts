import {
    CentsDisplay,
    formatUsdCents,
    paidPayoutCash,
    type PaidPayoutCash,
    sumUsdCents,
} from '../core';
import { type AccountAlert, AlertDisclosure } from './AccountAlert';
import { type MonitoredAccount, paidPayoutsThrough } from './AlertContext';
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
        const paid = paidPayoutsThrough(monitored, snapshot.asOf).flatMap(
            (payout): PaidPayoutCash[] => {
                const cash = paidPayoutCash(payout);
                return cash === null ? [] : [cash];
            },
        );
        const ledgerCents = sumUsdCents(paid.map((cash) => cash.cents));
        if (
            Math.abs(snapshot.cumulativePayoutCents - ledgerCents) <=
            TOLERANCE_CENTS
        ) {
            return null;
        }
        const grossOnly = paid.filter((cash) => cash.grossOnly).length;
        return this.alertFor(
            monitored,
            AlertSeverity.Warning,
            `Snapshot from ${snapshot.asOf} records ${formatUsdCents(snapshot.cumulativePayoutCents, CentsDisplay.Always)} received in payouts, the ledger's paid payouts on or before that date sum to ${formatUsdCents(ledgerCents, CentsDisplay.Always)} (${grossOnly} counted at gross)`,
            grossOnly > 0 ? [AlertDisclosure.GrossUsedForMissingNet] : [],
        );
    }
}
