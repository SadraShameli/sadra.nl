import {
    type ConfirmedFirmPolicySource,
    type FirmPolicySource,
    PayoutCountPerAccountTrigger,
    PayoutCountTotalTrigger,
    PolicyVerification,
} from '~/lib/prop-calculator';
import { PendingPayoutCountsStatus } from '~/lib/prop-calculator/advisor';

import {
    type AccountAlert,
    AlertDisclosure,
    AlertSubjectKind,
} from './AccountAlert';
import {
    type AlertContext,
    firmPayoutCountIn,
    isActive,
    payoutsTakenOf,
    pendingPayoutCountsIn,
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
        context: AlertContext,
    ): readonly AccountAlert[] {
        const trigger = entry.firm.accountPolicy
            .liveTriggersFor(entry.plan)
            .find(
                (candidate): candidate is PayoutCountPerAccountTrigger =>
                    candidate instanceof PayoutCountPerAccountTrigger,
            );
        if (trigger === undefined || !isConfirmed(trigger.source)) return [];
        const pending = pendingPayoutCountsIn(
            context,
            entry.monitored,
            context.today,
        );
        if (pending.status === PendingPayoutCountsStatus.NotChecked) {
            return [
                {
                    disclosures: [AlertDisclosure.LiveTriggersNotChecked],
                    kind: this.kind,
                    message: unreadableAccountCountMessage(
                        trigger.cap,
                        trigger.source,
                    ),
                    severity: AlertSeverity.Warning,
                    subject: {
                        accountId: entry.monitored.account.id,
                        kind: AlertSubjectKind.Account,
                        label: entry.monitored.account.label,
                    },
                },
            ];
        }
        const requested = pending.counts.pendingPayoutCount;
        const taken = payoutsTakenOf(entry.monitored) + requested;
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
                    requested,
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
            const activeAccountIds = group
                .filter((entry) => isActive(entry.monitored))
                .map((entry) => entry.monitored.account.id);
            if (activeAccountIds.length === 0) continue;
            const firmCount = firmPayoutCountIn(
                context,
                first.monitored.planKey.firmId,
                context.today,
            );
            const subject = {
                accountIds: activeAccountIds,
                kind: AlertSubjectKind.Portfolio,
            } as const;
            if (firmCount === null) {
                alerts.push({
                    disclosures: [AlertDisclosure.LiveTriggersNotChecked],
                    kind: this.kind,
                    message: unreadableCountMessage(
                        trigger.cap,
                        trigger.source,
                    ),
                    severity: AlertSeverity.Warning,
                    subject,
                });
                continue;
            }
            const requested = firmCount.requestedPayoutsSinceLastLiveAccount;
            const taken = firmCount.paidPayoutsSinceLastLiveAccount + requested;
            if (taken < trigger.cap - 1) continue;
            alerts.push({
                disclosures: [],
                kind: this.kind,
                message: liveTriggerMessage(
                    taken,
                    trigger.cap,
                    "this firm's accounts",
                    trigger.source,
                    requested,
                ),
                severity: severityFor(taken, trigger.cap),
                subject,
            });
        }
        return alerts;
    }

    evaluate(context: AlertContext): readonly AccountAlert[] {
        const resolved = resolvedFirmAccountsOf(context);
        return [
            ...resolved
                .filter((entry) => isActive(entry.monitored))
                .flatMap((entry) => this.perAccountAlert(entry, context)),
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
    requested = 0,
): string {
    const breakdown =
        requested > 0
            ? ` (${String(taken - requested)} paid, ${String(requested)} requested)`
            : '';
    const outcome =
        taken < cap
            ? 'the next payout would trigger the move to live'
            : 'a further payout has already triggered the move to live';
    return `${taken} of ${cap} payouts taken${breakdown} toward the verified live-transition trigger for ${scope}; ${outcome} (quote: "${source.quote}")`;
}

function severityFor(taken: number, cap: number): AlertSeverity {
    return taken >= cap ? AlertSeverity.Critical : AlertSeverity.Warning;
}

function unreadableAccountCountMessage(
    cap: number,
    source: ConfirmedFirmPolicySource,
): string {
    return `The verified live-transition trigger for this account (cap ${String(cap)}) is not checked: a payout or an account at this firm cannot be read, so the requested payouts it counts are unknown (quote: "${source.quote}")`;
}

function unreadableCountMessage(
    cap: number,
    source: ConfirmedFirmPolicySource,
): string {
    return `The verified live-transition trigger for this firm's accounts (cap ${String(cap)}) is not checked: a payout or an account at this firm cannot be read, so its payout count is unknown (quote: "${source.quote}")`;
}
