'use client';

import { useMemo } from 'react';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { useSession } from '~/lib/auth/client';
import { firmKeyId, PortfolioLedger, todayIsoDate } from '~/lib/prop-accounts';
import {
    type LiveTransferRate,
    liveTransferRate,
    type LiveTransferRateUnavailable,
    liveTransferUnavailableText,
    recordedAtLiveText,
} from '~/lib/prop-accounts/firms';
import { type FirmId } from '~/lib/prop-calculator';
import { api } from '~/trpc/react';

import {
    type MeasuredHazard,
    measuredHazardsOf,
    modeledFirmRows,
    recordedAtLiveByFirm,
} from './rulebookFormValues';

export interface MeasuredHazardsState {
    readonly failed: boolean;
    readonly measured: Partial<Record<FirmId, MeasuredHazard>>;
    readonly pending: boolean;
    readonly unavailable: Partial<Record<FirmId, UnavailableHazard>>;
}

interface UnavailableHazard {
    readonly reason: LiveTransferRateUnavailable;
    readonly text: string;
}

const NOTHING_MEASURED: Partial<Record<FirmId, MeasuredHazard>> = {};
const NOTHING_UNAVAILABLE: Partial<Record<FirmId, UnavailableHazard>> = {};
const PENDING: MeasuredHazardsState = {
    failed: false,
    measured: NOTHING_MEASURED,
    pending: true,
    unavailable: NOTHING_UNAVAILABLE,
};
const FAILED: MeasuredHazardsState = {
    failed: true,
    measured: NOTHING_MEASURED,
    pending: false,
    unavailable: NOTHING_UNAVAILABLE,
};
const NOT_AVAILABLE: MeasuredHazardsState = {
    failed: false,
    measured: NOTHING_MEASURED,
    pending: false,
    unavailable: NOTHING_UNAVAILABLE,
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
        const ledger = ledgerOf(userId, { accounts, events, fees, payouts });
        if (ledger === null) return FAILED;
        const rate = liveTransferRate(ledger, todayIsoDate(new Date()));
        return {
            failed: false,
            measured: measuredHazardsOf(rate, ledger),
            pending: false,
            unavailable: unavailableHazardsOf(rate, ledger),
        };
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

function ledgerOf(
    userId: string,
    rows: Parameters<typeof PortfolioLedger.fromRows>[1],
): null | PortfolioLedger {
    try {
        return PortfolioLedger.fromRows(userId, rows);
    } catch (error) {
        console.error(
            'Could not read the ledger rows for measured rates',
            error,
        );
        return null;
    }
}

function unavailableHazardsOf(
    rate: LiveTransferRate,
    ledger: PortfolioLedger,
): Partial<Record<FirmId, UnavailableHazard>> {
    const recordedAtLive = recordedAtLiveByFirm(ledger);
    const unavailable: Partial<Record<FirmId, UnavailableHazard>> = {};
    for (const { firmId, row } of modeledFirmRows(rate.perFirm)) {
        if (row.perPaidPayoutUnavailable === null) continue;
        const recordedCount = recordedAtLive.get(firmKeyId(row.firmKey)) ?? 0;
        const reasonText = liveTransferUnavailableText(
            row.perPaidPayoutUnavailable,
            row,
        );
        unavailable[firmId] = {
            reason: row.perPaidPayoutUnavailable,
            text:
                recordedCount > 0
                    ? `${reasonText}, ${recordedAtLiveText(recordedCount)}`
                    : reasonText,
        };
    }
    return unavailable;
}
