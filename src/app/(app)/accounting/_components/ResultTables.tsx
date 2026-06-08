'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';

import type {
    Booking,
    BookingDirection,
    BookingRule,
    ConversionResult,
    LedgerRef,
    MatchAudit,
    UnknownMerchant,
} from '~/lib/accounting/core/types';

import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent } from '~/components/ui/Card';
import { ClearFiltersButton } from '~/components/ui/ClearFiltersButton';
import { DataTable } from '~/components/ui/DataTable';
import { DateRangePicker } from '~/components/ui/DatePicker';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/Dialog';
import { EmptyState } from '~/components/ui/EmptyState';
import { Input } from '~/components/ui/Input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { Switch } from '~/components/ui/Switch';
import {
    VAT_CODE_LABEL,
    VAT_CODES,
    type VatCode,
} from '~/lib/accounting/providers/eboekhouden/enums';
import { cn } from '~/lib/utils';

import { DirectionBadge } from './DirectionBadge';
import { LedgerCombobox } from './LedgerCombobox';

const ALL = '__all__';
type DirectionFilter = BookingDirection | typeof ALL;

function DirectionSelect({
    onChange,
    value,
}: {
    onChange: (v: DirectionFilter) => void;
    value: DirectionFilter;
}) {
    return (
        <Select
            onValueChange={(v) => onChange(v as DirectionFilter)}
            value={value}
        >
            <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL}>All directions</SelectItem>
                <SelectItem value="IN">Incoming</SelectItem>
                <SelectItem value="OUT">Outgoing</SelectItem>
            </SelectContent>
        </Select>
    );
}

function FilterField({
    children,
    label,
}: {
    children: React.ReactNode;
    label: string;
}) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                {label}
            </span>
            {children}
        </div>
    );
}

function HeaderActionsShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-end">
            {children}
        </div>
    );
}

