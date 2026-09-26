'use client';

import { Pencil, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Skeleton } from '~/components/ui/Skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { errorMessage } from '~/lib/errorMessage';
import {
    accountStageLabel,
    findStoredFirm,
    formatUsdCents,
    type PlanKeyResolution,
    PlanKeyResolutionKind,
    PortfolioLedger,
    RebuyLagBasis,
    rebuyLagDefault,
    replacementStats,
    resolvePlanKey,
    todayIsoDate,
} from '~/lib/prop-accounts';
import {
    PropRecord,
    type PropRejection,
    propRejectionOf,
    PropStoredRecordRejection,
} from '~/lib/schemas/propAccountOutputs';
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

import {
    ACCOUNT_LIST_INPUT,
    accountStatusLabel,
    readIssuesOf,
    readOnlyAccountNotice,
} from '../accountListFilters';
import { ArchiveAccountButton } from '../AccountsTable';
import { DeleteAccountDialog } from '../DeleteAccountDialog';
import { AlertsCenter } from '../overview/AlertsCenter';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
    ledgerOrDateFailure,
    type OverviewAlerts,
    OverviewSectionStatus,
    PortfolioSource,
} from '../overview/overviewModel';
import { accountAlerts } from './accountAlerts';
import {
    DetailSection,
    type ListQuery,
    ListQueryStatus,
    RemoveRecordDialog,
} from './DetailParts';
import { EventsSection } from './EventsSection';
import { FeesSection } from './FeesSection';
import { PayoutsSection } from './PayoutsSection';
import { PlanRulesSummary } from './PlanRulesSummary';
import { SnapshotHistoryChart } from './SnapshotHistoryChart';
import { snapshotSeries } from './snapshotSeries';

enum LagLineKind {
    Failed = 'failed',
    Measured = 'measured',
}

type AccountEventRow = RouterOutputs['propAccounts']['event']['list'][number];

interface LagLine {
    readonly kind: LagLineKind;
    readonly text: string;
}

type ListedAccount = RouterOutputs['propAccounts']['account']['list'][number];

interface ReplacementView {
    readonly lag: LagLine | null;
    readonly replacedBy: readonly ListedAccount[];
    readonly replaces: ListedAccount | null;
}

type SnapshotRow =
    RouterOutputs['propAccounts']['snapshot']['listForAccount'][number];

type StoredAccount = RouterOutputs['propAccounts']['account']['get'];

interface StoredRecordIssue {
    readonly message: string;
    readonly rejection: PropRejection;
}

