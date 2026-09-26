import { MAX_ACCOUNT_DATE_YEAR, MIN_ACCOUNT_DATE_YEAR } from '../core';
import { type AccountAlert } from './AccountAlert';
import {
    type InvalidStoredDate,
    type MonitoredAccount,
    StoredDateField,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export class InvalidStoredDateRule extends AccountAlertRule {
    readonly kind = AlertKind.InvalidStoredDate;

    protected checksAccount(monitored: MonitoredAccount): boolean {
        return monitored.invalidDates.length > 0;
    }

    protected evaluateAccount(monitored: MonitoredAccount): AccountAlert {
        const listed = monitored.invalidDates.map(describeDate).join(', ');
        return this.alertFor(
            monitored,
            AlertSeverity.Warning,
            `Stored dates of this account are not real calendar dates from ${MIN_ACCOUNT_DATE_YEAR} through ${MAX_ACCOUNT_DATE_YEAR}: ${listed}; its other alerts are not checked until the stored data is fixed`,
        );
    }
}

function describeDate(invalid: InvalidStoredDate): string {
    return `${fieldLabel(invalid.field)} "${invalid.value}"`;
}

function fieldLabel(field: StoredDateField): string {
    switch (field) {
        case StoredDateField.PayoutPaidOn: {
            return 'payout paid date';
        }
        case StoredDateField.PayoutRequestedOn: {
            return 'payout request date';
        }
        case StoredDateField.PurchasedOn: {
            return 'purchase date';
        }
        case StoredDateField.SnapshotAsOf: {
            return 'snapshot date';
        }
    }
}
