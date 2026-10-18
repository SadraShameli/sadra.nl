import { CircleAlert, Info, TriangleAlert } from 'lucide-react';

import { PanelSubheading } from '~/components/PanelSubheading';
import { Badge } from '~/components/ui/badge';
import { AlertSeverity } from '~/lib/prop-accounts';
import { cn } from '~/lib/utilities';

import { type AlertGroup, groupAlertsByKind } from './AlertGroups';
import { AlertSubjectLabel, AlertSubjectsTable } from './AlertSubjectsTable';
import { type OverviewAlert } from './overviewModel';

const SEVERITY_WORD: Readonly<Record<AlertSeverity, string>> = {
    [AlertSeverity.Critical]: 'critical',
    [AlertSeverity.Info]: 'info',
    [AlertSeverity.Warning]: 'warning',
};

export function AlertsCenter({
    alerts,
}: {
    readonly alerts: readonly OverviewAlert[];
}) {
    if (alerts.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No alerts right now.
            </p>
        );
    }
    return (
        <ul className="flex flex-col divide-y divide-border rounded-lg border">
            {groupAlertsByKind(alerts).map((group) => (
                <li key={group.kind}>
                    <AlertGroupItem group={group} />
                </li>
            ))}
        </ul>
    );
}

function AlertGroupItem({ group }: { readonly group: AlertGroup }) {
    const [single] = group.alerts;
    return (
        <section className="flex flex-col gap-3 p-3">
            <header className="flex items-center gap-3">
                <AlertIcon severity={group.severity} />
                <PanelSubheading className="min-w-0 flex-1">
                    {group.kindLabel}
                </PanelSubheading>
                <Badge className="tabular-nums">
                    {String(group.alerts.length)}{' '}
                    {SEVERITY_WORD[group.severity]}
                </Badge>
            </header>
            {single !== undefined && group.alerts.length === 1 ? (
                <div className="flex flex-col gap-0.5 pl-7 text-sm">
                    <AlertSubjectLabel alert={single} />
                    <p className="text-xs text-muted-foreground">
                        {single.message}
                    </p>
                </div>
            ) : (
                <AlertSubjectsTable alerts={group.alerts} />
            )}
            {group.disclosures.map((disclosure) => (
                <p
                    className="pl-7 text-xs text-muted-foreground"
                    key={disclosure}
                >
                    {disclosure}
                </p>
            ))}
        </section>
    );
}

function AlertIcon({ severity }: { readonly severity: AlertSeverity }) {
    const className = cn('size-4 shrink-0', severityTextClass(severity));
    switch (severity) {
        case AlertSeverity.Critical: {
            return <CircleAlert aria-hidden className={className} />;
        }
        case AlertSeverity.Info: {
            return <Info aria-hidden className={className} />;
        }
        case AlertSeverity.Warning: {
            return <TriangleAlert aria-hidden className={className} />;
        }
    }
}

function severityTextClass(severity: AlertSeverity): string {
    switch (severity) {
        case AlertSeverity.Critical: {
            return 'text-destructive';
        }
        case AlertSeverity.Info: {
            return 'text-muted-foreground';
        }
        case AlertSeverity.Warning: {
            return 'text-warning';
        }
    }
}
