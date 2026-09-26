'use client';

import {
    Archive,
    ArchiveRestore,
    ArrowDownUp,
    Pencil,
    TriangleAlert,
    Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { EmptyState } from '~/components/ui/EmptyState';
import InfoPopover from '~/components/ui/InfoPopover';
import { Label } from '~/components/ui/Label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { Skeleton } from '~/components/ui/Skeleton';
import { Switch } from '~/components/ui/Switch';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import {
    AccountStage,
    accountStageLabel,
    AccountStatus,
    type ExternalFirmName,
    firmKeyId,
} from '~/lib/prop-accounts';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api } from '~/trpc/react';

import {
    ACCOUNT_LIST_INPUT,
    accountFirmLabel,
    type AccountListFilters,
    type AccountListRow,
    type AccountListSort,
    accountPlanLabel,
    AccountSortKey,
    accountStatusLabel,
    accountTagOptions,
    buildAccountListRows,
    DEFAULT_ACCOUNT_LIST_FILTERS,
    DEFAULT_ACCOUNT_LIST_SORT,
    filterAccountRows,
    readOnlyAlertTitle,
    sortAccountRows,
    SortDirection,
} from './accountListFilters';
import { formatUsdCents } from './accountPlanOptions';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import {
    firmKeyOfOption,
    type LedgerOnlyFirmOption,
    ledgerOnlyFirmOptions,
} from './externalFirmOptions';

const ALL = 'all';

const SORT_LABEL: Readonly<Record<AccountSortKey, string>> = {
    [AccountSortKey.Cushion]: 'Cushion',
    [AccountSortKey.Label]: 'Label',
    [AccountSortKey.Readiness]: 'Payout readiness',
};

interface ArchivableAccount {
    readonly archivedAt: Date | null;
    readonly id: string;
    readonly label: string;
}

interface FilterOption {
    readonly label: string;
    readonly value: string;
}

interface FilterOptions {
    readonly firms: readonly LedgerOnlyFirmOption[];
    readonly groups: readonly FilterOption[];
    readonly stages: readonly FilterOption[];
    readonly statuses: readonly FilterOption[];
    readonly tags: readonly FilterOption[];
}

