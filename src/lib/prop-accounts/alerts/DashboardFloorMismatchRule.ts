import { formatUsdCents, usdCentsFromDollars } from '~/lib/prop-accounts/core';
import { AccountStateKind } from '~/lib/prop-accounts/metrics';

import { type AccountAlert } from './AccountAlert';
import { isActive, type MonitoredAccount } from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export class DashboardFloorMismatchRule extends AccountAlertRule {
    readonly kind = AlertKind.DashboardFloorMismatch;

    protected evaluateAccount(
        monitored: MonitoredAccount,
    ): AccountAlert | null {
        if (!isActive(monitored)) return null;
        const state = monitored.accountState;
        if (state?.kind !== AccountStateKind.Reconstructed) return null;
        const { reconstructed } = state.latest;
        const mismatch = reconstructed.dashboardFloorMismatch ?? null;
        if (mismatch === null) return null;
        const engineFloor = formatUsdCents(
            usdCentsFromDollars(mismatch.engineFloor),
        );
        const enteredFloor = formatUsdCents(
            usdCentsFromDollars(mismatch.enteredFloor),
        );
        return this.alertFor(
            monitored,
            AlertSeverity.Warning,
            `The entered dashboard floor of ${enteredFloor} is above the engine's own calculated floor of ${engineFloor}; the entered floor is used as the more conservative one`,
        );
    }
}
