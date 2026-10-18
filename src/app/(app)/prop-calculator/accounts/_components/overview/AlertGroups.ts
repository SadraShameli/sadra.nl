import {
    type AlertKind,
    type AlertSeverity,
    alertSeverityRank,
} from '~/lib/prop-accounts';

import { type OverviewAlert } from './overviewModel';

export interface AlertGroup {
    readonly alerts: readonly OverviewAlert[];
    readonly disclosures: readonly string[];
    readonly kind: AlertKind;
    readonly kindLabel: string;
    readonly severity: AlertSeverity;
}

export function groupAlertsByKind(
    alerts: readonly OverviewAlert[],
): readonly AlertGroup[] {
    const groups: AlertGroup[] = [];
    const byKind = Map.groupBy(alerts, (alert) => alert.kind);
    for (const members of byKind.values()) {
        const [first] = members;
        if (first === undefined) continue;
        groups.push({
            alerts: members,
            disclosures: [
                ...new Set(members.flatMap((alert) => alert.disclosures)),
            ],
            kind: first.kind,
            kindLabel: first.kindLabel,
            severity: worstSeverity(first, members),
        });
    }
    return groups.toSorted(
        (left, right) =>
            alertSeverityRank(left.severity) -
            alertSeverityRank(right.severity),
    );
}

function worstSeverity(
    first: OverviewAlert,
    alerts: readonly OverviewAlert[],
): AlertSeverity {
    return alerts.reduce(
        (worst, alert) =>
            alertSeverityRank(alert.severity) < alertSeverityRank(worst)
                ? alert.severity
                : worst,
        first.severity,
    );
}
