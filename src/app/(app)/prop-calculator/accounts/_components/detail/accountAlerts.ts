import { type AccountAlert, AlertSubjectKind } from '~/lib/prop-accounts';

import {
    alertsFor,
    type OverviewAlerts,
    portfolioLoad,
    type PortfolioQueries,
    PortfolioSource,
} from '../overview/overviewModel';

interface AccountAlertInputs {
    readonly accountId: string;
    readonly queries: AccountAlertQueries;
    readonly today: string;
}

type AccountAlertQueries = Pick<
    PortfolioQueries,
    | PortfolioSource.Accounts
    | PortfolioSource.CopyGroups
    | PortfolioSource.Payouts
    | PortfolioSource.Rulebook
    | PortfolioSource.Snapshots
>;

const LEDGER_ONLY_SOURCE = { data: undefined, error: null } as const;

export function accountAlerts({
    accountId,
    queries,
    today,
}: AccountAlertInputs): OverviewAlerts {
    const load = portfolioLoad({
        ...queries,
        [PortfolioSource.Events]: LEDGER_ONLY_SOURCE,
        [PortfolioSource.Fees]: LEDGER_ONLY_SOURCE,
        [PortfolioSource.Transfers]: LEDGER_ONLY_SOURCE,
    });
    return alertsFor(load.alerts, today, (alert) =>
        isAboutAccount(alert, accountId),
    );
}

function isAboutAccount(alert: AccountAlert, accountId: string): boolean {
    const { subject } = alert;
    switch (subject.kind) {
        case AlertSubjectKind.Account: {
            return subject.accountId === accountId;
        }
        case AlertSubjectKind.CopyGroup:
        case AlertSubjectKind.Portfolio: {
            return subject.accountIds.includes(accountId);
        }
    }
}
