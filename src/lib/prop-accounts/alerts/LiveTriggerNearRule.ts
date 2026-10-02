import {
    type ConfirmedFirmPolicySource,
    type FirmPolicySource,
    PayoutCountPerAccountTrigger,
    PayoutCountTotalTrigger,
    PolicyVerification,
} from '~/lib/prop-calculator';

import { type AccountAlert, AlertSubjectKind } from './AccountAlert';
import {
    type AlertContext,
    isActive,
    paidPayoutsSinceLastLiveAccountOf,
    payoutsTakenOf,
    type ResolvedFirmAccount,
    resolvedFirmAccountsOf,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export class LiveTriggerNearRule extends AlertRule {
    readonly kind = AlertKind.LiveTriggerNear;

    private perAccountAlert(
        entry: ResolvedFirmAccount,
    ): readonly AccountAlert[] {
        const trigger = entry.firm.accountPolicy
            .liveTriggersFor(entry.plan)
            .find(
                (candidate): candidate is PayoutCountPerAccountTrigger =>
                    candidate instanceof PayoutCountPerAccountTrigger,
            );
        if (trigger === undefined || !isConfirmed(trigger.source)) return [];
        const taken = payoutsTakenOf(entry.monitored);
        if (taken < trigger.cap - 1) return [];
        return [
            {
                disclosures: [],
                kind: this.kind,
                message: liveTriggerMessage(
                    taken,
                    trigger.cap,
                    'this account',
                    trigger.source,
                ),
                severity: severityFor(taken, trigger.cap),
                subject: {
                    accountId: entry.monitored.account.id,
                    kind: AlertSubjectKind.Account,
                    label: entry.monitored.account.label,
                },
            },
        ];
    }

    private perFirmAlerts(
        resolved: readonly ResolvedFirmAccount[],
        context: AlertContext,
    ): readonly AccountAlert[] {
        const byFirmId = Map.groupBy(
            resolved,
            (entry) => entry.monitored.planKey.firmId,
        );
        const alerts: AccountAlert[] = [];
        for (const group of byFirmId.values()) {
            const first = group[0];
            if (first === undefined) continue;
            const trigger = first.firm.accountPolicy
                .liveTriggersFor(first.plan)
                .find(
                    (candidate): candidate is PayoutCountTotalTrigger =>
                        candidate instanceof PayoutCountTotalTrigger,
                );
            if (trigger === undefined || !isConfirmed(trigger.source)) continue;
            const taken = paidPayoutsSinceLastLiveAccountOf(
                context,
                first.monitored,
                context.today,
            );
            if (taken === null || taken < trigger.cap - 1) continue;
            const activeAccountIds = group
                .filter((entry) => isActive(entry.monitored))
                .map((entry) => entry.monitored.account.id);
            if (activeAccountIds.length === 0) continue;
            alerts.push({
                disclosures: [],
                kind: this.kind,
                message: liveTriggerMessage(
                    taken,
                    trigger.cap,
                    "this firm's accounts",
                    trigger.source,
                ),
                severity: severityFor(taken, trigger.cap),
                subject: {
                    accountIds: activeAccountIds,
                    kind: AlertSubjectKind.Portfolio,
                },
            });
        }
        return alerts;
    }

    evaluate(context: AlertContext): readonly AccountAlert[] {
        const resolved = resolvedFirmAccountsOf(context);
        return [
            ...resolved
                .filter((entry) => isActive(entry.monitored))
                .flatMap((entry) => this.perAccountAlert(entry)),
            ...this.perFirmAlerts(resolved, context),
        ];
    }
}

function isConfirmed(
    source: FirmPolicySource | undefined,
): source is ConfirmedFirmPolicySource {
    return source?.verification === PolicyVerification.Confirmed;
}

function liveTriggerMessage(
    taken: number,
    cap: number,
    scope: string,
    source: ConfirmedFirmPolicySource,
): string {
    const outcome =
        taken < cap
            ? 'the next payout would trigger the move to live'
            : 'a further payout has already triggered the move to live';
    return `${taken} of ${cap} payouts taken toward the verified live-transition trigger for ${scope}; ${outcome} (quote: "${source.quote}")`;
}

function severityFor(taken: number, cap: number): AlertSeverity {
    return taken >= cap ? AlertSeverity.Critical : AlertSeverity.Warning;
}
