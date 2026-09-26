import { CircleAlert, Info, TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { AlertSeverity } from '~/lib/prop-accounts';

import { type OverviewAlert } from './overviewModel';

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
        <ul className="flex flex-col gap-3">
            {alerts.map((alert) => (
                <li key={alert.key}>
                    <AlertItem alert={alert} />
                </li>
            ))}
        </ul>
    );
}

function AlertIcon({ severity }: { readonly severity: AlertSeverity }) {
    switch (severity) {
        case AlertSeverity.Critical: {
            return <CircleAlert />;
        }
        case AlertSeverity.Info: {
            return <Info />;
        }
        case AlertSeverity.Warning: {
            return <TriangleAlert />;
        }
    }
}

function AlertItem({ alert }: { readonly alert: OverviewAlert }) {
    return (
        <Alert variant={alertVariant(alert.severity)}>
            <AlertIcon severity={alert.severity} />
            <AlertTitle>
                {alert.kindLabel}: {alert.subjectLabel}
            </AlertTitle>
            <AlertDescription>
                <p>{alert.message}</p>
                {alert.disclosures.map((disclosure) => (
                    <p className="text-xs opacity-80" key={disclosure}>
                        {disclosure}
                    </p>
                ))}
            </AlertDescription>
        </Alert>
    );
}

function alertVariant(
    severity: AlertSeverity,
): 'default' | 'destructive' | 'warning' {
    switch (severity) {
        case AlertSeverity.Critical: {
            return 'destructive';
        }
        case AlertSeverity.Info: {
            return 'default';
        }
        case AlertSeverity.Warning: {
            return 'warning';
        }
    }
}