export function AccountDetailView({
    id,
    userId,
}: {
    readonly id: string;
    readonly userId: string;
}) {
    const accountQuery = api.propAccounts.account.get.useQuery({ id });
    const accountsQuery =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const snapshotsQuery = api.propAccounts.snapshot.listForAccount.useQuery({
        id,
    });
    const payoutsQuery = api.propAccounts.payout.list.useQuery({
        accountId: id,
    });
    const feesQuery = api.propAccounts.fee.list.useQuery({ accountId: id });
    const eventsQuery = api.propAccounts.event.listForAccount.useQuery({ id });
    const allEventsQuery =
        api.propAccounts.event.list.useQuery(EVENT_LIST_INPUT);
    const allPayoutsQuery =
        api.propAccounts.payout.list.useQuery(LEDGER_LIST_INPUT);
    const copyGroupsQuery = api.propAccounts.copyGroup.list.useQuery();
    const latestSnapshotsQuery =
        api.propAccounts.snapshot.latestForAll.useQuery();
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery();
    const [storedIssue, setStoredIssue] = useState<null | StoredRecordIssue>(
        null,
    );

    const reportFailure = useCallback((error: unknown) => {
        const rejection = propRejectionOf(error);
        if (
            rejection?.reason === PropStoredRecordRejection.InvalidStoredRecord
        ) {
            setStoredIssue({ message: errorMessage(error), rejection });
            return;
        }
        toast.error(errorMessage(error));
    }, []);

    const account = accountQuery.data;
    const alerts = useMemo<OverviewAlerts>(
        () =>
            accountAlerts({
                accountId: id,
                queries: {
                    [PortfolioSource.Accounts]: {
                        data: accountsQuery.data,
                        error: accountsQuery.error,
                    },
                    [PortfolioSource.CopyGroups]: {
                        data: copyGroupsQuery.data,
                        error: copyGroupsQuery.error,
                    },
                    [PortfolioSource.Payouts]: {
                        data: allPayoutsQuery.data,
                        error: allPayoutsQuery.error,
                    },
                    [PortfolioSource.Rulebook]: {
                        data: rulebookQuery.data,
                        error: rulebookQuery.error,
                    },
                    [PortfolioSource.Snapshots]: {
                        data: latestSnapshotsQuery.data,
                        error: latestSnapshotsQuery.error,
                    },
                },
                today: todayIsoDate(new Date()),
            }),
        [
            accountsQuery.data,
            accountsQuery.error,
            allPayoutsQuery.data,
            allPayoutsQuery.error,
            copyGroupsQuery.data,
            copyGroupsQuery.error,
            id,
            latestSnapshotsQuery.data,
            latestSnapshotsQuery.error,
            rulebookQuery.data,
            rulebookQuery.error,
        ],
    );

    if (account === undefined) {
        return accountQuery.error === null ? (
            <div aria-busy="true" aria-label="Loading the account">
                <Skeleton className="h-96 w-full" />
            </div>
        ) : (
            <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>The account could not be loaded</AlertTitle>
                <AlertDescription>
                    {accountQuery.error.message}
                </AlertDescription>
            </Alert>
        );
    }

    const resolution = resolvePlanKey(account);
    const issues = readIssuesOf(account, resolution);
    const plan =
        resolution.kind === PlanKeyResolutionKind.Resolved
            ? resolution.plan
            : null;
    const isReadOnly = plan === null || issues.length > 0;

    return (
        <div className="flex flex-col gap-8">
            <AccountHeader
                account={account}
                isReadOnly={isReadOnly}
                resolution={resolution}
            />
            {accountQuery.error !== null && (
                <Alert variant="warning">
                    <TriangleAlert />
                    <AlertTitle>The account could not be refreshed</AlertTitle>
                    <AlertDescription>
                        {accountQuery.error.message}
                    </AlertDescription>
                </Alert>
            )}
            {isReadOnly && (
                <Alert variant="warning">
                    <TriangleAlert />
                    <AlertTitle>This account is read-only</AlertTitle>
                    <AlertDescription>
                        {readOnlyAccountNotice(account, issues)}
                    </AlertDescription>
                </Alert>
            )}
            {storedIssue !== null && (
                <StoredRecordNotice
                    account={account}
                    issue={storedIssue}
                    onResolved={() => {
                        setStoredIssue(null);
                    }}
                />
            )}
            <DetailSection id="rules" title="Plan rules">
                {plan === null ? (
                    <p className="text-sm text-muted-foreground">
                        The plan rules cannot be shown because the stored plan
                        cannot be resolved.
                    </p>
                ) : (
                    <PlanRulesSummary
                        firmName={
                            findStoredFirm(account.firmId)?.displayName ??
                            account.firmId
                        }
                        optIns={account.optIns}
                        plan={plan}
                    />
                )}
            </DetailSection>
            <DetailSection id="alerts" title="Alerts">
                <AccountAlerts alerts={alerts} />
            </DetailSection>
            <DetailSection id="snapshots" title="Snapshot history">
                <SnapshotHistory
                    eventsQuery={eventsQuery}
                    onFailure={reportFailure}
                    query={snapshotsQuery}
                />
            </DetailSection>
            <DetailSection id="payouts" title="Payouts">
                <PayoutsSection
                    accountId={account.id}
                    canRecord={!isReadOnly}
                    onFailure={reportFailure}
                    query={payoutsQuery}
                />
            </DetailSection>
            <DetailSection id="fees" title="Fees">
                <FeesSection
                    accountId={account.id}
                    canRecord={!isReadOnly}
                    onFailure={reportFailure}
                    plan={plan}
                    query={feesQuery}
                />
            </DetailSection>
            <DetailSection id="events" title="Events">
                <EventsSection
                    accountId={account.id}
                    onFailure={reportFailure}
                    plan={isReadOnly ? null : plan}
                    query={eventsQuery}
                    state={account}
                />
            </DetailSection>
            <DetailSection id="replacement" title="Replacement chain">
                <ReplacementChain
                    account={account}
                    accountsQuery={accountsQuery}
                    eventsQuery={allEventsQuery}
                    userId={userId}
                />
            </DetailSection>
        </div>
    );
}

