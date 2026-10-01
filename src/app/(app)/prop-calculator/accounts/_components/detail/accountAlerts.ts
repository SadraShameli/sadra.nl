import {
    alertsFor,
    type OverviewAlerts,
    portfolioLoad,
    type PortfolioQueries,
    PortfolioSource,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { type AccountAlert, AlertSubjectKind } from '~/lib/prop-accounts';

interface AccountAlertInputs {
    readonly accountId: string;
    readonly queries: AccountAlertQueries;
    readonly today: string;
}

type AccountAlertQueries = Partial<
    Pick<PortfolioQueries, PortfolioSource.Events>
> &
    Pick<
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
    const eventsQuery = queries[PortfolioSource.Events];
    const load = portfolioLoad({
        ...queries,
        [PortfolioSource.Decisions]: LEDGER_ONLY_SOURCE,
        [PortfolioSource.Events]: eventsQuery ?? LEDGER_ONLY_SOURCE,
        [PortfolioSource.Fees]: LEDGER_ONLY_SOURCE,
        [PortfolioSource.Transfers]: LEDGER_ONLY_SOURCE,
        [PortfolioSource.Violations]: LEDGER_ONLY_SOURCE,
    });
    return alertsFor(
        load.alerts,
        today,
        (alert) => isAboutAccount(alert, accountId),
        undefined,
        null,
        null,
        eventsQuery?.data,
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
