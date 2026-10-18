'use client';

import { ArrowDown, ArrowUp, Filter, Landmark, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import type { MatchType } from '~/lib/accounting/core/rules/matcher';
import type {
    BookingDirection,
    LedgerReference,
} from '~/lib/accounting/core/types';

import { FormDialog } from '~/components/FormDialog';
import { InfoNote } from '~/components/InfoNote';
import { TitledCardSkeleton } from '~/components/PageSkeleton';
import {
    deleteRowAction,
    editRowAction,
    RowActionKind,
    rowActionsColumn,
} from '~/components/RowActionsMenu';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
    DataTable,
    type DataTableColumn,
    DataTableFilterFunction,
    hasActiveTableFilter,
} from '~/components/ui/data-table';
import { DataTableFacetSelect } from '~/components/ui/data-table-facet-select';
import { DateRangePicker } from '~/components/ui/date-picker';
import { Dialog } from '~/components/ui/dialog';
import { EmptyState } from '~/components/ui/empty-state';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { Skeleton } from '~/components/ui/skeleton';
import { currencyCodeSchema } from '~/lib/accounting/core/currency';
import { CurrencyAmount } from '~/lib/accounting/core/money';
import { MATCH_TYPES } from '~/lib/accounting/core/rules/matcher';
import { CredentialRole } from '~/lib/accounting/credentials/index';
import { api } from '~/trpc/react';

import { dialogModeOf, dialogSubmitLabels } from './dialogSubmitLabels';
import {
    DIRECTION_OPTIONS,
    DirectionBadge,
    directionLabel,
} from './DirectionBadge';
import { LedgerCombobox } from './LedgerCombobox';
import { NoConnectionPanel } from './NoConnectionState';
import { useActiveCredentials } from './useActiveCredentials';
import { type TaxCodeOption, useTaxCodes } from './useTaxCodes';

const VAT_NONE = '__none__';
const BANK_ACCOUNTS_TITLE = 'Bank accounts';
const RULES_TITLE = 'Rules';
const BACKTEST_LOOKBACK_DAYS = 90;
const BACKTEST_CHECKING_LABEL = `Checking against the last ${String(BACKTEST_LOOKBACK_DAYS)} days`;
const toastError = (error: { message: string }) => toast.error(error.message);

export interface RuleFormDialogPrefill {
    direction: BookingDirection;
    match: string;
}

interface BankAccountFormValues {
    currency: string;
    ledger: LedgerReference | null;
}

interface BankAccountView {
    currency: string;
    id: string;
    ledger: LedgerReference;
}

interface RuleFormValues {
    currency: string;
    dateRange: DateRange | undefined;
    direction: BookingDirection;
    display: string;
    ledger: LedgerReference | null;
    match: string;
    matchType: MatchType;
    maxAmount: string;
    minAmount: string;
    taxCode: string;
}

interface RuleView {
    currency: null | string;
    dateFrom: null | string;
    dateTo: null | string;
    direction: BookingDirection;
    display: string;
    id: string;
    ledger: LedgerReference;
    match: string;
    matchType: MatchType;
    maxAmount: null | number;
    minAmount: null | number;
    sortOrder: number;
    taxCode: string;
}

const MATCH_TYPE_LABEL: Record<MatchType, string> = {
    contains: 'Contains',
    exact: 'Exact match',
    regex: 'Regex',
};

const parseCurrency = (currency: string) =>
    currencyCodeSchema.safeParse(currency.trim().toUpperCase());

