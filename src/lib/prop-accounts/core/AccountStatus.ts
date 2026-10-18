export enum AccountStatus {
    Active = 'active',
    Busted = 'busted',
    Closed = 'closed',
    Concluded = 'concluded',
    Suspended = 'suspended',
}

export function isEndedStatus(status: AccountStatus): boolean {
    switch (status) {
        case AccountStatus.Active:
        case AccountStatus.Suspended: {
            return false;
        }
        case AccountStatus.Busted:
        case AccountStatus.Closed:
        case AccountStatus.Concluded: {
            return true;
        }
    }
}
