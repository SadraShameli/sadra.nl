import {
    formatUsdCents,
    joinWithAnd,
    usdCentsFromDollars,
} from '~/lib/prop-accounts/core';
import { AccountStateKind } from '~/lib/prop-accounts/metrics';
import { TradingPhase } from '~/lib/prop-calculator';
import {
    type ReconstructedAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';

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
                  tierChangeMessage(previousSignature, latestSignature),
              );
    }
}

function formatContractLimit(value: null | number): string {
    return value === null ? 'none' : String(value);
}

function formatDailyLossLimit(value: null | number): string {
    return value === null ? 'none' : formatUsdCents(usdCentsFromDollars(value));
}

function isSameSignature(left: TierSignature, right: TierSignature): boolean {
    return (
        left.dailyLossLimit === right.dailyLossLimit &&
        left.miniContractLimit === right.miniContractLimit &&
        left.microContractLimit === right.microContractLimit
    );
}

function tierChangeMessage(
    previous: TierSignature,
    latest: TierSignature,
): string {
    const changes: string[] = [];
    if (previous.dailyLossLimit !== latest.dailyLossLimit) {
        changes.push(
            `the daily loss limit (${formatDailyLossLimit(previous.dailyLossLimit)} to ${formatDailyLossLimit(latest.dailyLossLimit)})`,
        );
    }
    if (previous.miniContractLimit !== latest.miniContractLimit) {
        changes.push(
            `the mini contract limit (${formatContractLimit(previous.miniContractLimit)} to ${formatContractLimit(latest.miniContractLimit)})`,
        );
    }
    if (previous.microContractLimit !== latest.microContractLimit) {
        changes.push(
            `the micro contract limit (${formatContractLimit(previous.microContractLimit)} to ${formatContractLimit(latest.microContractLimit)})`,
        );
    }
    return `Since the previous snapshot, ${joinWithAnd(changes)} changed`;
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
            const { micros, minis } = livePlan.liveContractLimitsFor(state);
            return {
                dailyLossLimit: livePlan.dailyLossLimitFor(state),
                microContractLimit: micros,
                miniContractLimit: minis,
            };
        }
        case TradingPhase.Eval:
        case TradingPhase.Funded: {
            return {
                dailyLossLimit: account.resolvedDailyLossLimit,
                microContractLimit: account.microContractLimit ?? null,
                miniContractLimit: account.contractLimit,
            };
        }
    }
}
