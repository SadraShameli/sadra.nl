import { AccountEventKind, isAccountDate } from '~/lib/prop-accounts/core';
import {
    type ConductPattern,
    type ConfirmedFirmPolicySource,
    isoDaysBetween,
    isRebuyConcern,
    PolicyVerification,
} from '~/lib/prop-calculator';

import { type AccountAlert, AlertSubjectKind } from './AccountAlert';
import {
    type AlertContext,
    type ResolvedFirmAccount,
    resolvedFirmAccountsOf,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

const REBUY_WINDOW_DAYS = 7;

interface EventOccurrence {
    readonly accountId: string;
    readonly on: string;
}

export class ConductPatternRule extends AlertRule {
    readonly kind = AlertKind.ConductPattern;

    private firmAlerts(
        group: readonly ResolvedFirmAccount[],
    ): readonly AccountAlert[] {
        const first = group[0];
        if (first === undefined) return [];
        const rebuyPattern = confirmedRebuyPatternOf(
            first.firm.accountPolicy.conductPatterns(first.plan),
        );
        if (rebuyPattern === undefined) return [];
        const alerts: AccountAlert[] = [];
        const sameDayBust = findSameDayMultiBust(group);
        if (sameDayBust !== null) {
            alerts.push(
                alertFor(
                    this.kind,
                    sameDayBust.accountIds,
                    `${sameDayBust.accountIds.length} accounts at this firm were busted on ${sameDayBust.on}, matching "${rebuyPattern.consequence}"; the firm publishes no numeric threshold for this pattern (quote: "${rebuyPattern.source.quote}")`,
                ),
            );
        }
        const rebuy = findRebuyWithinWindow(group, REBUY_WINDOW_DAYS);
        if (rebuy !== null) {
            alerts.push(
                alertFor(
                    this.kind,
                    rebuy.accountIds,
                    `a new account was purchased at this firm within ${REBUY_WINDOW_DAYS} days of a bust, matching "${rebuyPattern.consequence}"; the firm publishes no numeric threshold for this pattern (quote: "${rebuyPattern.source.quote}")`,
                ),
            );
        }
        return alerts;
    }

    evaluate(context: AlertContext): readonly AccountAlert[] {
        const byFirmId = Map.groupBy(
            resolvedFirmAccountsOf(context),
            (entry) => entry.monitored.planKey.firmId,
        );
        return byFirmId
            .values()
            .flatMap((group) => this.firmAlerts(group))
            .toArray();
    }
}

function alertFor(
    kind: AlertKind,
    accountIds: readonly string[],
    message: string,
): AccountAlert {
    return {
        disclosures: [],
        kind,
        message,
        severity: AlertSeverity.Warning,
        subject: { accountIds, kind: AlertSubjectKind.Portfolio },
    };
}

function confirmedRebuyPatternOf(
    patterns: readonly ConductPattern[],
):
    | (ConductPattern & { readonly source: ConfirmedFirmPolicySource })
    | undefined {
    return patterns.find(
        (
            pattern,
        ): pattern is ConductPattern & {
            readonly source: ConfirmedFirmPolicySource;
        } =>
            isRebuyConcern(pattern) &&
            pattern.source.verification === PolicyVerification.Confirmed,
    );
}

function eventsOf(
    group: readonly ResolvedFirmAccount[],
    kind: AccountEventKind,
): readonly EventOccurrence[] {
    return group.flatMap((entry) =>
        entry.monitored.events
            .filter(
                (event) =>
                    event.kind === kind && isAccountDate(event.occurredOn),
            )
            .map((event) => ({
                accountId: entry.monitored.account.id,
                on: event.occurredOn,
            })),
    );
}

function findRebuyWithinWindow(
    group: readonly ResolvedFirmAccount[],
    windowDays: number,
): null | { readonly accountIds: readonly string[] } {
    const busts = eventsOf(group, AccountEventKind.Busted);
    const purchases = eventsOf(group, AccountEventKind.Purchased);
    for (const bust of busts) {
        for (const purchase of purchases) {
            if (purchase.accountId === bust.accountId) continue;
            const gap = isoDaysBetween(bust.on, purchase.on);
            if (gap >= 0 && gap <= windowDays) {
                return { accountIds: [bust.accountId, purchase.accountId] };
            }
        }
    }
    return null;
}

function findSameDayMultiBust(
    group: readonly ResolvedFirmAccount[],
): null | { readonly accountIds: readonly string[]; readonly on: string } {
    const byDate = new Map<string, string[]>();
    for (const occurrence of eventsOf(group, AccountEventKind.Busted)) {
        const accountIds = byDate.get(occurrence.on) ?? [];
        if (!accountIds.includes(occurrence.accountId)) {
            accountIds.push(occurrence.accountId);
        }
        byDate.set(occurrence.on, accountIds);
    }
    for (const [on, accountIds] of byDate) {
        if (accountIds.length >= 2) return { accountIds, on };
    }
    return null;
}
