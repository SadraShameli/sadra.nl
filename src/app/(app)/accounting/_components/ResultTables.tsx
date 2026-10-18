'use client';

import { Plus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';
import { Controller, useForm, useWatch } from 'react-hook-form';

import type {
    Booking,
    BookingDirection,
    ConversionResult,
    LedgerReference,
    MatchAudit,
    UnknownMerchant,
} from '~/lib/accounting/core/types';

import { FormDialog } from '~/components/FormDialog';
import {
    editRowAction,
    RowActionKind,
    rowActionsColumn,
} from '~/components/RowActionsMenu';
import { StatStrip, StatTone } from '~/components/StatStrip';
import { SwitchCard } from '~/components/ToggleCard';
import { Badge } from '~/components/ui/badge';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
    DataTableFilterFunction,
} from '~/components/ui/data-table';
import { DataTableFacetSelect } from '~/components/ui/data-table-facet-select';
import { Dialog } from '~/components/ui/dialog';
import { EmptyState } from '~/components/ui/empty-state';
import { Field, FieldLabel } from '~/components/ui/field';
import { FilterDateRange } from '~/components/ui/filter-date-range';
import { FilterSelect } from '~/components/ui/filter-select';
import { Input } from '~/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { Eur } from '~/lib/accounting/core/money';
import { formatDisplayDate } from '~/lib/format';

import { ConversionNotes } from './ConversionNotes';
import { DialogMode, dialogSubmitLabels } from './dialogSubmitLabels';
import { DIRECTION_OPTIONS, DirectionBadge } from './DirectionBadge';
import { LedgerCombobox } from './LedgerCombobox';
import { RuleFormDialog, type RuleFormDialogPrefill } from './RulesManager';
import { type TaxCodeOption, useTaxCodes } from './useTaxCodes';

const ALL = '__all__';
interface BookingEditValues {
    counterpartLedger: LedgerReference;
    counterpartName: string;
    direction: BookingDirection;
    isRefund: boolean;
    taxCode: string;
}

type DirectionFilter = BookingDirection | typeof ALL;

interface PerCounterpartRow {
    count: number;
    direction: BookingDirection;
    name: string;
    total: number;
}

interface RuleView {
    direction: BookingDirection;
    display: string;
    ledger: LedgerReference;
    taxCode: string;
}

