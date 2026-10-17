'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { format, subDays } from 'date-fns';
import { LineChart, Plus, Ruler, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '~/components/ui/AlertDialog';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import AreaChartNew from '~/components/ui/Chart/AreaChartNew';
import {
    DataTable,
    type DataTableColumn,
    DataTableFilterFunction,
    type DataTableSlot,
} from '~/components/ui/DataTable';
import { DataTableDateRange } from '~/components/ui/DataTableDateRange';
import { DataTableFacetSelect } from '~/components/ui/DataTableFacetSelect';
import { DatePicker } from '~/components/ui/DatePicker';
import { EmptyState } from '~/components/ui/EmptyState';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '~/components/ui/Form';
import { Input } from '~/components/ui/Input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { Skeleton } from '~/components/ui/Skeleton';
import { Textarea } from '~/components/ui/Textarea';
import { ToolbarSelect } from '~/components/ui/ToolbarSelect';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '~/components/ui/Tooltip';
import { MeasurementUnitConversion } from '~/lib/lifting/format';
import {
    type CreateMeasurementInput,
    measurementInputSchema,
} from '~/lib/lifting/schemas';
import {
    MEASUREMENT_KIND_VALUES,
    MEASUREMENT_UNIT_VALUES,
    type MeasurementKind,
    type MeasurementUnit,
    type UnitLength,
    type UnitWeight,
} from '~/lib/lifting/types';
import { api, type RouterOutputs } from '~/trpc/react';

type MeasurementRow = RouterOutputs['lifting']['measurement']['list'][number];

const TAPE_KINDS: ReadonlySet<MeasurementKind> = new Set([
    'arm_l',
    'arm_r',
    'calf_l',
    'calf_r',
    'chest',
    'hip',
    'neck',
    'thigh_l',
    'thigh_r',
    'waist',
]);

interface Stats {
    bodyfat: MeasurementRow | undefined;
    total: number;
    weight: MeasurementRow | undefined;
    weightDelta30d: null | number;
}

export function BodyView() {
    const utilities = api.useUtils();
    const settings = api.lifting.settings.get.useQuery();
    const unitWeight = settings.data?.unitWeight ?? 'kg';
    const unitLength = settings.data?.unitLength ?? 'cm';

    const measurements = api.lifting.measurement.list.useQuery({});

    const create = api.lifting.measurement.create.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Measurement saved');
            await utilities.lifting.measurement.list.invalidate();
        },
    });
    const remove = api.lifting.measurement.delete.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: () => utilities.lifting.measurement.list.invalidate(),
    });

    const rows = useMemo(() => measurements.data ?? [], [measurements.data]);
    const stats = useStats(rows, unitWeight);

    return (
        <div className="flex flex-col gap-6">
            <AddMeasurementCard
                onCreate={(v) => create.mutate(v)}
                pending={create.isPending}
                unitLength={unitLength}
                unitWeight={unitWeight}
            />

            <BodyStatsCards stats={stats} />

            <MeasurementTrendChart
                unitLength={unitLength}
                unitWeight={unitWeight}
            />

            <Card>
                <CardHeader>
                    <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                        History
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <MeasurementsHistoryTable
                        headerActions={(table) => (
                            <div className="flex w-full flex-col gap-3">
                                <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center">
                                    <DataTableFacetSelect
                                        column={table.getColumn('kind')}
                                        format={(k) => (
                                            <span className="capitalize">
                                                {k.replaceAll('_', ' ')}
                                            </span>
                                        )}
                                        label="Kind"
                                        placeholder="All kinds"
                                    />
                                    <DataTableFacetSelect
                                        column={table.getColumn('unit')}
                                        label="Unit"
                                        placeholder="All units"
                                    />
                                    <DataTableDateRange
                                        column={table.getColumn('takenAt')}
                                        label="Logged date"
                                        maxDate={new Date()}
                                        placeholder="Any time"
                                    />
                                </div>
                            </div>
                        )}
                        isLoading={measurements.isLoading}
                        onDelete={(id) => remove.mutate({ id })}
                        rows={rows}
                    />
                </CardContent>
            </Card>
        </div>
    );
}

