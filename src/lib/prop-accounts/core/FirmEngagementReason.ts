export enum FirmEngagementReason {
    Capacity = 'capacity',
    LiveCooldown = 'live-cooldown',
    LowExpectedValue = 'low-expected-value',
    Other = 'other',
    PayoutIssue = 'payout-issue',
    RulesChanged = 'rules-changed',
    SentLive = 'sent-live',
}

const FIRM_ENGAGEMENT_REASON_LABEL: Readonly<
    Record<FirmEngagementReason, string>
> = {
    [FirmEngagementReason.Capacity]: 'At your account capacity',
    [FirmEngagementReason.LiveCooldown]: 'Cooling off after a live transfer',
    [FirmEngagementReason.LowExpectedValue]: 'Low expected value',
    [FirmEngagementReason.Other]: 'Other',
    [FirmEngagementReason.PayoutIssue]: 'Payout problem',
    [FirmEngagementReason.RulesChanged]: 'Rules changed',
    [FirmEngagementReason.SentLive]: 'Sent live',
};

export function firmEngagementReasonLabel(value: FirmEngagementReason): string {
    return FIRM_ENGAGEMENT_REASON_LABEL[value];
}
