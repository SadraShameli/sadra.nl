'use client';

import { Wallet } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useMemo } from 'react';

import StatCard from '~/app/(app)/prop-calculator/_components/StatCard';
import {
    ACCOUNT_LIST_INPUT,
    type AccountListAccount,
} from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { GrossOnlyPayoutsNote } from '~/app/(app)/prop-calculator/accounts/_components/GrossOnlyPayoutsNote';
import {
    accountStatesForRows,
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
    type OverviewSnapshotRow,
    portfolioAlerts,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader } from '~/components/ui/Card';
import { Skeleton } from '~/components/ui/Skeleton';
import { useSession } from '~/lib/auth/client';
import { NOT_APPLICABLE } from '~/lib/format';
import {
    type AccountStateEntry,
    type AlertInputs,
    formatUsdCents,
    isActiveAccount,
    type LedgerAccountRow,
    type LedgerEventRow,
    type LedgerFeeRow,
    type LedgerPayoutRow,
    NO_ACCOUNT_STATES,
    summarizeCash,
    todayIsoDate,
    type UsdCents,
} from '~/lib/prop-accounts';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api } from '~/trpc/react';

interface HubAccountsInputs {
    readonly accounts: readonly (AccountListAccount & LedgerAccountRow)[];
    readonly alerts: AlertInputs | null;
    readonly fees: readonly LedgerFeeRow[];
    readonly payouts: readonly LedgerPayoutRow[];
}

interface HubAccountsSummary {
    readonly activeAccounts: number;
    readonly alertCount: null | number;
    readonly grossOnlyPayouts: number;
    readonly net: UsdCents;
    readonly payouts: UsdCents;
    readonly spend: UsdCents;
}

export function HubAccountsTeaser() {
    const session = useSession();
    if (session.isPending) return <TeaserSkeleton />;
    if (session.error !== null) {
        return (
            <TeaserFrame>
                <p className="text-sm text-muted-foreground">
                    Could not check whether you are signed in, so your account
                    totals are not shown.
                </p>
                <Button
                    className="self-start"
                    onClick={() => void session.refetch()}
                    size="sm"
                    variant="outline"
                >
                    Try again
                </Button>
            </TeaserFrame>
        );
    }
    return session.data?.user.id === undefined ? (
        <SignInCallToAction />
    ) : (
        <SignedInTeaser userId={session.data.user.id} />
    );
}

function accountStatesOrNone(
    userId: string,
    today: string,
    accounts: HubAccountsInputs['accounts'],
    events: readonly LedgerEventRow[] | undefined,
    payouts: readonly LedgerPayoutRow[],
    snapshots: readonly OverviewSnapshotRow[],
): readonly AccountStateEntry[] {
    return events === undefined
        ? NO_ACCOUNT_STATES
        : accountStatesForRows(
              userId,
              today,
              accounts,
              events,
              payouts,
              snapshots,
          );
}

function hubAccountsSummary(inputs: HubAccountsInputs): HubAccountsSummary {
    const cash = summarizeCash(inputs.fees, inputs.payouts);
    return {
        activeAccounts: inputs.accounts.filter((account) =>
            isActiveAccount(account),
        ).length,
        alertCount:
            inputs.alerts === null
                ? null
                : portfolioAlerts(inputs.alerts).length,
        grossOnlyPayouts: cash.grossOnlyPayouts,
        net: cash.net,
        payouts: cash.payouts,
        spend: cash.spend,
    };
}

