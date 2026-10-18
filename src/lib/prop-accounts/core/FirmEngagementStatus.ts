export enum FirmEngagementStatus {
    Active = 'active',
    Paused = 'paused',
    Retired = 'retired',
}

const FIRM_ENGAGEMENT_STATUS_LABEL: Readonly<
    Record<FirmEngagementStatus, string>
> = {
    [FirmEngagementStatus.Active]: 'Active',
    [FirmEngagementStatus.Paused]: 'Paused',
    [FirmEngagementStatus.Retired]: 'Retired',
};

export function firmEngagementStatusLabel(value: FirmEngagementStatus): string {
    return FIRM_ENGAGEMENT_STATUS_LABEL[value];
}
