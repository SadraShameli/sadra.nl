import {
    CentsDisplay,
    firmKeyId,
    firmKeyOf,
    formatUsdCents,
} from '~/lib/prop-accounts/core';
import { firmColumnsOf } from '~/lib/prop-accounts/metrics';

import { type AccountAlert, AlertSubjectKind } from './AccountAlert';
import { type AlertContext, isActive } from './AlertContext';
import { AlertKind } from './AlertKind';
import { AlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export class FirmPayoutTotalMismatchRule extends AlertRule {
    readonly kind = AlertKind.FirmPayoutTotalMismatch;

    evaluate(context: AlertContext): readonly AccountAlert[] {
        return context.firmReconciliation.flatMap((entry) => {
            const isOutOfTolerance = !entry.withinTolerance;
            if (!isOutOfTolerance && !entry.decreasedFromPrevious) return [];
            const targetKey = firmKeyId(entry.firmKey);
            const accountIds = context.accounts
                .filter(
                    (monitored) =>
                        isActive(monitored) &&
                        firmKeyId(
                            firmKeyOf(firmColumnsOf(monitored.account)),
                        ) === targetKey,
                )
                .map((monitored) => monitored.account.id);
            const decrease = entry.decreasedFromPrevious
                ? '; the reported figure went down from the previous statement'
                : '';
            const grossNote =
                entry.grossOnlyCount > 0
                    ? ` (${entry.grossOnlyCount} counted at gross)`
                    : '';
            return {
                disclosures: [],
                kind: this.kind,
                message: isOutOfTolerance
                    ? `The statement from ${entry.asOf} reports ${formatUsdCents(entry.reportedPayoutCents, CentsDisplay.Always)}, the ledger's paid payouts through that date sum to ${formatUsdCents(entry.ledgerPaidCents, CentsDisplay.Always)}${grossNote}${decrease}`
                    : `The statement from ${entry.asOf} reports ${formatUsdCents(entry.reportedPayoutCents, CentsDisplay.Always)}${decrease}`,
                severity: AlertSeverity.Warning,
                subject: {
                    accountIds,
                    kind: AlertSubjectKind.Portfolio,
                },
            };
        });
    }
}
