'use client';

import { useMemo } from 'react';

import { useTodayIsoDate } from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { IsoDateError, PortfolioLedger } from '~/lib/prop-accounts';
import {
    type RealizedLossRisk,
    realizedLossRisk,
} from '~/lib/prop-accounts/bankroll';
import {
    CENTS_PER_DOLLAR,
    type Dollars,
    type Fraction0to1,
} from '~/lib/prop-calculator';
import { LOSS_RISK_DRAWS } from '~/lib/prop-calculator/economics';
import { api } from '~/trpc/react';

export enum RealizedBankrollRiskStatus {
    Failed = 'failed',
    Loading = 'loading',
    Ready = 'ready',
}

export interface RealizedBankrollRiskInputs {
    readonly budget: Dollars | null;
    readonly costPerAttempt: number;
    readonly lossThreshold: Fraction0to1 | null;
    readonly userId: string;
}

export type RealizedBankrollRiskState =
    | {
          readonly risk: RealizedLossRisk;
          readonly status: RealizedBankrollRiskStatus.Ready;
      }
    | {
          readonly status:
              | RealizedBankrollRiskStatus.Failed
              | RealizedBankrollRiskStatus.Loading;
      };

const REALIZED_RISK_SEED = 42;
const TO_FIRST_PAYOUT_FALLBACK_DAYS = 30;

export function useRealizedBankrollRisk({
    budget,
    costPerAttempt,
    lossThreshold,
    userId,
}: RealizedBankrollRiskInputs): RealizedBankrollRiskState {
    const today = useTodayIsoDate();
    const accountsQuery =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const eventsQuery = api.propAccounts.event.list.useQuery(EVENT_LIST_INPUT);
    const feesQuery = api.propAccounts.fee.list.useQuery(LEDGER_LIST_INPUT);
    const payoutsQuery =
        api.propAccounts.payout.list.useQuery(LEDGER_LIST_INPUT);

    const accounts = accountsQuery.data;
    const events = eventsQuery.data;
    const fees = feesQuery.data;
    const payouts = payoutsQuery.data;
    const hasFailure = [
        accountsQuery,
        eventsQuery,
        feesQuery,
        payoutsQuery,
    ].some((query) => query.isError && query.data === undefined);

    return useMemo((): RealizedBankrollRiskState => {
        if (hasFailure) return { status: RealizedBankrollRiskStatus.Failed };
        if (
            accounts === undefined ||
            events === undefined ||
            fees === undefined ||
            payouts === undefined
        ) {
            return { status: RealizedBankrollRiskStatus.Loading };
        }
        try {
            return {
                risk: realizedLossRisk({
                    asOfDate: today,
                    attemptCostCents: Math.round(
                        costPerAttempt * CENTS_PER_DOLLAR,
                    ),
                    availableCents: Math.round(
                        (budget ?? 0) * CENTS_PER_DOLLAR,
                    ),
                    draws: LOSS_RISK_DRAWS,
                    ledger: PortfolioLedger.fromRows(userId, {
                        accounts,
                        events,
                        fees,
                        payouts,
                    }),
                    lossRiskThreshold: lossThreshold,
                    seed: REALIZED_RISK_SEED,
                    toFirstPayoutFallbackDays: TO_FIRST_PAYOUT_FALLBACK_DAYS,
                }),
                status: RealizedBankrollRiskStatus.Ready,
            };
        } catch (error) {
            if (error instanceof IsoDateError) {
                return { status: RealizedBankrollRiskStatus.Failed };
            }
            throw error;
        }
    }, [
        accounts,
        budget,
        costPerAttempt,
        events,
        fees,
        hasFailure,
        lossThreshold,
        payouts,
        today,
        userId,
    ]);
}