export function BookingsTable({
    bookings,
    credentialId,
    ledgerOptions,
    onEdit,
    rules,
}: {
    bookings: Booking[];
    credentialId: string;
    ledgerOptions: LedgerReference[];
    onEdit: (txnId: string, patch: Partial<Booking>) => void;
    rules: RuleView[];
}) {
    const { labelOf, options: taxCodeOptions } = useTaxCodes(credentialId);
    const [direction, setDirection] = useState<DirectionFilter>(ALL);
    const [taxCode, setTaxCode] = useState<string>(ALL);
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [editing, setEditing] = useState<Booking | null>(null);

    const rows = useMemo(
        () =>
            bookings.filter((b) => {
                return (
                    (direction === ALL || b.direction === direction) &&
                    (taxCode === ALL || b.taxCode === taxCode) &&
                    isIsoInRange(b.date, dateRange)
                );
            }),
        [bookings, direction, taxCode, dateRange],
    );

    const hasFilters =
        direction !== ALL || taxCode !== ALL || Boolean(dateRange?.from);

    const reset = () => {
        setDirection(ALL);
        setTaxCode(ALL);
        setDateRange(undefined);
    };

    const columns = useMemo<DataTableColumn<Booking>[]>(
        () => [
            {
                accessorKey: 'date',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {formatDisplayDate(row.original.date)}
                    </span>
                ),
                header: 'Date',
            },
            {
                accessorKey: 'direction',
                cell: ({ row }) => (
                    <DirectionBadge direction={row.original.direction} />
                ),
                header: 'Dir',
            },
            {
                accessorKey: 'counterpartName',
                cell: ({ row }) => (
                    <span className="text-xs">
                        {row.original.counterpartName}
                    </span>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Counterpart',
                meta: { isRowHeader: true },
            },
            {
                accessorKey: 'counterpartLedger',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-muted-foreground">
                        {row.original.counterpartLedger.label}
                    </span>
                ),
                header: 'Ledger',
            },
            {
                accessorKey: 'sourceCurrency',
                filterFn: DataTableFilterFunction.Equals,
                header: 'Currency',
            },
            {
                accessorKey: 'amountEur',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {Eur.format(row.original.amountEur)}
                    </span>
                ),
                header: 'Amount',
                meta: { align: DataTableAlign.End },
            },
            {
                accessorKey: 'taxCode',
                cell: ({ row }) => (
                    <Badge>{labelOf(row.original.taxCode)}</Badge>
                ),
                header: 'VAT',
            },
            {
                accessorKey: 'notes',
                cell: ({ row }) => (
                    <ConversionNotes notes={row.original.notes} />
                ),
                enableSorting: false,
                header: 'Conversion',
            },
            {
                accessorKey: 'txnId',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-muted-foreground">
                        {row.original.txnId}
                    </span>
                ),
                header: 'Reference',
            },
            rowActionsColumn<Booking>({
                actionsOf: (booking) => [
                    editRowAction(() => setEditing(booking)),
                ],
                labelOf: (booking) =>
                    `${booking.counterpartName} booking ${booking.txnId}`,
            }),
        ],
        [labelOf],
    );

    return bookings.length === 0 ? (
        <EmptyState
            description="No bookings produced from this run."
            title="Nothing to post"
        />
    ) : (
        <>
            <DataTable
                columns={columns}
                data={rows}
                emptyState={
                    <EmptyState
                        description="No bookings match the current filters."
                        title="No matches"
                    />
                }
                filterPlaceholder="Filter bookings…"
                hasExternalFilters={hasFilters}
                headerActions={(table) => (
                    <>
                        <DirectionSelect
                            onChange={setDirection}
                            value={direction}
                        />
                        <FilterSelect
                            label="VAT"
                            onValueChange={(v) => setTaxCode(v ?? ALL)}
                            options={taxCodeOptions.map((o) => ({
                                label: o.label,
                                value: o.code,
                            }))}
                            placeholder="All VAT codes"
                            value={taxCode === ALL ? undefined : taxCode}
                        />
                        <DataTableFacetSelect
                            column={table.getColumn('counterpartName')}
                            label="Counterpart"
                            placeholder="All counterparts"
                        />
                        {(table
                            .getColumn('sourceCurrency')
                            ?.getFacetedUniqueValues().size ?? 0) > 1 && (
                            <DataTableFacetSelect
                                column={table.getColumn('sourceCurrency')}
                                label="Currency"
                                placeholder="All currencies"
                            />
                        )}
                        <FilterDateRange
                            align="end"
                            label="Booking date"
                            onChange={setDateRange}
                            placeholder="Any date"
                            value={dateRange}
                        />
                    </>
                )}
                initialColumnVisibility={{ sourceCurrency: false }}
                onResetFilters={reset}
                rowId={(r) => r.txnId}
                showFilter
            />
            <Dialog
                onOpenChange={(isOpen) => {
                    if (!isOpen) setEditing(null);
                }}
                open={editing !== null}
            >
                {editing && (
                    <BookingEditDialog
                        booking={editing}
                        ledgerOptions={ledgerOptions}
                        onClose={() => setEditing(null)}
                        onSave={(patch) => onEdit(editing.txnId, patch)}
                        rules={rules}
                        taxCodeOptions={taxCodeOptions}
                    />
                )}
            </Dialog>
        </>
    );
}

