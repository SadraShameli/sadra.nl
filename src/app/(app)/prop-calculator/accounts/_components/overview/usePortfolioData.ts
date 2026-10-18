import { useMemo } from 'react';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { api } from '~/trpc/react';

import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
    type PortfolioLoad,
    portfolioLoad,
    type PortfolioQueries,
    PortfolioSource,
} from './overviewModel';

export function usePortfolioData(): PortfolioLoad {
    const queries = usePortfolioQueries();
    return useMemo(() => portfolioLoad(queries), [queries]);
}

export function usePortfolioQueries(): PortfolioQueries {
    const { data: accounts, error: accountsError } =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const { data: copyGroups, error: copyGroupsError } =
        api.propAccounts.copyGroup.list.useQuery();
    const { data: decisions, error: decisionsError } =
        api.propAccounts.decision.list.useQuery(LEDGER_LIST_INPUT);
    const { data: events, error: eventsError } =
        api.propAccounts.event.list.useQuery(EVENT_LIST_INPUT);
    const { data: fees, error: feesError } =
        api.propAccounts.fee.list.useQuery(LEDGER_LIST_INPUT);
    const { data: payouts, error: payoutsError } =
        api.propAccounts.payout.list.useQuery(LEDGER_LIST_INPUT);
    const { data: rulebook, error: rulebookError } =
        api.propAccounts.rulebook.get.useQuery();
    const { data: snapshots, error: snapshotsError } =
        api.propAccounts.snapshot.latestTwoForAll.useQuery();
    const { data: transfers, error: transfersError } =
        api.propAccounts.bankroll.list.useQuery();
    const { data: violations, error: violationsError } =
        api.propAccounts.violation.list.useQuery(LEDGER_LIST_INPUT);
    return useMemo(
        () => ({
            [PortfolioSource.Accounts]: {
                data: accounts,
                error: accountsError,
            },
            [PortfolioSource.CopyGroups]: {
                data: copyGroups,
                error: copyGroupsError,
            },
            [PortfolioSource.Decisions]: {
                data: decisions,
                error: decisionsError,
            },
            [PortfolioSource.Events]: { data: events, error: eventsError },
            [PortfolioSource.Fees]: { data: fees, error: feesError },
            [PortfolioSource.Payouts]: {
                data: payouts,
                error: payoutsError,
            },
            [PortfolioSource.Rulebook]: {
                data: rulebook,
                error: rulebookError,
            },
            [PortfolioSource.Snapshots]: {
                data: snapshots,
                error: snapshotsError,
            },
            [PortfolioSource.Transfers]: {
                data: transfers,
                error: transfersError,
            },
            [PortfolioSource.Violations]: {
                data: violations,
                error: violationsError,
            },
        }),
        [
            accounts,
            accountsError,
            copyGroups,
            copyGroupsError,
            decisions,
            decisionsError,
            events,
            eventsError,
            fees,
            feesError,
            payouts,
            payoutsError,
            rulebook,
            rulebookError,
            snapshots,
            snapshotsError,
            transfers,
            transfersError,
            violations,
            violationsError,
        ],
    );
}
