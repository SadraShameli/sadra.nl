import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { useTRPC } from '~/trpc/react';

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
    const api = useTRPC();
    const { data: accounts, error: accountsError } = useQuery(
        api.propAccounts.account.list.queryOptions(ACCOUNT_LIST_INPUT),
    );
    const { data: copyGroups, error: copyGroupsError } = useQuery(
        api.propAccounts.copyGroup.list.queryOptions(),
    );
    const { data: decisions, error: decisionsError } = useQuery(
        api.propAccounts.decision.list.queryOptions(LEDGER_LIST_INPUT),
    );
    const { data: events, error: eventsError } = useQuery(
        api.propAccounts.event.list.queryOptions(EVENT_LIST_INPUT),
    );
    const { data: fees, error: feesError } = useQuery(
        api.propAccounts.fee.list.queryOptions(LEDGER_LIST_INPUT),
    );
    const { data: payouts, error: payoutsError } = useQuery(
        api.propAccounts.payout.list.queryOptions(LEDGER_LIST_INPUT),
    );
    const { data: rulebook, error: rulebookError } = useQuery(
        api.propAccounts.rulebook.get.queryOptions(),
    );
    const { data: snapshots, error: snapshotsError } = useQuery(
        api.propAccounts.snapshot.latestTwoForAll.queryOptions(),
    );
    const { data: transfers, error: transfersError } = useQuery(
        api.propAccounts.bankroll.list.queryOptions(),
    );
    const { data: violations, error: violationsError } = useQuery(
        api.propAccounts.violation.list.queryOptions(LEDGER_LIST_INPUT),
    );
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
