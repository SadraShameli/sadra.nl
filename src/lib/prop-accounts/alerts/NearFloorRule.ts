import { formatUsdCents, usdCentsFromDollars } from '../core';
import {
    AccountStateKind,
    type CushionRatio,
    CushionRatioBasis,
    cushionRatioOf,
} from '../metrics';
import { type AccountAlert } from './AccountAlert';
import {
    type AlertContext,
    isActive,
    type MonitoredAccount,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

const STAGE_NOUN: Readonly<Record<CushionRatioBasis, string>> = {
    [CushionRatioBasis.Eval]: 'the eval drawdown',
    [CushionRatioBasis.Funded]: 'the documented funded risk',
    [CushionRatioBasis.Live]: 'the live retained cushion',
};

export class NearFloorRule extends AccountAlertRule {
    readonly kind = AlertKind.NearFloor;

    protected evaluateAccount(
        monitored: MonitoredAccount,
        context: AlertContext,
    ): AccountAlert | null {
        if (!isActive(monitored)) return null;
        const state = monitored.accountState;
        if (state?.kind !== AccountStateKind.Reconstructed) return null;
        const ratio = cushionRatioOf(
            context.rulebook,
            state.latest.reconstructed,
        );
        return ratio.ratio === null || ratio.ratio >= thresholdFor(ratio, context)
            ? null
            : this.alertFor(monitored, AlertSeverity.Warning, messageFor(ratio));
    }
}

function messageFor(ratio: CushionRatio): string {
    const cushion = usdCentsFromDollars(ratio.cushion ?? 0);
    const basisAmount = usdCentsFromDollars(ratio.basisAmount ?? 0);
    const noun = STAGE_NOUN[ratio.basis];
    return `Cushion of ${formatUsdCents(cushion)} is close to the floor: below ${noun} of ${formatUsdCents(basisAmount)}`;
}

function thresholdFor(ratio: CushionRatio, context: AlertContext): number {
    switch (ratio.basis) {
        case CushionRatioBasis.Eval: {
            return context.rulebook.alerts.evalNearFloorDrawdownFraction;
        }
        case CushionRatioBasis.Funded: {
            return context.rulebook.alerts.fundedNearFloorRiskMultiple;
        }
        case CushionRatioBasis.Live: {
            return 1;
        }
    }
}
