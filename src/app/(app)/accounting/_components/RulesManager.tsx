'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Filter, Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { BookingDirection, LedgerRef } from '~/lib/accounting/core/types';
import type { VatCode } from '~/lib/accounting/providers/eboekhouden/enums';

import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { ClearFiltersButton } from '~/components/ui/ClearFiltersButton';
import { DataTable } from '~/components/ui/DataTable';
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
import {
    VAT_CODE_LABEL,
    VAT_CODES,
} from '~/lib/accounting/providers/eboekhouden/enums';
import { api } from '~/trpc/react';

import { DirectionBadge } from './DirectionBadge';
import { LedgerCombobox } from './LedgerCombobox';
import { useActiveCredentials } from './useActiveCredentials';

const ALL = '__all__';
const VAT_NONE = '__none__';
const toastError = (e: { message: string }) => toast.error(e.message);

export interface RuleFormDialogPrefill {
    direction: BookingDirection;
    match: string;
}

interface BankAccountView {
    currency: string;
    id: string;
    ledger: LedgerRef;
}

interface RuleView {
    direction: BookingDirection;
    display: string;
    id: string;
    ledger: LedgerRef;
    match: string;
    vatCode: VatCode;
}

export function RuleFormDialog({
    credentialId,
    ledgerOptions,
    mode,
    onClose,
}: {
    credentialId: string;
    ledgerOptions: LedgerRef[];
    mode: 'new' | RuleFormDialogPrefill | RuleView;
    onClose: () => void;
}) {
    const isEdit = mode !== 'new' && 'id' in mode;
    const isPrefill = mode !== 'new' && !('id' in mode);
    const utils = api.useUtils();
    const settled = () => {
        void utils.accounting.rules.list.invalidate({ credentialId });
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
    const [ledger, setLedger] = useState<LedgerRef | null>(
        isEdit ? mode.ledger : null,
    );
    const [vatCode, setVatCode] = useState<string>(
        isEdit ? mode.vatCode : VAT_NONE,
    );

    const canSave =
        match.trim().length > 0 &&
        display.trim().length > 0 &&
        ledger !== null &&
        vatCode !== VAT_NONE;
    const pending = create.isPending || update.isPending;

    const submit = () => {
        if (!ledger || vatCode === VAT_NONE) return;
        const values = {
            direction,
            display: display.trim(),
            ledger,
            match: match.trim(),
            vatCode: vatCode as VatCode,
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
                            onChange={(e) => setMatch(e.target.value)}
                            placeholder="e.g. amazon"
                            value={match}
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
                            onChange={(e) => setDisplay(e.target.value)}
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
                            onChange={(v) => setVatCode(v)}
                            value={vatCode === VAT_NONE ? '' : vatCode}
                        />
                    </Field>
                </div>
                <DialogFooter>
                    <Button disabled={!canSave || pending} onClick={submit}>
                        {isEdit ? 'Save changes' : 'Create rule'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function RulesManager() {
    const { accounting } = useActiveCredentials();
    const credentialId = accounting?.id ?? '';

    const ledgersQ = api.accounting.ledgers.list.useQuery(
        { credentialId },
        { enabled: !!credentialId },
    );
    const ledgerOptions = useMemo<LedgerRef[]>(
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

function BankAccountFormDialog({
    credentialId,
    ledgerOptions,
    mode,
    onClose,
}: {
    credentialId: string;
    ledgerOptions: LedgerRef[];
    mode: 'new' | BankAccountView;
    onClose: () => void;
}) {
    const isEdit = mode !== 'new';
    const utils = api.useUtils();
    const invalidate = () =>
        void utils.accounting.bankAccounts.list.invalidate({ credentialId });
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
    const [ledger, setLedger] = useState<LedgerRef | null>(
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
                            onChange={(e) =>
                                setCurrency(e.target.value.toUpperCase())
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
    ledgerOptions: LedgerRef[];
}) {
    const utils = api.useUtils();
    const banksQ = api.accounting.bankAccounts.list.useQuery({ credentialId });
    const del = api.accounting.bankAccounts.delete.useMutation({
        onError: toastError,
        onSuccess: () =>
            void utils.accounting.bankAccounts.list.invalidate({
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

function RulesCard({
    credentialId,
    ledgerOptions,
}: {
    credentialId: string;
    ledgerOptions: LedgerRef[];
}) {
    const utils = api.useUtils();
    const rulesQ = api.accounting.rules.list.useQuery({ credentialId });
    const del = api.accounting.rules.delete.useMutation({
        onError: toastError,
        onSuccess: () =>
            void utils.accounting.rules.list.invalidate({ credentialId }),
    });

    const [form, setForm] = useState<'new' | null | RuleView>(null);
    const [directionFilter, setDirectionFilter] = useState<string>(ALL);
    const [vatFilter, setVatFilter] = useState<string>(ALL);
    const [ledgerFilter, setLedgerFilter] = useState<string>(ALL);

    const allRules = useMemo(
        () => (rulesQ.data ?? []) as RuleView[],
        [rulesQ.data],
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
                if (vatFilter !== ALL && r.vatCode !== vatFilter) return false;
                if (ledgerFilter !== ALL && r.ledger.label !== ledgerFilter)
                    return false;
                return true;
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
                accessorKey: 'vatCode',
                cell: ({ row }) => (
                    <Badge variant="outline">
                        {VAT_CODE_LABEL[row.original.vatCode]}
                    </Badge>
                ),
                enableSorting: true,
                header: 'VAT',
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
                                    {VAT_CODES.map((c) => (
                                        <SelectItem key={c} value={c}>
                                            {VAT_CODE_LABEL[c]}
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
                    initialSorting={[
                        { desc: false, id: 'direction' },
                        { desc: false, id: 'display' },
                    ]}
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
                    />
                )}
            </CardContent>
        </Card>
    );
}

function VatSelect({
    onChange,
    value,
}: {
    onChange: (v: VatCode) => void;
    value: string;
}) {
    return (
        <Select onValueChange={(v) => onChange(v as VatCode)} value={value}>
            <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="VAT code" />
            </SelectTrigger>
            <SelectContent>
                {VAT_CODES.map((c) => (
                    <SelectItem key={c} value={c}>
                        {VAT_CODE_LABEL[c]}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