function isoInRange(iso: string, range: DateRange | undefined): boolean {
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

const formatEur = (n: number) =>
    new Intl.NumberFormat('en-US', {
        currency: 'EUR',
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
        style: 'currency',
    }).format(n);

interface PerCounterpartRow {
    count: number;
    direction: BookingDirection;
    name: string;
    total: number;
}

export function BookingsTable({
    bookings,
    ledgerOptions,
    onEdit,
    rules,
}: {
    bookings: Booking[];
    ledgerOptions: LedgerRef[];
    onEdit: (txnId: string, patch: Partial<Booking>) => void;
    rules: BookingRule[];
}) {
    const [direction, setDirection] = useState<DirectionFilter>(ALL);
    const [vatCode, setVatCode] = useState<string>(ALL);
    const [counterpart, setCounterpart] = useState<string>(ALL);
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [editing, setEditing] = useState<Booking | null>(null);

    const counterpartOptions = useMemo(
        () =>
            [...new Set(bookings.map((b) => b.counterpartName))].toSorted(
                (a, b) => a.localeCompare(b),
            ),
        [bookings],
    );

    const rows = useMemo(
        () =>
            bookings.filter((b) => {
                if (direction !== ALL && b.direction !== direction)
                    return false;
                if (vatCode !== ALL && b.vatCode !== vatCode) return false;
                if (counterpart !== ALL && b.counterpartName !== counterpart)
                    return false;
                if (!isoInRange(b.date, dateRange)) return false;
                return true;
            }),
        [bookings, direction, vatCode, counterpart, dateRange],
    );

    const hasFilters =
        direction !== ALL ||
        vatCode !== ALL ||
        counterpart !== ALL ||
        Boolean(dateRange?.from);

    const reset = () => {
        setDirection(ALL);
        setVatCode(ALL);
        setCounterpart(ALL);
        setDateRange(undefined);
    };

    const columns = useMemo<ColumnDef<Booking>[]>(
        () => [
            {
                accessorKey: 'date',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {row.original.date}
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
                header: 'Counterpart',
            },
            {
                accessorKey: 'counterpartLedger',
                cell: ({ row }) => (
                    <span className="font-mono text-[10px] text-muted-foreground">
                        {row.original.counterpartLedger.label}
                    </span>
                ),
                header: 'Ledger',
            },
            {
                accessorKey: 'amountEur',
                cell: ({ row }) => (
                    <span
                        className={
                            row.original.direction === 'IN'
                                ? 'font-mono text-xs text-emerald-300'
                                : 'font-mono text-xs text-rose-300'
                        }
                    >
                        {formatEur(row.original.amountEur)}
                    </span>
                ),
                header: 'EUR',
            },
            {
                accessorKey: 'vatCode',
                cell: ({ row }) => (
                    <Badge variant="outline">
                        {VAT_CODE_LABEL[row.original.vatCode]}
                    </Badge>
                ),
                header: 'VAT',
            },
            {
                accessorKey: 'notes',
                cell: ({ row }) => (
                    <span className="font-mono text-[10px] text-muted-foreground">
                        {row.original.notes.join(' + ')}
                    </span>
                ),
                header: 'Conversion',
            },
            {
                accessorKey: 'txnId',
                cell: ({ row }) => (
                    <span className="font-mono text-[10px] text-sky-300">
                        {row.original.txnId}
                    </span>
                ),
                header: 'Reference',
            },
            {
                cell: ({ row }) => (
                    <Button
                        onClick={() => setEditing(row.original)}
                        size="icon"
                        variant="ghost"
                    >
                        <Pencil className="size-3.5" />
                    </Button>
                ),
                header: '',
                id: 'actions',
            },
        ],
        [],
    );

    if (bookings.length === 0) {
        return (
            <EmptyState
                description="No bookings produced from this run."
                title="Nothing to post"
            />
        );
    }
    return (
        <>
            <DataTable
                belowFilter={
                    <ClearFiltersButton active={hasFilters} onReset={reset} />
                }
                columns={columns}
                data={rows}
                emptyState={
                    <EmptyState
                        description="No bookings match the current filters."
                        title="No matches"
                    />
                }
                filterPlaceholder="Filter bookings…"
                filterPosition="bottom"
                headerActions={
                    <HeaderActionsShell>
                        <FilterField label="Direction">
                            <DirectionSelect
                                onChange={setDirection}
                                value={direction}
                            />
                        </FilterField>
                        <FilterField label="VAT">
                            <Select onValueChange={setVatCode} value={vatCode}>
                                <SelectTrigger className="h-8 w-44 text-xs">
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
                        </FilterField>
                        <FilterField label="Counterpart">
                            <Select
                                onValueChange={setCounterpart}
                                value={counterpart}
                            >
                                <SelectTrigger className="h-8 w-48 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>
                                        All counterparts
                                    </SelectItem>
                                    {counterpartOptions.map((c) => (
                                        <SelectItem key={c} value={c}>
                                            {c}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </FilterField>
                        <FilterField label="Date range">
                            <DateRangePicker
                                align="end"
                                className="h-8 text-xs"
                                onChange={setDateRange}
                                placeholder="Any date"
                                value={dateRange}
                            />
                        </FilterField>
                    </HeaderActionsShell>
                }
                pageSize={20}
                rowId={(r) => r.txnId}
                showFilter
            />
            {editing && (
                <BookingEditDialog
                    booking={editing}
                    ledgerOptions={ledgerOptions}
                    onClose={() => setEditing(null)}
                    onSave={(patch) => onEdit(editing.txnId, patch)}
                    rules={rules}
                />
            )}
        </>
    );
}

export function MatchAuditTable({ result }: { result: ConversionResult }) {
    const [direction, setDirection] = useState<DirectionFilter>(ALL);
    const [matched, setMatched] = useState<string>(ALL);

    const matchedOptions = useMemo(
        () =>
            [...new Set(result.matches.map((m) => m.matchedDisplay))].toSorted(
                (a, b) => a.localeCompare(b),
            ),
        [result.matches],
    );

    const rows = useMemo(
        () =>
            result.matches.filter((m) => {
                if (direction !== ALL && m.direction !== direction)
                    return false;
                if (matched !== ALL && m.matchedDisplay !== matched)
                    return false;
                return true;
            }),
        [result.matches, direction, matched],
    );

    const hasFilters = direction !== ALL || matched !== ALL;
    const reset = () => {
        setDirection(ALL);
        setMatched(ALL);
    };

    const columns = useMemo<ColumnDef<MatchAudit>[]>(
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
            },
            {
                accessorKey: 'matchedDisplay',
                cell: ({ row }) => (
                    <span className="text-xs">
                        {row.original.matchedDisplay}
                    </span>
                ),
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
            },
            {
                accessorKey: 'totalEur',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-emerald-300">
                        {formatEur(row.original.totalEur)}
                    </span>
                ),
                header: 'EUR',
            },
        ],
        [],
    );

    if (result.matches.length === 0) {
        return (
            <EmptyState
                description="Matched merchants will appear here so you can sanity-check the routing."
                title="No matches yet"
            />
        );
    }
    return (
        <DataTable
            belowFilter={
                <ClearFiltersButton active={hasFilters} onReset={reset} />
            }
            columns={columns}
            data={rows}
            emptyState={
                <EmptyState
                    description="No matches for the current filters."
                    title="No matches"
                />
            }
            filterPlaceholder="Filter matches…"
            filterPosition="bottom"
            headerActions={
                <HeaderActionsShell>
                    <FilterField label="Direction">
                        <DirectionSelect
                            onChange={setDirection}
                            value={direction}
                        />
                    </FilterField>
                    <FilterField label="Matched ledger">
                        <Select onValueChange={setMatched} value={matched}>
                            <SelectTrigger className="h-8 w-48 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL}>All ledgers</SelectItem>
                                {matchedOptions.map((m) => (
                                    <SelectItem key={m} value={m}>
                                        {m}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </FilterField>
                </HeaderActionsShell>
            }
            pageSize={20}
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
        return [...map.values()].toSorted((a, b) => {
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

    const columns = useMemo<ColumnDef<PerCounterpartRow>[]>(
        () => [
            {
                accessorKey: 'direction',
                cell: ({ row }) => (
                    <DirectionBadge direction={row.original.direction} />
                ),
                header: 'Dir',
            },
            { accessorKey: 'name', header: 'Counterpart' },
            {
                accessorKey: 'count',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {row.original.count}
                    </span>
                ),
                header: 'Txns',
            },
            {
                accessorKey: 'total',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-emerald-300">
                        {formatEur(row.original.total)}
                    </span>
                ),
                header: 'EUR',
            },
        ],
        [],
    );

    if (allRows.length === 0) {
        return (
            <EmptyState
                description="Per-counterpart breakdown will appear once bookings exist."
                title="No counterparts"
            />
        );
    }
    return (
        <DataTable
            belowFilter={
                <ClearFiltersButton
                    active={direction !== ALL}
                    onReset={() => setDirection(ALL)}
                />
            }
            columns={columns}
            data={rows}
            emptyState={
                <EmptyState
                    description="No counterparts match this filter."
                    title="No matches"
                />
            }
            filterPlaceholder="Filter counterparts…"
            filterPosition="bottom"
            headerActions={
                <HeaderActionsShell>
                    <FilterField label="Direction">
                        <DirectionSelect
                            onChange={setDirection}
                            value={direction}
                        />
                    </FilterField>
                </HeaderActionsShell>
            }
            pageSize={20}
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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Tile
                label="Bookings"
                tone="default"
                value={totals.bookings.toString()}
            />
            <Tile label="IN" tone="in" value={formatEur(totals.inEur)} />
            <Tile label="OUT" tone="out" value={formatEur(totals.outEur)} />
            <Tile
                label="Unknown txns"
                tone={totals.unknownCount > 0 ? 'warn' : 'default'}
                value={`${totals.unknownCount} / ${totals.unknownNames} names`}
            />
            <Tile
                label="Skipped currency"
                tone={totals.skipped > 0 ? 'warn' : 'default'}
                value={totals.skipped.toString()}
            />
        </div>
    );
}

export function UnknownsTable({ result }: { result: ConversionResult }) {
    const [direction, setDirection] = useState<DirectionFilter>(ALL);
    const [dateRange, setDateRange] = useState<DateRange | undefined>();

    const rows = useMemo(
        () =>
            result.unknowns.filter((u) => {
                if (direction !== ALL && u.direction !== direction)
                    return false;
                if (!isoInRange(u.firstSeen, dateRange)) return false;
                return true;
            }),
        [result.unknowns, direction, dateRange],
    );

    const hasFilters = direction !== ALL || Boolean(dateRange?.from);
    const reset = () => {
        setDirection(ALL);
        setDateRange(undefined);
    };

    const columns = useMemo<ColumnDef<UnknownMerchant>[]>(
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
                    <span className="font-mono text-xs text-amber-300">
                        {row.original.rawName}
                    </span>
                ),
                header: 'Raw name',
            },
            {
                accessorKey: 'count',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {row.original.count}
                    </span>
                ),
                header: 'Txns',
            },
            {
                accessorKey: 'firstSeen',
                cell: ({ row }) => (
                    <span className="font-mono text-[10px] text-muted-foreground">
                        {row.original.firstSeen}
                    </span>
                ),
                header: 'First seen',
            },
            {
                accessorKey: 'lastSeen',
                cell: ({ row }) => (
                    <span className="font-mono text-[10px] text-muted-foreground">
                        {row.original.lastSeen}
                    </span>
                ),
                header: 'Last seen',
            },
        ],
        [],
    );

    if (result.unknowns.length === 0) {
        return (
            <EmptyState
                description="Every counterpart was matched by a rule. Nice."
                title="Nothing unknown"
            />
        );
    }
    return (
        <DataTable
            belowFilter={
                <ClearFiltersButton active={hasFilters} onReset={reset} />
            }
            columns={columns}
            data={rows}
            emptyState={
                <EmptyState
                    description="No unknowns match the current filters."
                    title="No matches"
                />
            }
            filterPlaceholder="Filter unknowns…"
            filterPosition="bottom"
            headerActions={
                <HeaderActionsShell>
                    <FilterField label="Direction">
                        <DirectionSelect
                            onChange={setDirection}
                            value={direction}
                        />
                    </FilterField>
                    <FilterField label="First seen">
                        <DateRangePicker
                            align="end"
                            className="h-8 text-xs"
                            onChange={setDateRange}
                            placeholder="Any date"
                            value={dateRange}
                        />
                    </FilterField>
                </HeaderActionsShell>
            }
            pageSize={20}
            rowId={(r) => `${r.direction}|${r.rawName}`}
            showFilter
        />
    );
}

function BookingEditDialog({
    booking,
    ledgerOptions,
    onClose,
    onSave,
    rules,
}: {
    booking: Booking;
    ledgerOptions: LedgerRef[];
    onClose: () => void;
    onSave: (patch: Partial<Booking>) => void;
    rules: BookingRule[];
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

    const [direction, setDirection] = useState<BookingDirection>(
        booking.direction,
    );
    const [counterpartName, setCounterpartName] = useState(
        booking.counterpartName,
    );
    const [counterpartLedger, setCounterpartLedger] = useState<LedgerRef>(
        booking.counterpartLedger,
    );
    const [vatCode, setVatCode] = useState<VatCode>(booking.vatCode);
    const [isRefund, setIsRefund] = useState(() => booking.isRefund === true);

    const toggleRefund = (checked: boolean) => {
        setIsRefund(checked);
        if (checked && purchaseRule) {
            setCounterpartLedger(purchaseRule.ledger);
            setVatCode(purchaseRule.vatCode);
        } else if (!checked) {
            setCounterpartLedger(
                payoutRule?.ledger ?? booking.counterpartLedger,
            );
            setVatCode(payoutRule?.vatCode ?? booking.vatCode);
        }
    };

    const save = () => {
        onSave({
            counterpartLedger,
            counterpartName,
            direction,
            isRefund,
            vatCode,
        });
        onClose();
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
                    <DialogTitle>Edit booking</DialogTitle>
                    <DialogDescription className="font-mono text-xs">
                        {booking.date} · {formatEur(booking.amountEur)} ·{' '}
                        {booking.txnId}
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <FilterField label="Direction">
                        <Select
                            onValueChange={(v) =>
                                setDirection(v as BookingDirection)
                            }
                            value={direction}
                        >
                            <SelectTrigger className="h-8 w-full text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="IN">IN</SelectItem>
                                <SelectItem value="OUT">OUT</SelectItem>
                            </SelectContent>
                        </Select>
                    </FilterField>
                    {direction === 'IN' && (
                        <FilterField label="Refund">
                            <label className="flex items-center gap-2 text-xs">
                                <Switch
                                    checked={isRefund}
                                    disabled={!purchaseRule}
                                    onCheckedChange={toggleRefund}
                                />
                                <span className="text-muted-foreground">
                                    {purchaseRule
                                        ? `Reverse the purchase → ${purchaseRule.ledger.label}`
                                        : 'No purchase rule for this counterpart'}
                                </span>
                            </label>
                        </FilterField>
                    )}
                    <FilterField label="Counterpart">
                        <Input
                            className="h-8 text-xs"
                            onChange={(e) => setCounterpartName(e.target.value)}
                            value={counterpartName}
                        />
                    </FilterField>
                    <FilterField label="Ledger">
                        <LedgerCombobox
                            onChange={setCounterpartLedger}
                            options={ledgerOptions}
                            value={counterpartLedger}
                        />
                    </FilterField>
                    <FilterField label="VAT">
                        <Select
                            onValueChange={(v) => setVatCode(v as VatCode)}
                            value={vatCode}
                        >
                            <SelectTrigger className="h-8 w-full text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {VAT_CODES.map((c) => (
                                    <SelectItem key={c} value={c}>
                                        {VAT_CODE_LABEL[c]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </FilterField>
                </div>
                <DialogFooter>
                    <Button onClick={save}>Save changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function Tile({
    label,
    tone,
    value,
}: {
    label: string;
    tone: 'default' | 'in' | 'out' | 'warn';
    value: string;
}) {
    return (
        <Card className="min-w-0 gap-1 py-3">
            <CardContent className="px-3">
                <div className="text-[10px] tracking-wider text-muted-foreground uppercase">
                    {label}
                </div>
                <div
                    className={cn(
                        'mt-1 font-mono text-sm font-semibold wrap-break-word sm:text-base',
                        tone === 'in' && 'text-emerald-300',
                        tone === 'out' && 'text-rose-300',
                        tone === 'warn' && 'text-amber-300',
                        tone === 'default' && 'text-foreground',
                    )}
                >
                    {value}
                </div>
            </CardContent>
        </Card>
    );
}