function AccountAlerts({ alerts }: { readonly alerts: OverviewAlerts }) {
    switch (alerts.kind) {
        case OverviewSectionStatus.Failed: {
            return <p className="text-sm text-destructive">{alerts.message}</p>;
        }
        case OverviewSectionStatus.Pending: {
            return (
                <div aria-busy="true" aria-label="Loading the alerts">
                    <Skeleton className="h-16 w-full" />
                </div>
            );
        }
        case OverviewSectionStatus.Ready: {
            return <AlertsCenter alerts={alerts.alerts} />;
        }
    }
}

function AccountHeader({
    account,
    isReadOnly,
    resolution,
}: {
    readonly account: StoredAccount;
    readonly isReadOnly: boolean;
    readonly resolution: PlanKeyResolution;
}) {
    const router = useRouter();
    const firm = findStoredFirm(account.firmId);
    const planLabel =
        resolution.kind === PlanKeyResolutionKind.Resolved
            ? resolution.plan.label
            : account.planSerial;
    return (
        <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-2">
                <Link
                    className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                    href={routes.propCalculator.accounts.index}
                >
                    All accounts
                </Link>
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    {account.label}
                </h1>
                <p className="text-sm text-muted-foreground sm:text-base">
                    {firm?.displayName ?? account.firmId} {planLabel}
                    {account.externalAlias === null
                        ? ''
                        : `, dashboard name ${account.externalAlias}`}
                </p>
                <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                        {accountStageLabel(account.stage)}
                    </Badge>
                    <Badge variant="outline">
                        {accountStatusLabel(account.status)}
                    </Badge>
                    {account.archivedAt !== null && (
                        <Badge variant="outline">Archived</Badge>
                    )}
                    {account.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                            {tag}
                        </Badge>
                    ))}
                </div>
            </div>
            <div className="flex items-center gap-1">
                {!isReadOnly && (
                    <Button asChild variant="outline">
                        <Link
                            href={routes.propCalculator.accounts.edit(
                                account.id,
                            )}
                        >
                            <Pencil />
                            Edit
                        </Link>
                    </Button>
                )}
                <ArchiveAccountButton account={account} />
                <DeleteAccountDialog
                    accountId={account.id}
                    label={account.label}
                    onDeleted={() => {
                        router.push(routes.propCalculator.accounts.index);
                    }}
                />
            </div>
        </header>
    );
}

function measuredLag(
    accounts: readonly ListedAccount[],
    events: readonly AccountEventRow[],
    account: StoredAccount,
    userId: string,
): LagLine | null {
    const computed = ledgerOrDateFailure(() =>
        rebuyLagDefault(
            replacementStats(
                PortfolioLedger.fromRows(userId, {
                    accounts,
                    events,
                    fees: [],
                    payouts: [],
                }),
            ),
            account.planSerial,
        ),
    );
    if (computed.kind === OverviewSectionStatus.Failed) {
        return {
            kind: LagLineKind.Failed,
            text: `The rebuy lag could not be measured: ${computed.message} Fix the stored date listed in the alerts on the accounts overview.`,
        };
    }
    const lag = computed.value;
    return lag.basis === RebuyLagBasis.Measured
        ? {
              kind: LagLineKind.Measured,
              text: `Measured rebuy lag on this plan: ${lag.days.toFixed(1)} sessions (n = ${String(lag.samples)})`,
          }
        : null;
}

