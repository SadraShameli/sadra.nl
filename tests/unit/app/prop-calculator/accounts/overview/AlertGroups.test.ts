import { describe, expect, it } from 'vitest';

import { groupAlertsByKind } from '~/app/(app)/prop-calculator/accounts/_components/overview/AlertGroups';
import { type OverviewAlert } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { AlertKind, alertKindLabel, AlertSeverity } from '~/lib/prop-accounts';
import { routes } from '~/lib/site/routes';

function accountAlert(
    kind: AlertKind,
    severity: AlertSeverity,
    accountId: string,
    disclosures: readonly string[] = [],
): OverviewAlert {
    return {
        disclosures,
        href: routes.propCalculator.accounts.detail(accountId),
        key: `${kind}-${accountId}`,
        kind,
        kindLabel: alertKindLabel(kind),
        message: `${accountId} needs attention`,
        severity,
        subjectLabel: accountId,
    };
}

describe('groupAlertsByKind', () => {
    it('collapses every account of one kind into a single group', () => {
        const groups = groupAlertsByKind([
            accountAlert(AlertKind.StaleSnapshot, AlertSeverity.Warning, 'a'),
            accountAlert(AlertKind.StaleSnapshot, AlertSeverity.Warning, 'b'),
            accountAlert(AlertKind.StaleSnapshot, AlertSeverity.Warning, 'c'),
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0]?.alerts.map((alert) => alert.subjectLabel)).toEqual([
            'a',
            'b',
            'c',
        ]);
    });

    it('orders groups by their worst severity and lists each disclosure once', () => {
        const groups = groupAlertsByKind([
            accountAlert(AlertKind.StaleSnapshot, AlertSeverity.Info, 'a', [
                'shared',
            ]),
            accountAlert(AlertKind.NearFloor, AlertSeverity.Warning, 'b'),
            accountAlert(AlertKind.StaleSnapshot, AlertSeverity.Critical, 'c', [
                'shared',
            ]),
        ]);
        expect(groups.map((group) => group.kind)).toEqual([
            AlertKind.StaleSnapshot,
            AlertKind.NearFloor,
        ]);
        expect(groups[0]?.severity).toBe(AlertSeverity.Critical);
        expect(groups[0]?.disclosures).toEqual(['shared']);
    });
});
