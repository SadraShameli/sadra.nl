import { TradingPhase } from '~/lib/prop-calculator';
import { AssumptionKind } from '~/lib/prop-calculator/advisor';

import { formatUsdCents, usdCentsFromDollars } from '../core';
import { AccountStateKind } from '../metrics';
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
        if (reconstructed.kind !== TradingPhase.Funded) return null;
        const hasMismatch = reconstructed.assumptions.some(
            (assumption) =>
                assumption.kind === AssumptionKind.DashboardFloorMismatch,
        );
        if (!hasMismatch) return null;
        const governingFloor = formatUsdCents(
            usdCentsFromDollars(reconstructed.state.threshold),
        );
        return this.alertFor(
            monitored,
            AlertSeverity.Warning,
            `The entered dashboard floor is above the engine's own calculated floor; the entered floor of ${governingFloor} is used as the more conservative one`,
        );
    }
}
