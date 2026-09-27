import { INSTRUMENTS, InstrumentSymbol, TradingPhase } from '~/lib/prop-calculator';
import {
    type ReconstructedAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';

import { AccountStateKind } from '../metrics';
import { type AccountAlert } from './AccountAlert';
import { isActive, type MonitoredAccount } from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

interface TierSignature {
    readonly dailyLossLimit: null | number;
    readonly microContractLimit: null | number;
    readonly miniContractLimit: null | number;
}

export class TierChangeRule extends AccountAlertRule {
    readonly kind = AlertKind.TierChange;

    protected evaluateAccount(
        monitored: MonitoredAccount,
    ): AccountAlert | null {
        if (!isActive(monitored) || monitored.accountState?.kind !== AccountStateKind.Reconstructed) {
            return null;
        }
        const { latest, previous } = monitored.accountState;
        if (previous === null) return null;
        const latestSignature = tierSignatureOf(latest.reconstructed);
        const previousSignature = tierSignatureOf(previous.reconstructed);
        return latestSignature === null ||
            previousSignature === null ||
            isSameSignature(latestSignature, previousSignature)
            ? null
            : this.alertFor(
                  monitored,
                  AlertSeverity.Info,
                  'The resolved daily loss limit or contract tier changed since the previous snapshot',
              );
    }
}

function isSameSignature(left: TierSignature, right: TierSignature): boolean {
    return (
        left.dailyLossLimit === right.dailyLossLimit &&
        left.miniContractLimit === right.miniContractLimit &&
        left.microContractLimit === right.microContractLimit
    );
}

function tierSignatureOf(
    account: ReconstructedAccount,
): null | TierSignature {
    switch (account.kind) {
        case ReconstructedLiveKind.Live: {
            if (account.livePlan === null || account.state === null) {
                return null;
            }
            const { livePlan, state } = account;
            return {
                dailyLossLimit: livePlan.dailyLossLimitFor(state),
                microContractLimit: livePlan.maxContractsFor(
                    state,
                    INSTRUMENTS[InstrumentSymbol.MNQ],
                ),
                miniContractLimit: livePlan.maxContractsFor(
                    state,
                    INSTRUMENTS[InstrumentSymbol.NQ],
                ),
            };
        }
        case TradingPhase.Eval:
        case TradingPhase.Funded: {
            return {
                dailyLossLimit: account.resolvedDailyLossLimit,
                microContractLimit: null,
                miniContractLimit: account.contractLimit,
            };
        }
    }
}