export function MatchAuditTable({ result }: { result: ConversionResult }) {
    const [direction, setDirection] = useState<DirectionFilter>(ALL);

    const rows = useMemo(
        () =>
            direction === ALL
                ? result.matches
                : result.matches.filter((m) => m.direction === direction),
        [result.matches, direction],
    );

    const columns = useMemo<DataTableColumn<MatchAudit>[]>(
        () => [
            {
                accessorKey: 'direction',
                cell: ({ row }) => (
                    <DirectionBadge direction={row.original.direction} />
                ),
                header: 'Dir',
            },
            {
                accessorKey: 'rawName',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {row.original.rawName}
                    </span>
                ),
                header: 'Raw name',
                meta: { isRowHeader: true },
            },
            {
                accessorKey: 'matchedDisplay',
                cell: ({ row }) => (
                    <span className="text-xs">
                        {row.original.matchedDisplay}
                    </span>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Matched as',
            },
            {
                accessorKey: 'count',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {row.original.count}
                    </span>
                ),
                header: 'Txns',
                meta: { align: DataTableAlign.End },
            },
            {
                accessorKey: 'totalEur',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {Eur.format(row.original.totalEur)}
                    </span>
                ),
                header: 'Total',
                meta: { align: DataTableAlign.End },
            },
        ],
        [],
    );

    return result.matches.length === 0 ? (
        <EmptyState
            description="Matched merchants will appear here so you can sanity-check the routing."
            title="No matches yet"
        />
    ) : (
        <DataTable
            columns={columns}
            data={rows}
            emptyState={
                <EmptyState
                    description="No matches for the current filters."
                    title="No matches"
                />
            }
            filterPlaceholder="Filter matches…"
            hasExternalFilters={direction !== ALL}
            headerActions={(table) => (
                <>
                    <DirectionSelect
                        onChange={setDirection}
                        value={direction}
                    />
                    <DataTableFacetSelect
                        column={table.getColumn('matchedDisplay')}
                        label="Matched ledger"
                        placeholder="All ledgers"
                    />
                </>
            )}
            onResetFilters={() => setDirection(ALL)}
            rowId={(r) => `${r.direction}|${r.matchedDisplay}|${r.rawName}`}
            showFilter
        />
    );
}

export function PerCounterpartTable({ result }: { result: ConversionResult }) {
    const [direction, setDirection] = useState<DirectionFilter>(ALL);
    const allRows = useMemo<PerCounterpartRow[]>(() => {
        const map = new Map<string, PerCounterpartRow>();
        for (const b of result.bookings) {
            const key = `${b.direction}|${b.counterpartName}`;
            const existing = map.get(key);
            if (existing) {
                existing.total += b.amountEur;
                existing.count += 1;
            } else {
                map.set(key, {
                    count: 1,
                    direction: b.direction,
                    name: b.counterpartName,
                    total: b.amountEur,
                });
            }
        }
        return map
            .values()
            .toArray()
            .toSorted((a, b) => {
                if (a.direction !== b.direction)
                    return a.direction < b.direction ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
    }, [result]);
    const rows = useMemo(
        () =>
            direction === ALL
                ? allRows
                : allRows.filter((r) => r.direction === direction),
        [allRows, direction],
    );

    const columns = useMemo<DataTableColumn<PerCounterpartRow>[]>(
        () => [
            {
                accessorKey: 'direction',
                cell: ({ row }) => (
                    <DirectionBadge direction={row.original.direction} />
                ),
                header: 'Dir',
            },
            {
                accessorKey: 'name',
                header: 'Counterpart',
                meta: { isRowHeader: true },
            },
            {
                accessorKey: 'count',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {row.original.count}
                    </span>
                ),
                header: 'Txns',
                meta: { align: DataTableAlign.End },
            },
            {
                accessorKey: 'total',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {Eur.format(row.original.total)}
                    </span>
                ),
                header: 'Total',
                meta: { align: DataTableAlign.End },
            },
        ],
        [],
    );

    return allRows.length === 0 ? (
        <EmptyState
            description="Per-counterpart breakdown will appear once bookings exist."
            title="No counterparts"
        />
    ) : (
        <DataTable
            columns={columns}
            data={rows}
            emptyState={
                <EmptyState
                    description="No counterparts match this filter."
                    title="No matches"
                />
            }
            filterPlaceholder="Filter counterparts…"
            hasExternalFilters={direction !== ALL}
            headerActions={
                <DirectionSelect onChange={setDirection} value={direction} />
            }
            onResetFilters={() => setDirection(ALL)}
            rowId={(r) => `${r.direction}|${r.name}`}
            showFilter
        />
    );
}