export function AccountsTable() {
    const accountsQuery =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const snapshotsQuery = api.propAccounts.snapshot.latestForAll.useQuery();
    const groupsQuery = api.propAccounts.copyGroup.list.useQuery();
    const externalFirmsQuery = api.propAccounts.externalFirm.list.useQuery();
    const [filters, setFilters] = useState<AccountListFilters>(
        DEFAULT_ACCOUNT_LIST_FILTERS,
    );
    const [sort, setSort] = useState<AccountListSort>(
        DEFAULT_ACCOUNT_LIST_SORT,
    );

    const accounts = accountsQuery.data;
    const snapshots = snapshotsQuery.data;
    const rows = useMemo(
        () =>
            accounts === undefined
                ? []
                : buildAccountListRows(accounts, snapshots ?? []),
        [accounts, snapshots],
    );
    const visible = useMemo(
        () => sortAccountRows(filterAccountRows(rows, filters), sort),
        [rows, filters, sort],
    );
    const groupNames = useMemo(
        () =>
            new Map(
                (groupsQuery.data ?? []).map((group) => [group.id, group.name]),
            ),
        [groupsQuery.data],
    );

    if (accountsQuery.isPending) {
        return <Skeleton className="h-64 w-full" />;
    }
    if (accounts === undefined) {
        return (
            <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>The accounts could not be loaded</AlertTitle>
                <AlertDescription>
                    {accountsQuery.error.message}
                </AlertDescription>
            </Alert>
        );
    }
    if (accounts.length === 0) {
        return (
            <EmptyState
                action={
                    <Button asChild>
                        <Link href={routes.propCalculator.accounts.new}>
                            Add your first account
                        </Link>
                    </Button>
                }
                description="Add an account to track its balance, stage and payouts."
                icon={Wallet}
                title="No accounts yet"
            />
        );
    }

    const filterOptions: FilterOptions = {
        firms: ledgerOnlyFirmOptions(externalFirmsQuery.data ?? []),
        groups: (groupsQuery.data ?? []).map((group) => ({
            label: group.name,
            value: group.id,
        })),
        stages: Object.values(AccountStage).map((stage) => ({
            label: accountStageLabel(stage),
            value: stage,
        })),
        statuses: Object.values(AccountStatus).map((status) => ({
            label: accountStatusLabel(status),
            value: status,
        })),
        tags: accountTagOptions(accounts).map((tag) => ({
            label: tag,
            value: tag,
        })),
    };

    return (
        <section
            aria-labelledby="prop-accounts-list-heading"
            className="app-prop-accounts__list flex flex-col gap-4"
        >
            <h2 className="sr-only" id="prop-accounts-list-heading">
                Accounts
            </h2>
            {accountsQuery.isError && (
                <Alert variant="warning">
                    <TriangleAlert />
                    <AlertTitle>The accounts could not be refreshed</AlertTitle>
                    <AlertDescription>
                        {accountsQuery.error.message} The table shows the last
                        loaded accounts.
                    </AlertDescription>
                </Alert>
            )}
            {snapshotsQuery.isError && (
                <Alert variant="warning">
                    <TriangleAlert />
                    <AlertTitle>Balances could not be loaded</AlertTitle>
                    <AlertDescription>
                        {snapshotsQuery.error.message}
                    </AlertDescription>
                </Alert>
            )}
            {externalFirmsQuery.isError && (
                <Alert variant="warning">
                    <TriangleAlert />
                    <AlertTitle>Your firms could not be loaded</AlertTitle>
                    <AlertDescription>
                        {externalFirmsQuery.error.message} Accounts at a firm
                        you added show it as an unlisted firm until your firms
                        load.
                    </AlertDescription>
                </Alert>
            )}
            <AccountListFilterBar
                filters={filters}
                onFiltersChange={setFilters}
                onSortChange={setSort}
                options={filterOptions}
                sort={sort}
            />
            {sort.key === AccountSortKey.Readiness && (
                <p className="text-xs text-muted-foreground">
                    Payout readiness is not computed yet, so this sort falls
                    back to the label.
                </p>
            )}
            {visible.length === 0 ? (
                <EmptyState
                    description="No account matches these filters."
                    title="Nothing to show"
                />
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Account</TableHead>
                            <TableHead>Firm and plan</TableHead>
                            <TableHead>Stage</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">
                                Balance
                            </TableHead>
                            <TableHead className="text-right">
                                Cushion
                            </TableHead>
                            <TableHead>Copy group</TableHead>
                            <TableHead>
                                <span className="sr-only">Actions</span>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {visible.map((row) => (
                            <AccountRow
                                externalFirms={externalFirmsQuery.data ?? []}
                                groupName={
                                    row.account.copyGroupId === null
                                        ? null
                                        : (groupNames.get(
                                              row.account.copyGroupId,
                                          ) ?? null)
                                }
                                key={row.account.id}
                                row={row}
                            />
                        ))}
                    </TableBody>
                </Table>
            )}
        </section>
    );
}

export function ArchiveAccountButton({
    account,
}: {
    account: ArchivableAccount;
}) {
    const utilities = api.useUtils();
    const invalidate = () => utilities.propAccounts.account.invalidate();
    const archive = api.propAccounts.account.archive.useMutation({
        onError: (error) => {
            toast.error(error.message);
        },
        onSuccess: () => {
            toast.success(`${account.label} archived`);
            return invalidate();
        },
    });
    const unarchive = api.propAccounts.account.unarchive.useMutation({
        onError: (error) => {
            toast.error(error.message);
        },
        onSuccess: () => {
            toast.success(`${account.label} restored`);
            return invalidate();
        },
    });
    const isArchived = account.archivedAt !== null;
    return (
        <Button
            aria-label={
                isArchived
                    ? `Restore ${account.label}`
                    : `Archive ${account.label}`
            }
            disabled={archive.isPending || unarchive.isPending}
            onClick={() => {
                if (isArchived) {
                    unarchive.mutate({ id: account.id });
                } else {
                    archive.mutate({ id: account.id });
                }
            }}
            size="icon"
            variant="ghost"
        >
            {isArchived ? <ArchiveRestore /> : <Archive />}
        </Button>
    );
}