function ReplacementChain({
    account,
    accountsQuery,
    eventsQuery,
    userId,
}: {
    readonly account: StoredAccount;
    readonly accountsQuery: ListQuery<ListedAccount>;
    readonly eventsQuery: ListQuery<AccountEventRow>;
    readonly userId: string;
}) {
    const accounts = accountsQuery.data;
    const events = eventsQuery.data;
    const view = useMemo<null | ReplacementView>(
        () =>
            accounts === undefined || events === undefined
                ? null
                : {
                      lag: measuredLag(accounts, events, account, userId),
                      replacedBy: accounts.filter(
                          (candidate) =>
                              candidate.replacesAccountId === account.id,
                      ),
                      replaces:
                          accounts.find(
                              (candidate) =>
                                  candidate.id === account.replacesAccountId,
                          ) ?? null,
                  },
        [account, accounts, events, userId],
    );
    return (
        <>
            <ListQueryStatus query={accountsQuery} subject="accounts" />
            <ListQueryStatus query={eventsQuery} subject="account events" />
            {view !== null && (
                <div className="flex flex-col gap-2 text-sm">
                    {view.replaces === null ? (
                        <p className="text-muted-foreground">
                            {account.replacesAccountId === null
                                ? 'This account does not replace another account.'
                                : 'This account replaces an account that no longer exists.'}
                        </p>
                    ) : (
                        <p>
                            Replaces{' '}
                            <Link
                                className="font-medium underline underline-offset-4"
                                href={routes.propCalculator.accounts.detail(
                                    view.replaces.id,
                                )}
                            >
                                {view.replaces.label}
                            </Link>
                        </p>
                    )}
                    {view.replacedBy.length > 0 && (
                        <p>
                            Replaced by{' '}
                            {view.replacedBy.map((replacement, index) => (
                                <span key={replacement.id}>
                                    {index > 0 && ', '}
                                    <Link
                                        className="font-medium underline underline-offset-4"
                                        href={routes.propCalculator.accounts.detail(
                                            replacement.id,
                                        )}
                                    >
                                        {replacement.label}
                                    </Link>
                                </span>
                            ))}
                        </p>
                    )}
                    {view.lag !== null && (
                        <p
                            className={
                                view.lag.kind === LagLineKind.Failed
                                    ? 'text-destructive'
                                    : 'text-muted-foreground'
                            }
                        >
                            {view.lag.text}
                        </p>
                    )}
                </div>
            )}
        </>
    );
}