function SignedInTeaser({ userId }: { readonly userId: string }) {
    const accountsQuery =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const eventsQuery = api.propAccounts.event.list.useQuery(EVENT_LIST_INPUT);
    const feesQuery = api.propAccounts.fee.list.useQuery(LEDGER_LIST_INPUT);
    const payoutsQuery =
        api.propAccounts.payout.list.useQuery(LEDGER_LIST_INPUT);
    const copyGroupsQuery = api.propAccounts.copyGroup.list.useQuery();
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery();
    const snapshotsQuery = api.propAccounts.snapshot.latestForAll.useQuery();

    const failed = [accountsQuery, feesQuery, payoutsQuery].find(
        (query) => query.isError,
    );
    const alertFailure =
        [eventsQuery, copyGroupsQuery, rulebookQuery, snapshotsQuery].find(
            (query) => query.isError,
        )?.error ?? null;
    const isAlertCountUnavailable = alertFailure !== null;

    const accounts = accountsQuery.data;
    const events = eventsQuery.data;
    const fees = feesQuery.data;
    const payouts = payoutsQuery.data;
    const copyGroups = copyGroupsQuery.data;
    const rulebook = rulebookQuery.data;
    const snapshots = snapshotsQuery.data;
    const summary = useMemo(() => {
        if (
            accounts === undefined ||
            fees === undefined ||
            payouts === undefined
        ) {
            return null;
        }
        if (isAlertCountUnavailable) {
            return hubAccountsSummary({
                accounts,
                alerts: null,
                fees,
                payouts,
            });
        }
        if (
            copyGroups === undefined ||
            rulebook === undefined ||
            snapshots === undefined
        ) {
            return null;
        }
        const today = todayIsoDate(new Date());
        return hubAccountsSummary({
            accounts,
            alerts: {
                accounts,
                accountStates: accountStatesOrNone(
                    userId,
                    today,
                    accounts,
                    events,
                    payouts,
                    snapshots,
                ),
                copyGroups,
                payouts,
                rulebook,
                snapshots,
                today,
            },
            fees,
            payouts,
        });
    }, [
        accounts,
        isAlertCountUnavailable,
        copyGroups,
        events,
        fees,
        payouts,
        rulebook,
        userId,
        snapshots,
    ]);

    if (failed?.error) {
        return (
            <TeaserFrame>
                <p className="text-sm text-muted-foreground">
                    Your account totals could not be loaded:{' '}
                    {failed.error.message}
                </p>
            </TeaserFrame>
        );
    }
    if (summary === null) return <TeaserSkeleton />;

    return (
        <TeaserFrame>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <StatCard label="Spend" value={formatUsdCents(summary.spend)} />
                <StatCard
                    label="Payouts received"
                    value={formatUsdCents(summary.payouts)}
                />
                <StatCard
                    label="Net"
                    value={formatUsdCents(summary.net)}
                    valueClassName={
                        summary.net < 0 ? 'text-red-400' : 'text-emerald-400'
                    }
                />
                <StatCard
                    label="Active accounts"
                    value={String(summary.activeAccounts)}
                />
                <StatCard
                    label="Alerts"
                    value={
                        summary.alertCount === null
                            ? NOT_APPLICABLE
                            : String(summary.alertCount)
                    }
                    valueClassName={
                        summary.alertCount !== null && summary.alertCount > 0
                            ? 'text-amber-400'
                            : undefined
                    }
                />
            </div>
            {alertFailure !== null && (
                <p className="text-sm text-muted-foreground">
                    The alert count could not be checked: {alertFailure.message}
                </p>
            )}
            <GrossOnlyPayoutsNote count={summary.grossOnlyPayouts} />
            <Button asChild className="self-start" size="sm" variant="outline">
                <Link href={routes.propCalculator.accounts.index}>
                    Open your accounts
                </Link>
            </Button>
        </TeaserFrame>
    );
}

function SignInCallToAction() {
    return (
        <TeaserFrame>
            <p className="text-sm text-muted-foreground">
                Sign in to track your prop accounts: spend, payouts received and
                net, balances, alerts and sizing advice per account.
            </p>
            <Button asChild className="self-start" size="sm">
                <Link
                    href={loginRedirectFor(
                        routes.propCalculator.accounts.index,
                    )}
                >
                    Sign in
                </Link>
            </Button>
        </TeaserFrame>
    );
}

function TeaserFrame({ children }: { children: ReactNode }) {
    return (
        <section aria-labelledby="hub-accounts-teaser" className="mt-10">
            <Card className={cn('app-prop-calculator__accounts-teaser')}>
                <CardHeader>
                    <h2
                        className="flex items-center gap-2 text-lg font-semibold tracking-tight text-white"
                        id="hub-accounts-teaser"
                    >
                        <Wallet aria-hidden className="size-4 text-primary" />
                        My accounts
                    </h2>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {children}
                </CardContent>
            </Card>
        </section>
    );
}

function TeaserSkeleton() {
    return <Skeleton className="mt-10 h-40 w-full" />;
}
