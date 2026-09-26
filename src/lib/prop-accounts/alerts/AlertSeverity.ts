export enum AlertSeverity {
    Critical = 'critical',
    Info = 'info',
    Warning = 'warning',
}

export function alertSeverityRank(severity: AlertSeverity): number {
    switch (severity) {
        case AlertSeverity.Critical: {
            return 0;
        }
        case AlertSeverity.Info: {
            return 2;
        }
        case AlertSeverity.Warning: {
            return 1;
        }
    }
}
