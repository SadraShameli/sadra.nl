export enum BustCause {
    ConsistencyBreach = 'consistency-breach',
    DailyLossLimit = 'daily-loss-limit',
    FirmRuleViolation = 'firm-rule-violation',
    Inactivity = 'inactivity',
    MaxDrawdown = 'max-drawdown',
    Unknown = 'unknown',
}

const BUST_CAUSE_LABEL: Readonly<Record<BustCause, string>> = {
    [BustCause.ConsistencyBreach]: 'Consistency rule',
    [BustCause.DailyLossLimit]: 'Daily loss limit',
    [BustCause.FirmRuleViolation]: 'Another firm rule',
    [BustCause.Inactivity]: 'Inactivity',
    [BustCause.MaxDrawdown]: 'Maximum drawdown',
    [BustCause.Unknown]: 'Unknown',
};

export function bustCauseLabel(value: BustCause): string {
    return BUST_CAUSE_LABEL[value];
}