function SnapshotHistory({
    eventsQuery,
    onFailure,
    query,
}: {
    readonly eventsQuery: ListQuery<AccountEventRow>;
    readonly onFailure: (error: unknown) => void;
    readonly query: ListQuery<SnapshotRow>;
}) {
    const utilities = api.useUtils();
    const remove = api.propAccounts.snapshot.remove.useMutation({
        onError: onFailure,
        onSuccess: () => {
            toast.success('Snapshot deleted');
            return utilities.propAccounts.invalidate();
        },
    });
    const rows = query.data;
    const events = eventsQuery.data;
    const series = useMemo(
        () => snapshotSeries(rows ?? [], events ?? []),
        [rows, events],
    );
    const [latest] = rows ?? [];
    return (
        <>
            <ListQueryStatus query={query} subject="balances" />
            {rows !== undefined && (
                <>
                    {latest !== undefined && (
                        <p className="text-sm">
                            Latest balance{' '}
                            <span className="font-medium tabular-nums">
                                {formatUsdCents(latest.balanceCents)}
                            </span>{' '}
                            as of {latest.asOf}
                            {latest.highestEodBalanceCents !== null &&
                                `, highest end-of-day balance ${formatUsdCents(latest.highestEodBalanceCents)}`}
                            {latest.tradingDays !== null &&
                                `, ${String(latest.tradingDays)} trading days`}
                        </p>
                    )}
                    <SnapshotHistoryChart series={series} />
                    {rows.length > 0 && (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>As of</TableHead>
                                    <TableHead className="text-right">
                                        Balance
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Highest end of day
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Trading days
                                    </TableHead>
                                    <TableHead>
                                        <span className="sr-only">Actions</span>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell className="tabular-nums">
                                            {row.asOf}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {formatUsdCents(row.balanceCents)}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {row.highestEodBalanceCents === null
                                                ? ''
                                                : formatUsdCents(
                                                      row.highestEodBalanceCents,
                                                  )}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {row.tradingDays ?? ''}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-end">
                                                <RemoveRecordDialog
                                                    confirmText="Delete"
                                                    description="This permanently removes the balance snapshot."
                                                    isPending={remove.isPending}
                                                    onConfirm={() => {
                                                        remove.mutate({
                                                            id: row.id,
                                                        });
                                                    }}
                                                    title="Delete this snapshot?"
                                                    triggerLabel={`Delete the snapshot of ${row.asOf}`}
                                                />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </>
            )}
        </>
    );
}

function StoredRecordActions({
    account,
    onResolved,
    rejection,
}: {
    readonly account: StoredAccount;
    readonly onResolved: () => void;
    readonly rejection: PropRejection;
}) {
    const router = useRouter();
    const utilities = api.useUtils();
    const removed = {
        onError: (error: { readonly message: string }) => {
            toast.error(error.message);
        },
        onSuccess: () => {
            onResolved();
            return utilities.propAccounts.invalidate();
        },
    };
    const payoutRemoval = api.propAccounts.payout.remove.useMutation(removed);
    const feeRemoval = api.propAccounts.fee.remove.useMutation(removed);
    const snapshotRemoval =
        api.propAccounts.snapshot.remove.useMutation(removed);
    const { record, recordId } = rejection;
    if (record === null || recordId === null) return null;
    switch (record) {
        case PropRecord.Account: {
            return recordId === account.id ? (
                <div className="mt-2 flex items-center gap-1">
                    <ArchiveAccountButton account={account} />
                    <DeleteAccountDialog
                        accountId={account.id}
                        label={account.label}
                        onDeleted={() => {
                            router.push(routes.propCalculator.accounts.index);
                        }}
                    />
                </div>
            ) : null;
        }
        case PropRecord.CopyGroup:
        case PropRecord.Decision:
        case PropRecord.Event:
        case PropRecord.Rulebook:
        case PropRecord.Scenario: {
            return null;
        }
        case PropRecord.Fee: {
            return (
                <StoredRecordRemoval
                    isPending={feeRemoval.isPending}
                    onConfirm={() => {
                        feeRemoval.mutate({ id: recordId });
                    }}
                    record={record}
                />
            );
        }
        case PropRecord.Payout: {
            return (
                <StoredRecordRemoval
                    isPending={payoutRemoval.isPending}
                    onConfirm={() => {
                        payoutRemoval.mutate({ id: recordId });
                    }}
                    record={record}
                />
            );
        }
        case PropRecord.Snapshot: {
            return (
                <StoredRecordRemoval
                    isPending={snapshotRemoval.isPending}
                    onConfirm={() => {
                        snapshotRemoval.mutate({ id: recordId });
                    }}
                    record={record}
                />
            );
        }
    }
}

function StoredRecordNotice({
    account,
    issue,
    onResolved,
}: {
    readonly account: StoredAccount;
    readonly issue: StoredRecordIssue;
    readonly onResolved: () => void;
}) {
    return (
        <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>A stored record needs your attention</AlertTitle>
            <AlertDescription>
                <p>{issue.message}</p>
                <StoredRecordActions
                    account={account}
                    onResolved={onResolved}
                    rejection={issue.rejection}
                />
            </AlertDescription>
        </Alert>
    );
}

function StoredRecordRemoval({
    isPending,
    onConfirm,
    record,
}: {
    readonly isPending: boolean;
    readonly onConfirm: () => void;
    readonly record: PropRecord;
}) {
    return (
        <div className="mt-2">
            <RemoveRecordDialog
                confirmText="Remove"
                description={`This permanently removes the stored ${record} so you can enter it again.`}
                isPending={isPending}
                onConfirm={onConfirm}
                title={`Remove this ${record}?`}
                triggerLabel={`Remove the ${record}`}
                triggerShowsLabel
            />
        </div>
    );
}