export function TotalPanel({ result }: { result: ConversionResult }) {
    const totals = useMemo(() => {
        let inEur = 0;
        let outEur = 0;
        for (const b of result.bookings) {
            if (b.direction === 'IN') inEur += b.amountEur;
            else outEur += b.amountEur;
        }
        const unknownCount = result.unknowns.reduce((s, u) => s + u.count, 0);
        return {
            bookings: result.bookings.length,
            inEur,
            outEur,
            skipped: result.skippedCurrency,
            unknownCount,
            unknownNames: result.unknowns.length,
        };
    }, [result]);

    return (
        <StatStrip
            items={[
                {
                    id: 'bookings',
                    label: 'Bookings',
                    value: totals.bookings.toString(),
                },
                {
                    id: 'in',
                    label: 'In',
                    value: Eur.format(totals.inEur),
                },
                {
                    id: 'out',
                    label: 'Out',
                    value: Eur.format(totals.outEur),
                },
                {
                    id: 'unknown',
                    label: 'Unknown txns',
                    tone: warningToneFor(totals.unknownCount),
                    value: `${totals.unknownCount} / ${totals.unknownNames} names`,
                },
                {
                    id: 'skipped',
                    label: 'Skipped currency',
                    tone: warningToneFor(totals.skipped),
                    value: totals.skipped.toString(),
                },
            ]}
        />
    );
}

export function UnknownsTable({
    credentialId,
    ledgerOptions,
    result,
}: {
    credentialId?: string;
    ledgerOptions?: LedgerReference[];
    result: ConversionResult;
}) {
    const [direction, setDirection] = useState<DirectionFilter>(ALL);
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [ruleDialog, setRuleDialog] = useState<null | RuleFormDialogPrefill>(
        null,
    );

    const rows = useMemo(
        () =>
            result.unknowns.filter((u) => {
                return (
                    (direction === ALL || u.direction === direction) &&
                    isIsoInRange(u.firstSeen, dateRange)
                );
            }),
        [result.unknowns, direction, dateRange],
    );

    const hasFilters = direction !== ALL || Boolean(dateRange?.from);
    const reset = () => {
        setDirection(ALL);
        setDateRange(undefined);
    };

    const canCreateRule = !!credentialId && !!ledgerOptions;

    const columns = useMemo<DataTableColumn<UnknownMerchant>[]>(
        () => [
            {
                accessorKey: 'direction',
                cell: ({ row }) => (
                    <DirectionBadge direction={row.original.direction} />
                ),
                header: 'Dir',
            },
            {
                accessorKey: 'rawName',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {row.original.rawName}
                    </span>
                ),
                header: 'Raw name',
                meta: { isRowHeader: true },
            },
            {
                accessorKey: 'count',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {row.original.count}
                    </span>
                ),
                header: 'Txns',
                meta: { align: DataTableAlign.End },
            },
            {
                accessorKey: 'firstSeen',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-muted-foreground">
                        {formatDisplayDate(row.original.firstSeen)}
                    </span>
                ),
                header: 'First seen',
            },
            {
                accessorKey: 'lastSeen',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-muted-foreground">
                        {formatDisplayDate(row.original.lastSeen)}
                    </span>
                ),
                header: 'Last seen',
            },
            ...(canCreateRule
                ? [
                      rowActionsColumn<UnknownMerchant>({
                          actionsOf: (unknown) => [
                              {
                                  icon: Plus,
                                  kind: RowActionKind.Select,
                                  label: 'Create rule',
                                  onSelect: () =>
                                      setRuleDialog({
                                          direction: unknown.direction,
                                          match: unknown.rawName,
                                      }),
                              },
                          ],
                          labelOf: (unknown) => unknown.rawName,
                      }),
                  ]
                : []),
        ],
        [canCreateRule],
    );

    return result.unknowns.length === 0 ? (
        <EmptyState
            description="Every counterpart was matched by a rule. Nice."
            title="Nothing unknown"
        />
    ) : (
        <>
            <DataTable
                columns={columns}
                data={rows}
                emptyState={
                    <EmptyState
                        description="No unknowns match the current filters."
                        title="No matches"
                    />
                }
                filterPlaceholder="Filter unknowns…"
                hasExternalFilters={hasFilters}
                headerActions={
                    <>
                        <DirectionSelect
                            onChange={setDirection}
                            value={direction}
                        />
                        <FilterDateRange
                            align="end"
                            label="First seen date"
                            onChange={setDateRange}
                            placeholder="First seen, any date"
                            value={dateRange}
                        />
                    </>
                }
                onResetFilters={reset}
                rowId={(r) => `${r.direction}|${r.rawName}`}
                showFilter
            />
            <Dialog
                onOpenChange={(isOpen) => {
                    if (!isOpen) setRuleDialog(null);
                }}
                open={ruleDialog !== null}
            >
                {ruleDialog !== null && credentialId && ledgerOptions && (
                    <RuleFormDialog
                        credentialId={credentialId}
                        ledgerOptions={ledgerOptions}
                        mode={ruleDialog}
                        onClose={() => setRuleDialog(null)}
                    />
                )}
            </Dialog>
        </>
    );
}