const toIso = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export function RuleFormDialog({
    credentialId,
    ledgerOptions,
    mode,
    onClose,
    sourceCredentialId,
}: {
    credentialId: string;
    ledgerOptions: LedgerReference[];
    mode: 'new' | RuleFormDialogPrefill | RuleView;
    onClose: () => void;
    sourceCredentialId?: string;
}) {
    const isEdit = mode !== 'new' && 'id' in mode;
    const isPrefill = mode !== 'new' && !('id' in mode);
    const { options: taxCodeOptions } = useTaxCodes(credentialId);
    const utilities = api.useUtils();
    const settled = () => {
        void utilities.accounting.rules.list.invalidate({ credentialId });
        onClose();
    };
    const create = api.accounting.rules.create.useMutation({
        onError: toastError,
        onSuccess: settled,
    });
    const update = api.accounting.rules.update.useMutation({
        onError: toastError,
        onSuccess: settled,
    });

    const form = useForm<RuleFormValues>({
        defaultValues: {
            currency: isEdit && mode.currency ? mode.currency : '',
            dateRange:
                isEdit && (mode.dateFrom ?? mode.dateTo)
                    ? {
                          from: mode.dateFrom
                              ? new Date(mode.dateFrom)
                              : undefined,
                          to: mode.dateTo ? new Date(mode.dateTo) : undefined,
                      }
                    : undefined,
            direction: isEdit || isPrefill ? mode.direction : 'OUT',
            display: isEdit ? mode.display : '',
            ledger: isEdit ? mode.ledger : null,
            match: isEdit || isPrefill ? mode.match : '',
            matchType: isEdit ? mode.matchType : 'contains',
            maxAmount:
                isEdit && mode.maxAmount != null ? String(mode.maxAmount) : '',
            minAmount:
                isEdit && mode.minAmount != null ? String(mode.minAmount) : '',
            taxCode: isEdit ? mode.taxCode : VAT_NONE,
        },
    });
    const [
        currency,
        dateRange,
        direction,
        display,
        ledger,
        match,
        matchType,
        maxAmount,
        minAmount,
        taxCode,
    ] = useWatch({
        control: form.control,
        name: [
            'currency',
            'dateRange',
            'direction',
            'display',
            'ledger',
            'match',
            'matchType',
            'maxAmount',
            'minAmount',
            'taxCode',
        ],
    });

    const canSave =
        match.trim().length > 0 &&
        display.trim().length > 0 &&
        ledger !== null &&
        taxCode !== VAT_NONE;
    const isPending = create.isPending || update.isPending;

    const candidate = useMemo(
        () =>
            ruleCriteria({
                currency,
                dateRange,
                direction,
                match,
                matchType,
                maxAmount,
                minAmount,
            }),
        [
            currency,
            dateRange,
            direction,
            match,
            matchType,
            maxAmount,
            minAmount,
        ],
    );
    const [debounced, setDebounced] = useState(candidate);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(candidate), 400);
        return () => clearTimeout(id);
    }, [candidate]);

    const today = new Date();
    const ninetyDaysAgo = new Date(today);
    ninetyDaysAgo.setDate(today.getDate() - BACKTEST_LOOKBACK_DAYS);
    const backtestQ = api.accounting.rules.backtest.useQuery(
        {
            credentialId: sourceCredentialId ?? '',
            from: toIso(ninetyDaysAgo),
            to: toIso(today),
            ...debounced,
            currency: debounced.currency ?? undefined,
            dateFrom: debounced.dateFrom ?? undefined,
            dateTo: debounced.dateTo ?? undefined,
            maxAmount: debounced.maxAmount ?? undefined,
            minAmount: debounced.minAmount ?? undefined,
        },
        { enabled: !!sourceCredentialId && debounced.match.length > 0 },
    );

    const submit = (values: RuleFormValues) => {
        if (!values.ledger || values.taxCode === VAT_NONE) return;
        const rule = {
            ...ruleCriteria(values),
            display: values.display.trim(),
            ledger: values.ledger,
            taxCode: values.taxCode,
        };
        if (isEdit) update.mutate({ id: mode.id, ...rule });
        else create.mutate({ credentialId, ...rule });
    };

    return (
        <FormDialog
            form={form}
            onCancel={onClose}
            onSubmit={submit}
            pending={isPending}
            submitDisabled={!canSave}
            title={isEdit ? 'Edit rule' : 'New rule'}
            {...dialogSubmitLabels(dialogModeOf(isEdit))}
        >
            <Controller
                control={form.control}
                name="match"
                render={({ field }) => (
                    <Field label="Match (merchant contains)">
                        <Input
                            className="h-8 text-xs"
                            onChange={field.onChange}
                            placeholder="e.g. amazon"
                            ref={field.ref}
                            value={field.value}
                        />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="matchType"
                render={({ field }) => (
                    <Field label="Match type">
                        <MatchTypeSelect
                            onChange={field.onChange}
                            value={field.value}
                        />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="direction"
                render={({ field }) => (
                    <Field label="Direction">
                        <DirectionSelect
                            onChange={field.onChange}
                            value={field.value}
                        />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="display"
                render={({ field }) => (
                    <Field label="Counterpart name">
                        <Input
                            className="h-8 text-xs"
                            onChange={field.onChange}
                            placeholder="e.g. Amazon EU"
                            ref={field.ref}
                            value={field.value}
                        />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="ledger"
                render={({ field }) => (
                    <Field label="Ledger">
                        <LedgerCombobox
                            onChange={field.onChange}
                            options={ledgerOptions}
                            value={field.value}
                        />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="taxCode"
                render={({ field }) => (
                    <Field label="VAT code">
                        <VatSelect
                            onChange={field.onChange}
                            options={taxCodeOptions}
                            value={field.value === VAT_NONE ? '' : field.value}
                        />
                    </Field>
                )}
            />
            <div className="grid grid-cols-2 gap-3">
                <Controller
                    control={form.control}
                    name="minAmount"
                    render={({ field }) => (
                        <Field label="Min amount (optional)">
                            <Input
                                className="h-8 text-xs"
                                onChange={field.onChange}
                                placeholder="e.g. 10"
                                ref={field.ref}
                                type="number"
                                value={field.value}
                            />
                        </Field>
                    )}
                />
                <Controller
                    control={form.control}
                    name="maxAmount"
                    render={({ field }) => (
                        <Field label="Max amount (optional)">
                            <Input
                                className="h-8 text-xs"
                                onChange={field.onChange}
                                placeholder="e.g. 500"
                                ref={field.ref}
                                type="number"
                                value={field.value}
                            />
                        </Field>
                    )}
                />
            </div>
            <Controller
                control={form.control}
                name="currency"
                render={({ field }) => (
                    <Field label="Currency (optional)">
                        <Input
                            className="h-8 text-xs"
                            onChange={(event) =>
                                field.onChange(event.target.value.toUpperCase())
                            }
                            placeholder="e.g. EUR"
                            ref={field.ref}
                            value={field.value}
                        />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="dateRange"
                render={({ field }) => (
                    <Field label="Date range (optional)">
                        <DateRangePicker
                            className="h-8 w-full text-xs"
                            onChange={field.onChange}
                            placeholder="Any date"
                            value={field.value}
                        />
                    </Field>
                )}
            />
            {sourceCredentialId && match.trim().length > 0 && (
                <BacktestPreview query={backtestQ} />
            )}
        </FormDialog>
    );
}

export function RulesManager() {
    const { accounting, isLoading, source } = useActiveCredentials();
    const credentialId = accounting?.id ?? '';

    const ledgersQ = api.accounting.ledgers.list.useQuery(
        { credentialId },
        { enabled: !!credentialId },
    );
    const ledgerOptions = useMemo<LedgerReference[]>(
        () =>
            (ledgersQ.data ?? []).map((l) => ({
                id: l.externalId,
                label: `${l.code} ${l.description}`,
            })),
        [ledgersQ.data],
    );

    return (
        <div className="flex flex-col gap-6">
            {isLoading ? (
                <>
                    <TitledCardSkeleton title={BANK_ACCOUNTS_TITLE} />
                    <TitledCardSkeleton title={RULES_TITLE} />
                </>
            ) : credentialId ? (
                <>
                    <BankAccountsCard
                        credentialId={credentialId}
                        ledgerOptions={ledgerOptions}
                    />
                    <RulesCard
                        credentialId={credentialId}
                        ledgerOptions={ledgerOptions}
                        sourceCredentialId={source?.id}
                    />
                </>
            ) : (
                <NoConnectionPanel role={CredentialRole.Accounting} />
            )}
        </div>
    );
}

function BacktestPreview({
    query,
}: {
    query: {
        data?: {
            matchCount: number;
            totalByCurrency: Record<string, number>;
            transactionCount: number;
        };
        isFetching: boolean;
    };
}) {
    if (query.isFetching && !query.data) {
        return (
            <Skeleton
                aria-busy
                aria-label={BACKTEST_CHECKING_LABEL}
                className="h-12 w-full rounded-lg"
                role="status"
            />
        );
    }
    if (!query.data) return null;
    const totals = Object.entries(query.data.totalByCurrency)
        .map(([code, amount]) => {
            const currency = currencyCodeSchema.safeParse(code);
            return currency.success
                ? CurrencyAmount.format({ amount, currency: currency.data })
                : `${String(amount)} ${code}`;
        })
        .join(', ');
    return (
        <InfoNote>
            Would match <strong>{query.data.matchCount}</strong> of{' '}
            {query.data.transactionCount} transaction(s) in the last{' '}
            {BACKTEST_LOOKBACK_DAYS} days
            {totals ? `, totaling ${totals}` : ''}.
        </InfoNote>
    );
}

function BankAccountFormDialog({
    credentialId,
    ledgerOptions,
    mode,
    onClose,
}: {
    credentialId: string;
    ledgerOptions: LedgerReference[];
    mode: 'new' | BankAccountView;
    onClose: () => void;
}) {
    const isEdit = mode !== 'new';
    const utilities = api.useUtils();
    const invalidate = () =>
        void utilities.accounting.bankAccounts.list.invalidate({
            credentialId,
        });
    const upsert = api.accounting.bankAccounts.upsert.useMutation({
        onError: toastError,
        onSuccess: () => {
            invalidate();
            onClose();
        },
    });
    const form = useForm<BankAccountFormValues>({
        defaultValues: {
            currency: isEdit ? mode.currency : '',
            ledger: isEdit ? mode.ledger : null,
        },
    });
    const [currency, ledger] = useWatch({
        control: form.control,
        name: ['currency', 'ledger'],
    });

    const canSave = parseCurrency(currency).success && ledger !== null;

    const submit = (values: BankAccountFormValues) => {
        const nextCurrency = parseCurrency(values.currency);
        if (!values.ledger || !nextCurrency.success) return;
        upsert.mutate({
            credentialId,
            currency: nextCurrency.data,
            ledger: values.ledger,
            replacesId:
                isEdit && mode.currency !== nextCurrency.data
                    ? mode.id
                    : undefined,
        });
    };

    return (
        <FormDialog
            form={form}
            onCancel={onClose}
            onSubmit={submit}
            pending={upsert.isPending}
            submitDisabled={!canSave}
            title={isEdit ? 'Edit bank account' : 'New bank account'}
            {...dialogSubmitLabels(dialogModeOf(isEdit))}
        >
            <Controller
                control={form.control}
                name="currency"
                render={({ field }) => (
                    <Field label="Currency">
                        <Input
                            className="h-8 text-xs"
                            onChange={(event) =>
                                field.onChange(event.target.value.toUpperCase())
                            }
                            placeholder="EUR"
                            ref={field.ref}
                            value={field.value}
                        />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="ledger"
                render={({ field }) => (
                    <Field label="Ledger">
                        <LedgerCombobox
                            onChange={field.onChange}
                            options={ledgerOptions}
                            value={field.value}
                        />
                    </Field>
                )}
            />
        </FormDialog>
    );
}

function BankAccountsCard({
    credentialId,
    ledgerOptions,
}: {
    credentialId: string;
    ledgerOptions: LedgerReference[];
}) {
    const utilities = api.useUtils();
    const banksQ = api.accounting.bankAccounts.list.useQuery({ credentialId });
    const del = api.accounting.bankAccounts.delete.useMutation({
        onError: toastError,
        onSuccess: () =>
            void utilities.accounting.bankAccounts.list.invalidate({
                credentialId,
            }),
    });

    const [form, setForm] = useState<'new' | BankAccountView | null>(null);

    const allAccounts = useMemo(
        () => (banksQ.data ?? []) as BankAccountView[],
        [banksQ.data],
    );

    const columns = useMemo<DataTableColumn<BankAccountView>[]>(
        () => [
            {
                accessorKey: 'currency',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {row.original.currency}
                    </span>
                ),
                enableSorting: true,
                filterFn: DataTableFilterFunction.Equals,
                header: 'Currency',
                meta: { isRowHeader: true },
            },
            {
                accessorFn: (r) => r.ledger.label,
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-muted-foreground">
                        {row.original.ledger.label}
                    </span>
                ),
                enableSorting: true,
                filterFn: DataTableFilterFunction.Equals,
                header: 'Ledger',
                id: 'ledger',
            },
            rowActionsColumn<BankAccountView>({
                actionsOf: (account) => [
                    editRowAction(() => setForm(account)),
                    deleteRowAction({
                        description:
                            'New runs skip transactions in this currency until it is mapped to a ledger again.',
                        onDelete: () => del.mutate({ id: account.id }),
                        title: `Delete the ${account.currency} bank account?`,
                    }),
                ],
                isPendingOf: (account) =>
                    del.isPending && del.variables.id === account.id,
                labelOf: (account) => `${account.currency} bank account`,
            }),
        ],
        [del],
    );

    return (
        <ToolPanel
            actions={
                <Button onClick={() => setForm('new')}>
                    <Plus /> Add account
                </Button>
            }
            contentClassName="gap-3"
            description="Map each bank account or currency to the ledger it books to."
            title={BANK_ACCOUNTS_TITLE}
        >
            {!banksQ.isPending && allAccounts.length === 0 ? (
                <EmptyState
                    description="Map a bank currency to a ledger to start importing."
                    icon={Landmark}
                    title="No bank accounts"
                />
            ) : (
                <DataTable
                    columns={columns}
                    data={allAccounts}
                    emptyState={
                        <EmptyState
                            description="No bank accounts match these filters."
                            icon={Landmark}
                            title="No matches"
                        />
                    }
                    filterPlaceholder="Search accounts…"
                    headerActions={(table) => (
                        <div className="flex flex-wrap items-center gap-2">
                            <DataTableFacetSelect
                                column={table.getColumn('currency')}
                                placeholder="All currencies"
                            />
                            <DataTableFacetSelect
                                column={table.getColumn('ledger')}
                                placeholder="All ledgers"
                            />
                        </div>
                    )}
                    initialSorting={[{ desc: false, id: 'currency' }]}
                    isLoading={banksQ.isPending}
                    rowId={(r) => r.id}
                    showFilter
                />
            )}
            <Dialog
                onOpenChange={(isOpen) => {
                    if (!isOpen) setForm(null);
                }}
                open={form !== null}
            >
                {form !== null && (
                    <BankAccountFormDialog
                        credentialId={credentialId}
                        ledgerOptions={ledgerOptions}
                        mode={form}
                        onClose={() => setForm(null)}
                    />
                )}
            </Dialog>
        </ToolPanel>
    );
}

function DirectionSelect({
    onChange,
    value,
}: {
    onChange: (v: BookingDirection) => void;
    value: BookingDirection;
}) {
    return (
        <Select
            onValueChange={(v) =>
                onChange(
                    DIRECTION_OPTIONS.find((o) => o.value === v)?.value ??
                        value,
                )
            }
            value={value}
        >
            <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue>
                    {DIRECTION_OPTIONS.find((o) => o.value === value)?.label}
                </SelectValue>
            </SelectTrigger>
            <SelectContent>
                {DIRECTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                        {o.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function Field({
    children,
    label,
}: {
    children: React.ReactNode;
    label: string;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label className="text-xs tracking-wider text-muted-foreground uppercase">
                {label}
            </Label>
            {children}
        </div>
    );
}

function MatchTypeSelect({
    onChange,
    value,
}: {
    onChange: (v: MatchType) => void;
    value: MatchType;
}) {
    return (
        <Select
            onValueChange={(v) =>
                onChange(MATCH_TYPES.find((t) => t === v) ?? value)
            }
            value={value}
        >
            <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue>{MATCH_TYPE_LABEL[value]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
                {MATCH_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                        {MATCH_TYPE_LABEL[t]}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function ruleCriteria(
    values: Pick<
        RuleFormValues,
        | 'currency'
        | 'dateRange'
        | 'direction'
        | 'match'
        | 'matchType'
        | 'maxAmount'
        | 'minAmount'
    >,
) {
    const currency = values.currency.trim();
    return {
        currency: currency ? currency.toUpperCase() : null,
        dateFrom: values.dateRange?.from ? toIso(values.dateRange.from) : null,
        dateTo: values.dateRange?.to ? toIso(values.dateRange.to) : null,
        direction: values.direction,
        match: values.match.trim(),
        matchType: values.matchType,
        maxAmount: values.maxAmount.trim() ? Number(values.maxAmount) : null,
        minAmount: values.minAmount.trim() ? Number(values.minAmount) : null,
    };
}

function RulesCard({
    credentialId,
    ledgerOptions,
    sourceCredentialId,
}: {
    credentialId: string;
    ledgerOptions: LedgerReference[];
    sourceCredentialId?: string;
}) {
    const { labelOf } = useTaxCodes(credentialId);
    const utilities = api.useUtils();
    const rulesQ = api.accounting.rules.list.useQuery({ credentialId });
    const del = api.accounting.rules.delete.useMutation({
        onError: toastError,
        onSuccess: () =>
            void utilities.accounting.rules.list.invalidate({ credentialId }),
    });
    const { mutate: reorderMutate } = api.accounting.rules.reorder.useMutation({
        onError: toastError,
        onSuccess: () =>
            void utilities.accounting.rules.list.invalidate({ credentialId }),
    });

    const [form, setForm] = useState<'new' | null | RuleView>(null);

    const allRules = useMemo(
        () => (rulesQ.data ?? []) as RuleView[],
        [rulesQ.data],
    );
    const move = useCallback(
        (id: string, direction: 'down' | 'up') => {
            const index = allRules.findIndex((r) => r.id === id);
            if (index === -1) return;
            const swapWith = direction === 'up' ? index - 1 : index + 1;
            const a = allRules[index];
            const b = allRules[swapWith];
            if (!a || !b) return;
            const next = [...allRules];
            next[index] = b;
            next[swapWith] = a;
            reorderMutate({
                credentialId,
                orderedIds: next.map((r) => r.id),
            });
        },
        [allRules, credentialId, reorderMutate],
    );

    const columns = useMemo<DataTableColumn<RuleView>[]>(
        () => [
            {
                accessorKey: 'match',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {row.original.match}
                    </span>
                ),
                enableSorting: true,
                header: 'Match',
                meta: { isRowHeader: true },
            },
            {
                accessorKey: 'direction',
                cell: ({ row }) => (
                    <DirectionBadge direction={row.original.direction} />
                ),
                enableSorting: true,
                filterFn: DataTableFilterFunction.Equals,
                header: 'Dir',
            },
            {
                accessorKey: 'display',
                enableSorting: true,
                header: 'Counterpart',
            },
            {
                accessorFn: (r) => r.ledger.label,
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-muted-foreground">
                        {row.original.ledger.label}
                    </span>
                ),
                enableSorting: true,
                filterFn: DataTableFilterFunction.Equals,
                header: 'Ledger',
                id: 'ledger',
            },
            {
                accessorKey: 'taxCode',
                cell: ({ row }) => (
                    <Badge>{labelOf(row.original.taxCode)}</Badge>
                ),
                enableSorting: true,
                filterFn: DataTableFilterFunction.Equals,
                header: 'VAT',
            },
            rowActionsColumn<RuleView>({
                actionsOf: (rule, table) => {
                    const index = allRules.findIndex((r) => r.id === rule.id);
                    const isFiltered = hasActiveTableFilter(table);
                    return [
                        {
                            icon: ArrowUp,
                            isDisabled: isFiltered || index <= 0,
                            kind: RowActionKind.Select,
                            label: 'Move up',
                            onSelect: () => move(rule.id, 'up'),
                        },
                        {
                            icon: ArrowDown,
                            isDisabled:
                                isFiltered ||
                                index === -1 ||
                                index >= allRules.length - 1,
                            kind: RowActionKind.Select,
                            label: 'Move down',
                            onSelect: () => move(rule.id, 'down'),
                        },
                        editRowAction(() => setForm(rule)),
                        deleteRowAction({
                            description:
                                'New runs list the transactions it matched as unknown until another rule covers them.',
                            onDelete: () => del.mutate({ id: rule.id }),
                            title: `Delete the rule for “${rule.match}”?`,
                        }),
                    ];
                },
                isPendingOf: (rule) =>
                    del.isPending && del.variables.id === rule.id,
                labelOf: (rule) => rule.match,
            }),
        ],
        [allRules, del, labelOf, move],
    );

    return (
        <ToolPanel
            actions={
                <Button onClick={() => setForm('new')}>
                    <Plus /> Add rule
                </Button>
            }
            contentClassName="gap-3"
            description="Match a counterpart to a ledger, a direction and a VAT code."
            title={RULES_TITLE}
        >
            {!rulesQ.isPending && allRules.length === 0 ? (
                <EmptyState
                    description="Rules decide how each transaction is booked."
                    icon={Filter}
                    title="No rules yet"
                />
            ) : (
                <DataTable
                    columns={columns}
                    data={allRules}
                    emptyState={
                        <EmptyState
                            description="No rules match these filters."
                            icon={Filter}
                            title="No matches"
                        />
                    }
                    filterPlaceholder="Search rules…"
                    headerActions={(table) => (
                        <div className="flex flex-wrap items-center gap-2">
                            <DataTableFacetSelect
                                column={table.getColumn('direction')}
                                format={directionLabel}
                                placeholder="All directions"
                            />
                            <DataTableFacetSelect
                                column={table.getColumn('ledger')}
                                placeholder="All ledgers"
                            />
                            <DataTableFacetSelect
                                column={table.getColumn('taxCode')}
                                format={labelOf}
                                placeholder="All VAT codes"
                            />
                        </div>
                    )}
                    isLoading={rulesQ.isPending}
                    rowId={(r) => r.id}
                    showFilter
                />
            )}
            <Dialog
                onOpenChange={(isOpen) => {
                    if (!isOpen) setForm(null);
                }}
                open={form !== null}
            >
                {form !== null && (
                    <RuleFormDialog
                        credentialId={credentialId}
                        ledgerOptions={ledgerOptions}
                        mode={form}
                        onClose={() => setForm(null)}
                        sourceCredentialId={sourceCredentialId}
                    />
                )}
            </Dialog>
        </ToolPanel>
    );
}

function VatSelect({
    onChange,
    options,
    value,
}: {
    onChange: (v: string) => void;
    options: TaxCodeOption[];
    value: string;
}) {
    return (
        <Select onValueChange={onChange} value={value}>
            <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="VAT code">
                    {options.find((o) => o.code === value)?.label}
                </SelectValue>
            </SelectTrigger>
            <SelectContent>
                {options.map((o) => (
                    <SelectItem key={o.code} value={o.code}>
                        {o.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
