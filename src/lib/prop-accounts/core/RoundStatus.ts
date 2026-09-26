export enum RoundStatus {
    Closed = 'closed',
    Open = 'open',
}

const ROUND_STATUS_LABEL: Readonly<Record<RoundStatus, string>> = {
    [RoundStatus.Closed]: 'Closed',
    [RoundStatus.Open]: 'Open',
};

export function roundStatusLabel(value: RoundStatus): string {
    return ROUND_STATUS_LABEL[value];
}