export function warningToneFor(count: number): StatTone {
    return count > 0 ? StatTone.Warning : StatTone.Default;
}

function BookingEditDialog({
    booking,
    ledgerOptions,
    onClose,
    onSave,
    rules,
    taxCodeOptions,
}: {
    booking: Booking;
    ledgerOptions: LedgerReference[];
    onClose: () => void;
    onSave: (patch: Partial<Booking>) => void;
    rules: RuleView[];
    taxCodeOptions: TaxCodeOption[];
}) {
    const purchaseRule = useMemo(
        () =>
            rules.find(
                (r) =>
                    r.direction === 'OUT' &&
                    r.display === booking.counterpartName,
            ) ?? null,
        [rules, booking.counterpartName],
    );
    const payoutRule = useMemo(
        () =>
            rules.find(
                (r) =>
                    r.direction === 'IN' &&
                    r.display === booking.counterpartName,
            ) ?? null,
        [rules, booking.counterpartName],
    );

    const form = useForm<BookingEditValues>({
        defaultValues: {
            counterpartLedger: booking.counterpartLedger,
            counterpartName: booking.counterpartName,
            direction: booking.direction,
            isRefund: booking.isRefund === true,
            taxCode: booking.taxCode,
        },
    });
    const direction = useWatch({ control: form.control, name: 'direction' });
    const fieldId = useId();
    const directionId = `${fieldId}-direction`;
    const refundId = `${fieldId}-refund`;
    const counterpartId = `${fieldId}-counterpart`;
    const taxCodeId = `${fieldId}-tax-code`;

    const toggleRefund = (isChecked: boolean) => {
        form.setValue('isRefund', isChecked);
        if (isChecked && purchaseRule) {
            form.setValue('counterpartLedger', purchaseRule.ledger);
            form.setValue('taxCode', purchaseRule.taxCode);
        } else if (!isChecked) {
            form.setValue(
                'counterpartLedger',
                payoutRule?.ledger ?? booking.counterpartLedger,
            );
            form.setValue('taxCode', payoutRule?.taxCode ?? booking.taxCode);
        }
    };

    const save = (values: BookingEditValues) => {
        onSave({
            counterpartLedger: values.counterpartLedger,
            counterpartName: values.counterpartName,
            direction: values.direction,
            isRefund: values.isRefund,
            taxCode: values.taxCode,
        });
        onClose();
    };

    return (
        <FormDialog
            description={`${formatDisplayDate(booking.date)} · ${Eur.format(booking.amountEur)} · ${booking.txnId}`}
            form={form}
            onCancel={onClose}
            onSubmit={save}
            pending={false}
            title="Edit booking"
            {...dialogSubmitLabels(DialogMode.Edit)}
        >
            <Controller
                control={form.control}
                name="direction"
                render={({ field }) => (
                    <Field>
                        <FieldLabel htmlFor={directionId}>Direction</FieldLabel>
                        <Select
                            onValueChange={(v) =>
                                field.onChange(
                                    DIRECTION_OPTIONS.find((o) => o.value === v)
                                        ?.value ?? field.value,
                                )
                            }
                            value={field.value}
                        >
                            <SelectTrigger
                                className="h-8 w-full text-xs"
                                id={directionId}
                            >
                                <SelectValue>
                                    {
                                        DIRECTION_OPTIONS.find(
                                            (o) => o.value === field.value,
                                        )?.label
                                    }
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
                    </Field>
                )}
            />
            {direction === 'IN' && (
                <Controller
                    control={form.control}
                    name="isRefund"
                    render={({ field }) => (
                        <SwitchCard
                            checked={field.value}
                            description={
                                purchaseRule
                                    ? `Reverse the purchase → ${purchaseRule.ledger.label}`
                                    : 'No purchase rule for this counterpart'
                            }
                            disabled={!purchaseRule}
                            id={refundId}
                            label="Refund"
                            onCheckedChange={toggleRefund}
                        />
                    )}
                />
            )}
            <Controller
                control={form.control}
                name="counterpartName"
                render={({ field }) => (
                    <Field>
                        <FieldLabel htmlFor={counterpartId}>
                            Counterpart
                        </FieldLabel>
                        <Input
                            className="h-8 text-xs"
                            id={counterpartId}
                            onChange={field.onChange}
                            ref={field.ref}
                            value={field.value}
                        />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="counterpartLedger"
                render={({ field }) => (
                    <Field>
                        <FieldLabel>Ledger</FieldLabel>
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
                    <Field>
                        <FieldLabel htmlFor={taxCodeId}>VAT</FieldLabel>
                        <Select
                            onValueChange={field.onChange}
                            value={field.value}
                        >
                            <SelectTrigger
                                className="h-8 w-full text-xs"
                                id={taxCodeId}
                            >
                                <SelectValue>
                                    {
                                        taxCodeOptions.find(
                                            (o) => o.code === field.value,
                                        )?.label
                                    }
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {taxCodeOptions.map((o) => (
                                    <SelectItem key={o.code} value={o.code}>
                                        {o.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                )}
            />
        </FormDialog>
    );
}

function DirectionSelect({
    onChange,
    value,
}: {
    onChange: (v: DirectionFilter) => void;
    value: DirectionFilter;
}) {
    return (
        <FilterSelect
            label="Direction"
            onValueChange={(v) => onChange((v ?? ALL) as DirectionFilter)}
            options={DIRECTION_OPTIONS}
            placeholder="All directions"
            value={value === ALL ? undefined : value}
        />
    );
}

function isIsoInRange(iso: string, range: DateRange | undefined): boolean {
    if (!range?.from) return true;
    const d = new Date(iso);
    const from = new Date(range.from);
    from.setHours(0, 0, 0, 0);
    if (d < from) return false;
    if (range.to) {
        const to = new Date(range.to);
        to.setHours(23, 59, 59, 999);
        if (d > to) return false;
    }
    return true;
}
