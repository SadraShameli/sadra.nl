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
    EVENT_LIST_INPUT,
    type HubPortfolio,
    hubPortfolioOf,
    LEDGER_LIST_INPUT,
    type SetupChecklistCardModel,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { SetupChecklistCompact } from '~/app/(app)/prop-calculator/accounts/_components/overview/SetupChecklistCard';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader } from '~/components/ui/Card';
import { Skeleton } from '~/components/ui/Skeleton';
import { useSession } from '~/lib/auth/client';
import { NOT_APPLICABLE } from '~/lib/format';
import {
    formatUsdCents,
    isActiveAccount,
    type LedgerAccountRow,
    type LedgerFeeRow,
    type LedgerPayoutRow,
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
    readonly fees: readonly LedgerFeeRow[];
    readonly payouts: readonly LedgerPayoutRow[];
    readonly portfolio: HubPortfolio | null;
}

interface HubAccountsSummary {
    readonly activeAccounts: number;
    readonly alertCount: null | number;
    readonly grossOnlyPayouts: number;
    readonly net: UsdCents;
    readonly payouts: UsdCents;
    readonly setup: null | SetupChecklistCardModel;
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

function hubAccountsSummary(inputs: HubAccountsInputs): HubAccountsSummary {
    const cash = summarizeCash(inputs.fees, inputs.payouts);
    return {
        activeAccounts: inputs.accounts.filter((account) =>
            isActiveAccount(account),
        ).length,
        alertCount: inputs.portfolio?.alertCount ?? null,
        grossOnlyPayouts: cash.grossOnlyPayouts,
        net: cash.net,
        payouts: cash.payouts,
        setup: inputs.portfolio?.setup ?? null,
        spend: cash.spend,
    };
}

function SignedInTeaser({ userId }: { readonly userId: string }) {
    const accountsQuery =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const decisionsQuery =
        api.propAccounts.decision.list.useQuery(LEDGER_LIST_INPUT);
    const eventsQuery = api.propAccounts.event.list.useQuery(EVENT_LIST_INPUT);
    const feesQuery = api.propAccounts.fee.list.useQuery(LEDGER_LIST_INPUT);
    const payoutsQuery =
        api.propAccounts.payout.list.useQuery(LEDGER_LIST_INPUT);
    const copyGroupsQuery = api.propAccounts.copyGroup.list.useQuery();
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery();
    const snapshotsQuery = api.propAccounts.snapshot.latestTwoForAll.useQuery();
    const transfersQuery = api.propAccounts.bankroll.list.useQuery();

    const failed = [accountsQuery, feesQuery, payoutsQuery].find(
        (query) => query.isError,
    );
    const alertFailure =
        [
            copyGroupsQuery,
            decisionsQuery,
            eventsQuery,
            rulebookQuery,
            snapshotsQuery,
            transfersQuery,
        ].find((query) => query.isError)?.error ?? null;
    const isAlertCountUnavailable = alertFailure !== null;

    const accounts = accountsQuery.data;
    const events = eventsQuery.data;
    const fees = feesQuery.data;
    const payouts = payoutsQuery.data;
    const copyGroups = copyGroupsQuery.data;
    const decisions = decisionsQuery.data;
    const rulebook = rulebookQuery.data;
    const snapshots = snapshotsQuery.data;
    const transfers = transfersQuery.data;
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
                fees,
                payouts,
                portfolio: null,
            });
        }
        if (
            copyGroups === undefined ||
            decisions === undefined ||
            rulebook === undefined ||
            snapshots === undefined ||
            transfers === undefined
        ) {
            return null;
        }
        const portfolio = hubPortfolioOf({
            accounts,
            copyGroups,
            decisions,
            events,
            fees,
            payouts,
            rulebook,
            snapshots,
            today: todayIsoDate(new Date()),
            transfers,
            userId,
        });
        return hubAccountsSummary({ accounts, fees, payouts, portfolio });
    }, [
        accounts,
        copyGroups,
        decisions,
        events,
        fees,
        isAlertCountUnavailable,
        payouts,
        rulebook,
        snapshots,
        transfers,
        userId,
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
            {summary.setup !== null && !summary.setup.isComplete && (
                <SetupChecklistCompact
                    href={routes.propCalculator.accounts.index}
                    model={summary.setup}
                />
            )}
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
