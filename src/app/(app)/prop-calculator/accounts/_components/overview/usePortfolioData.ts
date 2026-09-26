import { useMemo } from 'react';

import { api } from '~/trpc/react';

import { ACCOUNT_LIST_INPUT } from '../accountListFilters';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
    type PortfolioLoad,
    portfolioLoad,
    PortfolioSource,
} from './overviewModel';

export function usePortfolioData(): PortfolioLoad {
    const { data: accounts, error: accountsError } =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const { data: copyGroups, error: copyGroupsError } =
        api.propAccounts.copyGroup.list.useQuery();
    const { data: events, error: eventsError } =
        api.propAccounts.event.list.useQuery(EVENT_LIST_INPUT);
    const { data: fees, error: feesError } =
        api.propAccounts.fee.list.useQuery(LEDGER_LIST_INPUT);
    const { data: payouts, error: payoutsError } =
        api.propAccounts.payout.list.useQuery(LEDGER_LIST_INPUT);
    const { data: rulebook, error: rulebookError } =
        api.propAccounts.rulebook.get.useQuery();
    const { data: snapshots, error: snapshotsError } =
        api.propAccounts.snapshot.latestForAll.useQuery();
    return useMemo(
        () =>
            portfolioLoad({
                [PortfolioSource.Accounts]: {
                    data: accounts,
                    error: accountsError,
                },
                [PortfolioSource.CopyGroups]: {
                    data: copyGroups,
                    error: copyGroupsError,
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
            }),
        [
            accounts,
            accountsError,
            copyGroups,
            copyGroupsError,
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
        ],
    );
}