const TREND_CHART_CONFIG = {
    value: { color: 'var(--muted-foreground)', label: 'Value' },
} as const;

function AddMeasurementCard({
    onCreate,
    pending,
    unitLength,
    unitWeight,
}: {
    onCreate: (v: CreateMeasurementInput) => void;
    pending: boolean;
    unitLength: UnitLength;
    unitWeight: UnitWeight;
}) {
    const form = useForm<CreateMeasurementInput>({
        defaultValues: {
            kind: 'weight',
            notes: '',
            takenAt: new Date(),
            unit: defaultUnitFor('weight', unitWeight, unitLength),
            valueNumeric: 0,
        },
        resolver: zodResolver(measurementInputSchema),
    });

    const kind = form.watch('kind');

    useEffect(() => {
        form.setValue('unit', defaultUnitFor(kind, unitWeight, unitLength));
    }, [kind, unitWeight, unitLength, form]);

    const onSubmit = form.handleSubmit((values) => {
        onCreate({
            ...values,
            notes: values.notes?.trim() ? values.notes : null,
        });
        form.reset({
            kind: values.kind,
            notes: '',
            takenAt: new Date(),
            unit: values.unit,
            valueNumeric: 0,
        });
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                    Add measurement
                </CardTitle>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <FormField
                                control={form.control}
                                name="kind"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs text-muted-foreground">
                                            Kind
                                        </FormLabel>
                                        <Select
                                            onValueChange={field.onChange}
                                            value={field.value}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {MEASUREMENT_KIND_VALUES.map(
                                                    (k) => (
                                                        <SelectItem
                                                            key={k}
                                                            value={k}
                                                        >
                                                            <span className="capitalize">
                                                                {k.replaceAll(
                                                                    '_',
                                                                    ' ',
                                                                )}
                                                            </span>
                                                        </SelectItem>
                                                    ),
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="valueNumeric"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs text-muted-foreground">
                                            Value
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                inputMode="decimal"
                                                onChange={(event) => {
                                                    const n = Number(
                                                        event.target.value,
                                                    );
                                                    field.onChange(
                                                        Number.isFinite(n)
                                                            ? n
                                                            : 0,
                                                    );
                                                }}
                                                ref={field.ref}
                                                step="any"
                                                type="number"
                                                value={field.value}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="unit"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs text-muted-foreground">
                                            Unit
                                        </FormLabel>
                                        <Select
                                            onValueChange={field.onChange}
                                            value={field.value}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {MEASUREMENT_UNIT_VALUES.map(
                                                    (u) => (
                                                        <SelectItem
                                                            key={u}
                                                            value={u}
                                                        >
                                                            {u}
                                                        </SelectItem>
                                                    ),
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="takenAt"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs text-muted-foreground">
                                            When
                                        </FormLabel>
                                        <DatePicker
                                            className="w-full"
                                            maxDate={new Date()}
                                            onChange={(d) =>
                                                field.onChange(d ?? undefined)
                                            }
                                            value={field.value ?? undefined}
                                        />
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        <FormField
                            control={form.control}
                            name="notes"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs text-muted-foreground">
                                        Notes (optional)
                                    </FormLabel>
                                    <FormControl>
                                        <Textarea
                                            className="min-h-16 text-sm"
                                            placeholder="Anything notable about this measurement…"
                                            {...field}
                                            value={field.value ?? ''}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <Button
                            className="gap-2 self-start"
                            disabled={pending}
                            type="submit"
                        >
                            <Plus className="size-4" />
                            {pending ? 'Saving…' : 'Add'}
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}

function BodyStatsCards({ stats }: { stats: Stats }) {
    const deltaLabel =
        stats.weightDelta30d === null
            ? '-'
            : `${stats.weightDelta30d >= 0 ? '+' : ''}${stats.weightDelta30d.toFixed(1)}`;
    const deltaClass =
        stats.weightDelta30d === null
            ? 'text-muted-foreground'
            : stats.weightDelta30d > 0
              ? 'text-warning'
              : 'text-success';

    return (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Entries" value={stats.total.toString()} />
            <StatCard
                label="Latest weight"
                sub={
                    stats.weight
                        ? format(new Date(stats.weight.takenAt), 'MMM d')
                        : 'no entries'
                }
                value={
                    stats.weight
                        ? `${stats.weight.valueNumeric} ${stats.weight.unit}`
                        : '-'
                }
            />
            <StatCard
                label="Latest bodyfat"
                sub={
                    stats.bodyfat
                        ? format(new Date(stats.bodyfat.takenAt), 'MMM d')
                        : 'no entries'
                }
                value={
                    stats.bodyfat
                        ? `${stats.bodyfat.valueNumeric} ${stats.bodyfat.unit}`
                        : '-'
                }
            />
            <StatCard
                label="Weight 30-day"
                sub="vs 30 days ago"
                value={deltaLabel}
                valueClass={deltaClass}
            />
        </section>
    );
}

function defaultUnitFor(
    kind: MeasurementKind,
    unitWeight: UnitWeight,
    unitLength: UnitLength,
): MeasurementUnit {
    if (kind === 'bodyfat') return '%';
    return TAPE_KINDS.has(kind) ? unitLength : unitWeight;
}

function MeasurementsHistoryTable({
    headerActions,
    isLoading,
    onDelete,
    rows,
}: {
    headerActions?: DataTableSlot<MeasurementRow>;
    isLoading: boolean;
    onDelete: (id: string) => void;
    rows: MeasurementRow[];
}) {
    const columns = useMemo<DataTableColumn<MeasurementRow>[]>(
        () => [
            {
                accessorFn: (r) => r.kind,
                cell: ({ row }) => (
                    <span className="capitalize">
                        {row.original.kind.replaceAll('_', ' ')}
                    </span>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Kind',
                id: 'kind',
            },
            {
                accessorFn: (r) => r.valueNumeric,
                cell: ({ row }) => (
                    <span className="font-semibold tabular-nums">
                        {row.original.valueNumeric} {row.original.unit}
                    </span>
                ),
                header: 'Value',
                id: 'value',
            },
            {
                accessorFn: (r) => r.unit,
                filterFn: DataTableFilterFunction.Equals,
                header: 'Unit',
                id: 'unit',
            },
            {
                accessorFn: (r) => new Date(r.takenAt).getTime(),
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {format(new Date(row.original.takenAt), 'MMM d HH:mm')}
                    </span>
                ),
                filterFn: DataTableFilterFunction.InNumberRange,
                header: 'Logged',
                id: 'takenAt',
            },
            {
                accessorFn: (r) => r.notes ?? '',
                cell: ({ row }) =>
                    row.original.notes ? (
                        <span className="text-xs text-muted-foreground">
                            {row.original.notes}
                        </span>
                    ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                    ),
                header: 'Notes',
                id: 'notes',
            },
            {
                cell: ({ row }) => (
                    <AlertDialog>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        aria-label="Delete measurement"
                                        className="size-8 p-0"
                                        type="button"
                                        variant="ghost"
                                    >
                                        <Trash2 className="size-4 text-destructive" />
                                    </Button>
                                </AlertDialogTrigger>
                            </TooltipTrigger>
                            <TooltipContent>Delete measurement</TooltipContent>
                        </Tooltip>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    Delete measurement?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    {row.original.kind.replaceAll('_', ' ')}{' '}
                                    {row.original.valueNumeric}{' '}
                                    {row.original.unit} will be removed from
                                    your history.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() => onDelete(row.original.id)}
                                >
                                    Delete
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                ),
                header: () => <span className="sr-only">Actions</span>,
                id: 'actions',
            },
        ],
        [onDelete],
    );

    return (
        <DataTable<MeasurementRow>
            columns={columns}
            data={rows}
            emptyState={
                <EmptyState
                    description="Log your first measurement or widen the filters."
                    icon={Ruler}
                    title="Nothing logged"
                />
            }
            headerActions={headerActions}
            initialColumnVisibility={{ unit: false }}
            isLoading={isLoading}
            pageSize={25}
            rowId={(r) => r.id}
            showFilter
        />
    );
}

function MeasurementTrendChart({
    unitLength,
    unitWeight,
}: {
    unitLength: UnitLength;
    unitWeight: UnitWeight;
}) {
    const [chartKind, setChartKind] = useState<MeasurementKind>('weight');

    const trendData = api.lifting.measurement.list.useQuery({
        kind: chartKind,
    });

    const displayUnit = defaultUnitFor(chartKind, unitWeight, unitLength);

    const chartPoints = useMemo(
        () =>
            (trendData.data ?? [])
                .toReversed()
                .filter((r) =>
                    MeasurementUnitConversion.canDisplay(r.unit, displayUnit),
                )
                .map((r) => ({
                    date: format(new Date(r.takenAt), 'MMM d'),
                    value: MeasurementUnitConversion.toDisplay(
                        r.valueNumeric,
                        r.unit,
                        displayUnit,
                    ),
                })),
        [displayUnit, trendData.data],
    );

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                        <LineChart className="size-4" /> Trend
                    </CardTitle>
                    <ToolbarSelect
                        label="Trend measurement"
                        onValueChange={(v) => {
                            const kind = MEASUREMENT_KIND_VALUES.find(
                                (k) => k === v,
                            );
                            if (kind) setChartKind(kind);
                        }}
                        options={MEASUREMENT_KIND_VALUES.map((k) => ({
                            label: (
                                <span className="capitalize">
                                    {k.replaceAll('_', ' ')}
                                </span>
                            ),
                            value: k,
                        }))}
                        value={chartKind}
                    />
                </div>
            </CardHeader>
            <CardContent>
                {trendData.isLoading ? (
                    <Skeleton className="h-48 w-full rounded-md" />
                ) : chartPoints.length === 0 ? (
                    <EmptyState
                        description="Log a measurement to see the trend chart."
                        icon={LineChart}
                        title="No data yet"
                    />
                ) : (
                    <div className="h-48">
                        <AreaChartNew
                            area={{ dataKey: 'value' }}
                            config={TREND_CHART_CONFIG}
                            data={chartPoints}
                            tooltip={{ labelKey: 'date', nameKey: 'value' }}
                            xAxis={{ dataKey: 'date' }}
                            yAxis={{
                                tickFormatter: (v: number) =>
                                    `${v} ${displayUnit}`,
                            }}
                        />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function StatCard({
    label,
    sub,
    value,
    valueClass = 'text-foreground',
}: {
    label: string;
    sub?: string;
    value: string;
    valueClass?: string;
}) {
    return (
        <Card className="gap-1 py-3">
            <CardContent className="flex flex-col gap-1 px-3">
                <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                    {label}
                </span>
                <span
                    className={`font-mono text-lg leading-none font-bold tabular-nums ${valueClass}`}
                >
                    {value}
                </span>
                {sub && (
                    <span className="text-[10px] text-muted-foreground">
                        {sub}
                    </span>
                )}
            </CardContent>
        </Card>
    );
}

function useStats(rows: MeasurementRow[], unitWeight: UnitWeight): Stats {
    return useMemo(() => {
        const latestByKind = new Map<MeasurementKind, MeasurementRow>();
        for (const r of rows) {
            if (!latestByKind.has(r.kind)) {
                latestByKind.set(r.kind, r);
            }
        }
        const weight = latestByKind.get('weight');
        const bodyfat = latestByKind.get('bodyfat');

        const inDisplayUnit = (row: MeasurementRow): number =>
            MeasurementUnitConversion.toDisplay(
                row.valueNumeric,
                row.unit,
                unitWeight,
            );
        let weightDelta30d: null | number = null;
        if (
            weight &&
            MeasurementUnitConversion.canDisplay(weight.unit, unitWeight)
        ) {
            const cutoff = subDays(new Date(weight.takenAt), 30);
            const past = rows
                .filter(
                    (r) =>
                        r.kind === 'weight' &&
                        MeasurementUnitConversion.canDisplay(
                            r.unit,
                            unitWeight,
                        ),
                )
                .find((r) => new Date(r.takenAt) <= cutoff);
            if (past) {
                weightDelta30d = inDisplayUnit(weight) - inDisplayUnit(past);
            }
        }

        return { bodyfat, total: rows.length, weight, weightDelta30d };
    }, [rows, unitWeight]);
}
