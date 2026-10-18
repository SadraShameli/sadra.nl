export enum RuleViolationKind {
    BrokeDailyStop = 'broke-daily-stop',
    ChasedLoss = 'chased-loss',
    ForcedRecovery = 'forced-recovery',
    IgnoredStop = 'ignored-stop',
    Other = 'other',
    Oversize = 'oversize',
    TiltAfterMisSize = 'tilt-after-mis-size',
    TradedWhenPayoutReady = 'traded-when-payout-ready',
    WrongInstrument = 'wrong-instrument',
}

const RULE_VIOLATION_KIND_LABEL: Readonly<Record<RuleViolationKind, string>> = {
    [RuleViolationKind.BrokeDailyStop]:
        'Traded after the documented day stop fired',
    [RuleViolationKind.ChasedLoss]:
        'Took an unplanned trade to win back a loss',
    [RuleViolationKind.ForcedRecovery]:
        'Risk above the documented rung to recover a loss',
    [RuleViolationKind.IgnoredStop]: 'Moved or ignored the stop loss',
    [RuleViolationKind.Other]: 'Other rule breach',
    [RuleViolationKind.Oversize]: 'Position above the documented size',
    [RuleViolationKind.TiltAfterMisSize]: 'Tilted after a mis-sized trade',
    [RuleViolationKind.TradedWhenPayoutReady]:
        'Risk above the documented rung while payout-eligible',
    [RuleViolationKind.WrongInstrument]:
        'Traded an instrument outside the plan',
};

export function ruleViolationKindLabel(value: RuleViolationKind): string {
    return RULE_VIOLATION_KIND_LABEL[value];
}
