import { formatPercent } from '~/lib/format';
import {
    sampleAdequacy,
    SampleKind,
    SampleLevel,
} from '~/lib/prop-accounts/core';
import { EconomicsReason } from '~/lib/prop-calculator/economics';

import { type AccountAlert, AlertSubjectKind } from './AccountAlert';
import { type AlertContext } from './AlertContext';
import { AlertKind } from './AlertKind';
import { AlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export class BankrollLossRiskAboveThresholdRule extends AlertRule {
    readonly kind = AlertKind.BankrollLossRiskAboveThreshold;

    evaluate(context: AlertContext): readonly AccountAlert[] {
        const threshold = context.rulebook.bankroll.lossRiskThreshold;
        const result = context.realizedLossRisk;
        if (threshold === null || result === null) return [];
        if (result.reason === EconomicsReason.NoPositiveEdge) return [];
        const sampleLevel = sampleAdequacy(
            SampleKind.EvalAttempts,
            result.sampleCount,
            context.rulebook.samples,
        );
        if (sampleLevel === null || sampleLevel === SampleLevel.None) {
            return [];
        }
        if (result.batchLossProbability === null) return [];
        if (result.batchLossProbability.value <= threshold) return [];
        return [
            {
                disclosures: [],
                kind: this.kind,
                message: `Your realized P(batch net < 0) is ${formatPercent(result.batchLossProbability.value)} at the ${String(result.attempts ?? 0)} attempts your available bankroll buys (n=${String(result.sampleCount)}), above your ${formatPercent(threshold)} threshold`,
                severity: AlertSeverity.Warning,
                subject: { accountIds: [], kind: AlertSubjectKind.Portfolio },
            },
        ];
    }
}