function AccountListFilterBar({
    filters,
    onFiltersChange,
    onSortChange,
    options,
    sort,
}: {
    filters: AccountListFilters;
    onFiltersChange: (next: AccountListFilters) => void;
    onSortChange: (next: AccountListSort) => void;
    options: FilterOptions;
    sort: AccountListSort;
}) {
    return (
        <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <FilterSelect
                    id="accounts-filter-firm"
                    label="Firm"
                    onChange={(value) => {
                        onFiltersChange({
                            ...filters,
                            firmKey:
                                value === null
                                    ? null
                                    : firmKeyOfOption(options.firms, value),
                        });
                    }}
                    options={options.firms}
                    value={
                        filters.firmKey === null
                            ? null
                            : firmKeyId(filters.firmKey)
                    }
                />
                <FilterSelect
                    id="accounts-filter-stage"
                    label="Stage"
                    onChange={(value) => {
                        onFiltersChange({
                            ...filters,
                            stage: parseEnum(AccountStage, value),
                        });
                    }}
                    options={options.stages}
                    value={filters.stage}
                />
                <FilterSelect
                    id="accounts-filter-status"
                    label="Status"
                    onChange={(value) => {
                        onFiltersChange({
                            ...filters,
                            status: parseEnum(AccountStatus, value),
                        });
                    }}
                    options={options.statuses}
                    value={filters.status}
                />
                <FilterSelect
                    id="accounts-filter-group"
                    label="Copy group"
                    onChange={(value) => {
                        onFiltersChange({ ...filters, copyGroupId: value });
                    }}
                    options={options.groups}
                    value={filters.copyGroupId}
                />
                <FilterSelect
                    id="accounts-filter-tag"
                    label="Tag"
                    onChange={(value) => {
                        onFiltersChange({ ...filters, tag: value });
                    }}
                    options={options.tags}
                    value={filters.tag}
                />
                <div className="flex flex-col gap-2">
                    <Label htmlFor="accounts-sort">Sort by</Label>
                    <div className="flex gap-2">
                        <Select
                            onValueChange={(value) => {
                                const key = parseEnum(AccountSortKey, value);
                                if (key !== null)
                                    onSortChange({ ...sort, key });
                            }}
                            value={sort.key}
                        >
                            <SelectTrigger id="accounts-sort">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.values(AccountSortKey).map((key) => (
                                    <SelectItem key={key} value={key}>
                                        {SORT_LABEL[key]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            aria-label={
                                sort.direction === SortDirection.Ascending
                                    ? 'Sorted ascending, switch to descending'
                                    : 'Sorted descending, switch to ascending'
                            }
                            onClick={() => {
                                onSortChange({
                                    ...sort,
                                    direction:
                                        sort.direction ===
                                        SortDirection.Ascending
                                            ? SortDirection.Descending
                                            : SortDirection.Ascending,
                                });
                            }}
                            size="icon"
                            type="button"
                            variant="outline"
                        >
                            <ArrowDownUp />
                        </Button>
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Switch
                    checked={filters.includeArchived}
                    id="accounts-show-archived"
                    onCheckedChange={(checked) => {
                        onFiltersChange({
                            ...filters,
                            includeArchived: checked,
                        });
                    }}
                />
                <Label htmlFor="accounts-show-archived">
                    Show archived accounts
                </Label>
            </div>
        </>
    );
}

function AccountRow({
    externalFirms,
    groupName,
    row,
}: {
    externalFirms: readonly ExternalFirmName[];
    groupName: null | string;
    row: AccountListRow;
}) {
    const { account, latestSnapshot } = row;
    const isArchived = account.archivedAt !== null;

    return (
        <TableRow className={cn(isArchived && 'opacity-60')}>
            <TableCell className="align-top">
                <Link
                    className="font-medium underline-offset-4 hover:underline"
                    href={routes.propCalculator.accounts.detail(account.id)}
                >
                    {account.label}
                </Link>
                {account.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                        {account.tags.map((tag) => (
                            <Badge key={tag} variant="secondary">
                                {tag}
                            </Badge>
                        ))}
                    </div>
                )}
                {account.notes !== null && account.notes !== '' && (
                    <p className="mt-1 line-clamp-2 max-w-xs text-xs whitespace-pre-line text-muted-foreground">
                        {account.notes}
                    </p>
                )}
                {isArchived && (
                    <Badge className="mt-1" variant="outline">
                        Archived
                    </Badge>
                )}
            </TableCell>
            <TableCell className="align-top">
                <div>{accountFirmLabel(account, externalFirms)}</div>
                <div className="text-xs text-muted-foreground">
                    {accountPlanLabel(account)}
                </div>
                {row.isLedgerOnly && (
                    <Badge className="mt-1" variant="outline">
                        Ledger only
                    </Badge>
                )}
                {row.planIssue !== null && (
                    <p className="mt-1 flex items-start gap-1 text-xs text-amber-400">
                        <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                        <span>{row.planIssue}. Read-only.</span>
                        {row.readOnlyNotice !== null && (
                            <InfoPopover
                                title={readOnlyAlertTitle(account.label)}
                            >
                                <p>{row.readOnlyNotice}</p>
                            </InfoPopover>
                        )}
                    </p>
                )}
            </TableCell>
            <TableCell className="align-top">
                {accountStageLabel(account.stage)}
            </TableCell>
            <TableCell className="align-top">
                {accountStatusLabel(account.status)}
            </TableCell>
            <TableCell className="text-right align-top tabular-nums">
                {latestSnapshot === null ? (
                    <span className="text-muted-foreground">No balance</span>
                ) : (
                    <>
                        <div>{formatUsdCents(latestSnapshot.balanceCents)}</div>
                        <div className="text-xs text-muted-foreground">
                            as of {latestSnapshot.asOf}
                        </div>
                    </>
                )}
            </TableCell>
            <TableCell className="text-right align-top tabular-nums">
                {row.cushionCents === null ? (
                    <span className="text-xs text-muted-foreground">
                        Needs the dashboard floor
                    </span>
                ) : (
                    formatUsdCents(row.cushionCents)
                )}
            </TableCell>
            <TableCell className="align-top">{groupName ?? 'None'}</TableCell>
            <TableCell className="align-top">
                <div className="flex justify-end gap-1">
                    {row.isReadOnly ? (
                        <Button
                            aria-label={`Edit ${account.label} (read-only)`}
                            disabled
                            size="icon"
                            variant="ghost"
                        >
                            <Pencil />
                        </Button>
                    ) : (
                        <Button
                            aria-label={`Edit ${account.label}`}
                            asChild
                            size="icon"
                            variant="ghost"
                        >
                            <Link
                                href={routes.propCalculator.accounts.edit(
                                    account.id,
                                )}
                            >
                                <Pencil />
                            </Link>
                        </Button>
                    )}
                    <ArchiveAccountButton account={account} />
                    <DeleteAccountDialog
                        accountId={account.id}
                        label={account.label}
                    />
                </div>
            </TableCell>
        </TableRow>
    );
}

function FilterSelect({
    id,
    label,
    onChange,
    options,
    value,
}: {
    id: string;
    label: string;
    onChange: (value: null | string) => void;
    options: readonly FilterOption[];
    value: null | string;
}) {
    return (
        <div className="flex flex-col gap-2">
            <Label htmlFor={id}>{label}</Label>
            <Select
                onValueChange={(next) => {
                    onChange(next === ALL ? null : next);
                }}
                value={value ?? ALL}
            >
                <SelectTrigger id={id}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={ALL}>All</SelectItem>
                    {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

function parseEnum<T extends string>(
    enumObject: Readonly<Record<string, T>>,
    value: null | string,
): null | T {
    return Object.values(enumObject).find((member) => member === value) ?? null;
}
