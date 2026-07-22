'use client';

import { type ColumnDef } from '@tanstack/react-table';
import {
    ArrowDown,
    ArrowUp,
    Filter,
    Landmark,
    Pencil,
    Plus,
    Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';
import { toast } from 'sonner';

import type { MatchType } from '~/lib/accounting/core/rules/matcher';
import type {
    BookingDirection,
    LedgerReference,
} from '~/lib/accounting/core/types';

import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { ClearFiltersButton } from '~/components/ui/ClearFiltersButton';
import { DataTable } from '~/components/ui/DataTable';
import { DateRangePicker } from '~/components/ui/DatePicker';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/Dialog';
import { EmptyState } from '~/components/ui/EmptyState';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { MATCH_TYPES } from '~/lib/accounting/core/rules/matcher';
import { api } from '~/trpc/react';

import { DirectionBadge } from './DirectionBadge';
import { LedgerCombobox } from './LedgerCombobox';
import { useActiveCredentials } from './useActiveCredentials';
import { type TaxCodeOption, useTaxCodes } from './useTaxCodes';

const ALL = '__all__';
const VAT_NONE = '__none__';
const toastError = (error: { message: string }) => toast.error(error.message);

export interface RuleFormDialogPrefill {
    direction: BookingDirection;
    match: string;
}

interface BankAccountView {
    currency: string;
    id: string;
    ledger: LedgerReference;
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

    const [match, setMatch] = useState(isEdit || isPrefill ? mode.match : '');
    const [direction, setDirection] = useState<BookingDirection>(
        isEdit || isPrefill ? mode.direction : 'OUT',
    );
    const [display, setDisplay] = useState(isEdit ? mode.display : '');
    const [ledger, setLedger] = useState<LedgerReference | null>(
        isEdit ? mode.ledger : null,
    );
    const [taxCode, setTaxCode] = useState<string>(
        isEdit ? mode.taxCode : VAT_NONE,
    );
    const [matchType, setMatchType] = useState<MatchType>(
        isEdit ? mode.matchType : 'contains',
    );
    const [minAmount, setMinAmount] = useState(
        isEdit && mode.minAmount != null ? String(mode.minAmount) : '',
    );
    const [maxAmount, setMaxAmount] = useState(
        isEdit && mode.maxAmount != null ? String(mode.maxAmount) : '',
    );
    const [currency, setCurrency] = useState(
        isEdit && mode.currency ? mode.currency : '',
    );
    const [dateRange, setDateRange] = useState<DateRange | undefined>(
        isEdit && (mode.dateFrom ?? mode.dateTo)
            ? {
                  from: mode.dateFrom ? new Date(mode.dateFrom) : undefined,
                  to: mode.dateTo ? new Date(mode.dateTo) : undefined,
              }
            : undefined,
    );

    const canSave =
        match.trim().length > 0 &&
        display.trim().length > 0 &&
        ledger !== null &&
        taxCode !== VAT_NONE;
    const isPending = create.isPending || update.isPending;

    const candidate = useMemo(
        () => ({
            currency: currency.trim() ? currency.trim().toUpperCase() : null,
            dateFrom: dateRange?.from ? toIso(dateRange.from) : null,
            dateTo: dateRange?.to ? toIso(dateRange.to) : null,
            direction,
            match: match.trim(),
            matchType,
            maxAmount: maxAmount.trim() ? Number(maxAmount) : null,
            minAmount: minAmount.trim() ? Number(minAmount) : null,
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
    ninetyDaysAgo.setDate(today.getDate() - 90);
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

    const submit = () => {
        if (!ledger || taxCode === VAT_NONE) return;
        const values = {
            ...candidate,
            display: display.trim(),
            ledger,
            taxCode,
        };
        if (isEdit) update.mutate({ id: mode.id, ...values });
        else create.mutate({ credentialId, ...values });
    };

    return (
        <Dialog
            onOpenChange={(o) => {
                if (!o) onClose();
            }}
            open
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {isEdit ? 'Edit rule' : 'New rule'}
                    </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <Field label="Match (merchant contains)">
                        <Input
                            className="h-8 text-xs"
                            onChange={(event) => setMatch(event.target.value)}
                            placeholder="e.g. amazon"
                            value={match}
                        />
                    </Field>
                    <Field label="Match type">
                        <MatchTypeSelect
                            onChange={setMatchType}
                            value={matchType}
                        />
                    </Field>
                    <Field label="Direction">
                        <DirectionSelect
                            onChange={setDirection}
                            value={direction}
                        />
                    </Field>
                    <Field label="Counterpart name">
                        <Input
                            className="h-8 text-xs"
                            onChange={(event) => setDisplay(event.target.value)}
                            placeholder="e.g. Amazon EU"
                            value={display}
                        />
                    </Field>
                    <Field label="Ledger">
                        <LedgerCombobox
                            onChange={setLedger}
                            options={ledgerOptions}
                            value={ledger}
                        />
                    </Field>
                    <Field label="VAT code">
                        <VatSelect
                            onChange={(v) => setTaxCode(v)}
                            options={taxCodeOptions}
                            value={taxCode === VAT_NONE ? '' : taxCode}
                        />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Min amount (optional)">
                            <Input
                                className="h-8 text-xs"
                                onChange={(event) =>
                                    setMinAmount(event.target.value)
                                }
                                placeholder="e.g. 10"
                                type="number"
                                value={minAmount}
                            />
                        </Field>
                        <Field label="Max amount (optional)">
                            <Input
                                className="h-8 text-xs"
                                onChange={(event) =>
                                    setMaxAmount(event.target.value)
                                }
                                placeholder="e.g. 500"
                                type="number"
                                value={maxAmount}
                            />
                        </Field>
                    </div>
                    <Field label="Currency (optional)">
                        <Input
                            className="h-8 text-xs"
                            onChange={(event) =>
                                setCurrency(event.target.value.toUpperCase())
                            }
                            placeholder="e.g. EUR"
                            value={currency}
                        />
                    </Field>
                    <Field label="Date range (optional)">
                        <DateRangePicker
                            className="h-8 w-full text-xs"
                            onChange={setDateRange}
                            placeholder="Any date"
                            value={dateRange}
                        />
                    </Field>
                    {sourceCredentialId && match.trim().length > 0 && (
                        <BacktestPreview query={backtestQ} />
                    )}
                </div>
                <DialogFooter>
                    <Button disabled={!canSave || isPending} onClick={submit}>
                        {isEdit ? 'Save changes' : 'Create rule'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function RulesManager() {
    const { accounting, source } = useActiveCredentials();
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
            {credentialId ? (
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
                <Card>
                    <CardContent>
                        <EmptyState
                            description="Add an accounting credential in Connections to manage its bank accounts and booking rules."
                            title="No accounting credential"
                        />
                    </CardContent>
                </Card>
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
            <p className="text-[10px] text-muted-foreground">
                Checking against the last 90 days…
            </p>
        );
    }
    if (!query.data) return null;
    const totals = Object.entries(query.data.totalByCurrency)
        .map(([code, amount]) => `${amount.toFixed(2)} ${code}`)
        .join(', ');
    return (
        <p className="text-[10px] text-muted-foreground">
            Would match <strong>{query.data.matchCount}</strong> of{' '}
            {query.data.transactionCount} transaction(s) in the last 90 days
            {totals ? `, totaling ${totals}` : ''}.
        </p>
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
    const del = api.accounting.bankAccounts.delete.useMutation({
        onError: toastError,
        onSuccess: invalidate,
    });

    const [currency, setCurrency] = useState(isEdit ? mode.currency : '');
    const [ledger, setLedger] = useState<LedgerReference | null>(
        isEdit ? mode.ledger : null,
    );

    const canSave =
        currency.trim().length > 0 && ledger !== null && !upsert.isPending;

    const submit = () => {
        if (!ledger) return;
        const next = currency.trim().toUpperCase();
        if (isEdit && mode.currency !== next) del.mutate({ id: mode.id });
        upsert.mutate({ credentialId, currency: next, ledger });
    };

    return (
        <Dialog
            onOpenChange={(o) => {
                if (!o) onClose();
            }}
            open
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {isEdit ? 'Edit bank account' : 'New bank account'}
                    </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <Field label="Currency">
                        <Input
                            className="h-8 text-xs"
                            onChange={(event) =>
                                setCurrency(event.target.value.toUpperCase())
                            }
                            placeholder="EUR"
                            value={currency}
                        />
                    </Field>
                    <Field label="Ledger">
                        <LedgerCombobox
                            onChange={setLedger}
                            options={ledgerOptions}
                            value={ledger}
                        />
                    </Field>
                </div>
                <DialogFooter>
                    <Button disabled={!canSave} onClick={submit}>
                        {isEdit ? 'Save changes' : 'Create account'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
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
    const rows = (banksQ.data ?? []) as BankAccountView[];

    const columns = useMemo<ColumnDef<BankAccountView>[]>(
        () => [
            {
                accessorKey: 'currency',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {row.original.currency}
                    </span>
                ),
                enableSorting: true,
                header: 'Currency',
            },
            {
                accessorFn: (r) => r.ledger.label,
                cell: ({ row }) => (
                    <span className="font-mono text-[10px] text-muted-foreground">
                        {row.original.ledger.label}
                    </span>
                ),
                enableSorting: true,
                header: 'Ledger',
                id: 'ledger',
            },
            {
                cell: ({ row }) => (
                    <div className="flex items-center gap-1">
                        <Button
                            onClick={() => setForm(row.original)}
                            size="icon"
                            variant="ghost"
                        >
                            <Pencil className="size-3.5" />
                        </Button>
                        <Button
                            onClick={() => del.mutate({ id: row.original.id })}
                            size="icon"
                            variant="ghost"
                        >
                            <Trash2 className="size-3.5" />
                        </Button>
                    </div>
                ),
                enableSorting: false,
                header: '',
                id: 'actions',
            },
        ],
        [del],
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Bank accounts</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                <DataTable
                    columns={columns}
                    data={rows}
                    emptyState={
                        <EmptyState
                            description="Map a Wise currency to a ledger to start importing."
                            icon={Landmark}
                            title="No bank accounts"
                        />
                    }
                    headerActions={
                        <Button
                            className="shrink-0"
                            onClick={() => setForm('new')}
                            size="sm"
                        >
                            <Plus className="size-3.5" /> Add account
                        </Button>
                    }
                    initialSorting={[{ desc: false, id: 'currency' }]}
                    isLoading={banksQ.isPending}
                    pageSize={25}
                    rowId={(r) => r.id}
                />
                {form !== null && (
                    <BankAccountFormDialog
                        credentialId={credentialId}
                        ledgerOptions={ledgerOptions}
                        mode={form}
                        onClose={() => setForm(null)}
                    />
                )}
            </CardContent>
        </Card>
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
            onValueChange={(v) => onChange(v as BookingDirection)}
            value={value}
        >
            <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="OUT">OUT</SelectItem>
                <SelectItem value="IN">IN</SelectItem>
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
        <Select onValueChange={(v) => onChange(v as MatchType)} value={value}>
            <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
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

function RulesCard({
    credentialId,
    ledgerOptions,
    sourceCredentialId,
}: {
    credentialId: string;
    ledgerOptions: LedgerReference[];
    sourceCredentialId?: string;
}) {
    const { labelOf, options: taxCodeOptions } = useTaxCodes(credentialId);
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
    const [directionFilter, setDirectionFilter] = useState<string>(ALL);
    const [vatFilter, setVatFilter] = useState<string>(ALL);
    const [ledgerFilter, setLedgerFilter] = useState<string>(ALL);

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
    const ledgerLabels = useMemo(
        () =>
            [...new Set(allRules.map((r) => r.ledger.label))].toSorted((a, b) =>
                a.localeCompare(b),
            ),
        [allRules],
    );

    const rows = useMemo(
        () =>
            allRules.filter((r) => {
                if (directionFilter !== ALL && r.direction !== directionFilter)
                    return false;
                if (vatFilter !== ALL && r.taxCode !== vatFilter) return false;
                return ledgerFilter === ALL || r.ledger.label === ledgerFilter;
            }),
        [allRules, directionFilter, vatFilter, ledgerFilter],
    );

    const hasFilters =
        directionFilter !== ALL || vatFilter !== ALL || ledgerFilter !== ALL;
    const reset = () => {
        setDirectionFilter(ALL);
        setVatFilter(ALL);
        setLedgerFilter(ALL);
    };

    const columns = useMemo<ColumnDef<RuleView>[]>(
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
            },
            {
                accessorKey: 'direction',
                cell: ({ row }) => (
                    <DirectionBadge direction={row.original.direction} />
                ),
                enableSorting: true,
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
                    <span className="font-mono text-[10px] text-muted-foreground">
                        {row.original.ledger.label}
                    </span>
                ),
                enableSorting: true,
                header: 'Ledger',
                id: 'ledger',
            },
            {
                accessorKey: 'taxCode',
                cell: ({ row }) => (
                    <Badge variant="outline">
                        {labelOf(row.original.taxCode)}
                    </Badge>
                ),
                enableSorting: true,
                header: 'VAT',
            },
            {
                cell: ({ row }) => {
                    const index = allRules.findIndex(
                        (r) => r.id === row.original.id,
                    );
                    return (
                        <div className="flex items-center gap-1">
                            <Button
                                disabled={hasFilters || index <= 0}
                                onClick={() => move(row.original.id, 'up')}
                                size="icon"
                                variant="ghost"
                            >
                                <ArrowUp className="size-3.5" />
                            </Button>
                            <Button
                                disabled={
                                    hasFilters ||
                                    index === -1 ||
                                    index >= allRules.length - 1
                                }
                                onClick={() => move(row.original.id, 'down')}
                                size="icon"
                                variant="ghost"
                            >
                                <ArrowDown className="size-3.5" />
                            </Button>
                            <Button
                                onClick={() => setForm(row.original)}
                                size="icon"
                                variant="ghost"
                            >
                                <Pencil className="size-3.5" />
                            </Button>
                            <Button
                                onClick={() =>
                                    del.mutate({ id: row.original.id })
                                }
                                size="icon"
                                variant="ghost"
                            >
                                <Trash2 className="size-3.5" />
                            </Button>
                        </div>
                    );
                },
                enableSorting: false,
                header: '',
                id: 'actions',
            },
        ],
        [allRules, del, hasFilters, labelOf, move],
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Rules</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                <DataTable
                    columns={columns}
                    data={rows}
                    emptyState={
                        <EmptyState
                            description={
                                hasFilters
                                    ? 'No rules match the current filters.'
                                    : 'Add a rule to classify transactions.'
                            }
                            icon={Filter}
                            title={hasFilters ? 'No matches' : 'No rules yet'}
                        />
                    }
                    filterPlaceholder="Search rules…"
                    headerActions={
                        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center">
                            <ClearFiltersButton
                                active={hasFilters}
                                className="hidden md:flex"
                                onReset={reset}
                            />
                            <Select
                                onValueChange={setDirectionFilter}
                                value={directionFilter}
                            >
                                <SelectTrigger className="h-8 w-40 shrink-0 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>
                                        All directions
                                    </SelectItem>
                                    <SelectItem value="IN">In</SelectItem>
                                    <SelectItem value="OUT">Out</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select
                                onValueChange={setLedgerFilter}
                                value={ledgerFilter}
                            >
                                <SelectTrigger className="h-8 w-48 shrink-0 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>
                                        All ledgers
                                    </SelectItem>
                                    {ledgerLabels.map((l) => (
                                        <SelectItem key={l} value={l}>
                                            {l}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select
                                onValueChange={setVatFilter}
                                value={vatFilter}
                            >
                                <SelectTrigger className="h-8 w-44 shrink-0 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>
                                        All VAT codes
                                    </SelectItem>
                                    {taxCodeOptions.map((o) => (
                                        <SelectItem key={o.code} value={o.code}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                className="shrink-0"
                                onClick={() => setForm('new')}
                                size="sm"
                            >
                                <Plus className="size-3.5" /> Add rule
                            </Button>
                        </div>
                    }
                    isLoading={rulesQ.isPending}
                    pageSize={25}
                    rowId={(r) => r.id}
                    showFilter
                />
                {form !== null && (
                    <RuleFormDialog
                        credentialId={credentialId}
                        ledgerOptions={ledgerOptions}
                        mode={form}
                        onClose={() => setForm(null)}
                        sourceCredentialId={sourceCredentialId}
                    />
                )}
            </CardContent>
        </Card>
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
                <SelectValue placeholder="VAT code" />
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
