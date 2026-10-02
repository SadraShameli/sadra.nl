'use client';

import { useMemo } from 'react';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { useSession } from '~/lib/auth/client';
import { PortfolioLedger, todayIsoDate } from '~/lib/prop-accounts';
import { liveTransferRate } from '~/lib/prop-accounts/firms';
import { type FirmId } from '~/lib/prop-calculator';
import { api } from '~/trpc/react';

import { type MeasuredHazard, measuredHazardsOf } from './rulebookFormValues';

export interface MeasuredHazardsState {
    readonly failed: boolean;
    readonly measured: Partial<Record<FirmId, MeasuredHazard>>;
    readonly pending: boolean;
}

const NOTHING_MEASURED: Partial<Record<FirmId, MeasuredHazard>> = {};
const PENDING: MeasuredHazardsState = {
    failed: false,
    measured: NOTHING_MEASURED,
    pending: true,
};
const FAILED: MeasuredHazardsState = {
    failed: true,
    measured: NOTHING_MEASURED,
    pending: false,
};
const NOT_AVAILABLE: MeasuredHazardsState = {
    failed: false,
    measured: NOTHING_MEASURED,
    pending: false,
};

export function useMeasuredHazards(): MeasuredHazardsState {
    const session = useSession();
    const accountsQuery =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const eventsQuery = api.propAccounts.event.list.useQuery(EVENT_LIST_INPUT);
    const feesQuery = api.propAccounts.fee.list.useQuery(LEDGER_LIST_INPUT);
    const payoutsQuery =
        api.propAccounts.payout.list.useQuery(LEDGER_LIST_INPUT);
    const userId = session.data?.user.id;
    const isSessionPending = session.isPending;
    const accounts = accountsQuery.data;
    const events = eventsQuery.data;
    const fees = feesQuery.data;
    const payouts = payoutsQuery.data;
    const isQueryFailed =
        accountsQuery.isError ||
        eventsQuery.isError ||
        feesQuery.isError ||
        payoutsQuery.isError;

    return useMemo(() => {
        if (isQueryFailed) return FAILED;
        if (
            accounts === undefined ||
            events === undefined ||
            fees === undefined ||
            payouts === undefined
        ) {
            return PENDING;
        }
        if (userId === undefined) {
            return isSessionPending ? PENDING : NOT_AVAILABLE;
        }
        try {
            const ledger = PortfolioLedger.fromRows(userId, {
                accounts,
                events,
                fees,
                payouts,
            });
            const today = todayIsoDate(new Date());
            return {
                failed: false,
                measured: measuredHazardsOf(liveTransferRate(ledger, today)),
                pending: false,
            };
        } catch {
            return FAILED;
        }
    }, [
        accounts,
        events,
        fees,
        isQueryFailed,
        isSessionPending,
        payouts,
        userId,
    ]);
}
