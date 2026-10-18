'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { subDays } from 'date-fns';
import { LineChart, Plus, Ruler } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { FilterToolbar } from '~/components/FilterToolbar';
import { MissingValue } from '~/components/MissingValue';
import { deleteRowAction, rowActionsColumn } from '~/components/RowActionsMenu';
import { StatStrip } from '~/components/StatStrip';
import { ToolPanel } from '~/components/ToolPanel';
import { Button } from '~/components/ui/button';
import AreaChartNew from '~/components/ui/chart/area-chart-new';
import {
    DataTable,
    type DataTableColumn,
    DataTableFilterFunction,
    type DataTableSlot,
} from '~/components/ui/data-table';
import { DataTableDateRange } from '~/components/ui/data-table-date-range';
import { DataTableFacetSelect } from '~/components/ui/data-table-facet-select';
import { DatePicker } from '~/components/ui/date-picker';
import { EmptyState, NoMatchesState } from '~/components/ui/empty-state';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { Skeleton } from '~/components/ui/skeleton';
import { Textarea } from '~/components/ui/textarea';
import { ToolbarSelect } from '~/components/ui/toolbar-select';
import { formatDisplayDate, formatDisplayDateTime } from '~/lib/format';
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

            <BodyStatStrip isLoading={measurements.isLoading} stats={stats} />

            <MeasurementTrendChart
                unitLength={unitLength}
                unitWeight={unitWeight}
            />

            <ToolPanel contentClassName="flex flex-col gap-4" title="History">
                {!measurements.isLoading && rows.length === 0 ? (
                    <EmptyState
                        description="Log your first measurement above to start your history."
                        icon={Ruler}
                        title="No measurements yet"
                    />
                ) : (
                    <MeasurementsHistoryTable
                        headerActions={(table) => (
                            <>
                                <DataTableFacetSelect
                                    column={table.getColumn('kind')}
                                    format={(k) => (
                                        <span className="capitalize">
                                            {measurementKindName(k)}
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
                            </>
                        )}
                        isLoading={measurements.isLoading}
                        onDelete={(id) => remove.mutate({ id })}
                        rows={rows}
                    />
                )}
            </ToolPanel>
        </div>
    );
}

const TREND_CHART_CONFIG = {
    value: { color: 'var(--chart-1)', label: 'Value' },
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
    const formId = useId();

    const kind = useWatch({ control: form.control, name: 'kind' });

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
        <ToolPanel title="Add measurement">
            <form className="flex flex-col gap-3" onSubmit={onSubmit}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <Controller
                        control={form.control}
                        name="kind"
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel
                                    className="text-xs text-muted-foreground"
                                    htmlFor={`${formId}-kind`}
                                >
                                    Kind
                                </FieldLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                >
                                    <SelectTrigger
                                        aria-invalid={fieldState.invalid}
                                        id={`${formId}-kind`}
                                    >
                                        <SelectValue>
                                            <span className="capitalize">
                                                {measurementKindName(
                                                    field.value,
                                                )}
                                            </span>
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {MEASUREMENT_KIND_VALUES.map((k) => (
                                            <SelectItem key={k} value={k}>
                                                <span className="capitalize">
                                                    {measurementKindName(k)}
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FieldError errors={[fieldState.error]} />
                            </Field>
                        )}
                    />
                    <Controller
                        control={form.control}
                        name="valueNumeric"
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel
                                    className="text-xs text-muted-foreground"
                                    htmlFor={`${formId}-valueNumeric`}
                                >
                                    Value
                                </FieldLabel>
                                <Input
                                    aria-invalid={fieldState.invalid}
                                    id={`${formId}-valueNumeric`}
                                    inputMode="decimal"
                                    onChange={(event) => {
                                        const n = Number(event.target.value);
                                        field.onChange(
                                            Number.isFinite(n) ? n : 0,
                                        );
                                    }}
                                    ref={field.ref}
                                    step="any"
                                    type="number"
                                    value={field.value}
                                />
                                <FieldError errors={[fieldState.error]} />
                            </Field>
                        )}
                    />
                    <Controller
                        control={form.control}
                        name="unit"
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel
                                    className="text-xs text-muted-foreground"
                                    htmlFor={`${formId}-unit`}
                                >
                                    Unit
                                </FieldLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                >
                                    <SelectTrigger
                                        aria-invalid={fieldState.invalid}
                                        id={`${formId}-unit`}
                                    >
                                        <SelectValue>{field.value}</SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {MEASUREMENT_UNIT_VALUES.map((u) => (
                                            <SelectItem key={u} value={u}>
                                                {u}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FieldError errors={[fieldState.error]} />
                            </Field>
                        )}
                    />
                    <Controller
                        control={form.control}
                        name="takenAt"
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel
                                    className="text-xs text-muted-foreground"
                                    htmlFor={`${formId}-takenAt`}
                                >
                                    When
                                </FieldLabel>
                                <DatePicker
                                    className="w-full"
                                    id={`${formId}-takenAt`}
                                    maxDate={new Date()}
                                    onChange={(d) =>
                                        field.onChange(d ?? undefined)
                                    }
                                    value={field.value ?? undefined}
                                />
                                <FieldError errors={[fieldState.error]} />
                            </Field>
                        )}
                    />
                </div>
                <Controller
                    control={form.control}
                    name="notes"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel
                                className="text-xs text-muted-foreground"
                                htmlFor={`${formId}-notes`}
                            >
                                Notes (optional)
                            </FieldLabel>
                            <Textarea
                                aria-invalid={fieldState.invalid}
                                className="min-h-16 text-sm"
                                id={`${formId}-notes`}
                                placeholder="Anything notable about this measurement…"
                                {...field}
                                value={field.value ?? ''}
                            />
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
                <div className="flex justify-end">
                    <Button className="gap-2" disabled={pending} type="submit">
                        <Plus className="size-4" />
                        {pending ? 'Saving…' : 'Add measurement'}
                    </Button>
                </div>
            </form>
        </ToolPanel>
    );
}

function BodyStatStrip({
    isLoading,
    stats,
}: {
    isLoading: boolean;
    stats: Stats;
}) {
    const deltaLabel =
        stats.weightDelta30d === null ? (
            <MissingValue reason="Needs a weight logged at least 30 days before the latest one." />
        ) : (
            `${stats.weightDelta30d >= 0 ? '+' : ''}${stats.weightDelta30d.toFixed(1)}`
        );
    return (
        <StatStrip
            isLoading={isLoading}
            items={[
                {
                    id: 'entries',
                    label: 'Entries',
                    value: stats.total.toString(),
                },
                {
                    caption: stats.weight
                        ? formatDisplayDate(stats.weight.takenAt)
                        : undefined,
                    id: 'latest-weight',
                    label: 'Latest weight',
                    value: stats.weight ? (
                        `${stats.weight.valueNumeric} ${stats.weight.unit}`
                    ) : (
                        <MissingValue />
                    ),
                },
                {
                    caption: stats.bodyfat
                        ? formatDisplayDate(stats.bodyfat.takenAt)
                        : undefined,
                    id: 'latest-bodyfat',
                    label: 'Latest bodyfat',
                    value: stats.bodyfat ? (
                        `${stats.bodyfat.valueNumeric} ${stats.bodyfat.unit}`
                    ) : (
                        <MissingValue />
                    ),
                },
                {
                    caption: 'vs 30 days ago',
                    id: 'weight-30-day',
                    label: 'Weight 30-day',
                    value: deltaLabel,
                },
            ]}
        />
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

function measurementKindName(kind: string): string {
    return kind.replaceAll('_', ' ');
}

function measurementLabel(measurement: MeasurementRow): string {
    return `${measurementKindName(measurement.kind)} ${measurement.valueNumeric} ${measurement.unit}`;
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
                        {measurementKindName(row.original.kind)}
                    </span>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Kind',
                id: 'kind',
                meta: { isRowHeader: true },
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
                        {formatDisplayDateTime(row.original.takenAt)}
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
                        <MissingValue />
                    ),
                header: 'Notes',
                id: 'notes',
            },
            rowActionsColumn<MeasurementRow>({
                actionsOf: (measurement) => [
                    deleteRowAction({
                        description: `${measurementLabel(measurement)} will be removed from your history.`,
                        onDelete: () => onDelete(measurement.id),
                        title: 'Delete measurement?',
                    }),
                ],
                labelOf: measurementLabel,
            }),
        ],
        [onDelete],
    );

    return (
        <DataTable<MeasurementRow>
            columns={columns}
            data={rows}
            emptyState={<NoMatchesState icon={Ruler} noun="measurements" />}
            headerActions={headerActions}
            initialColumnVisibility={{ unit: false }}
            isLoading={isLoading}
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
                    date: formatDisplayDate(r.takenAt),
                    value: MeasurementUnitConversion.toDisplay(
                        r.valueNumeric,
                        r.unit,
                        displayUnit,
                    ),
                })),
        [displayUnit, trendData.data],
    );

    return (
        <ToolPanel title="Trend">
            <FilterToolbar label="Trend filters">
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
                                {measurementKindName(k)}
                            </span>
                        ),
                        value: k,
                    }))}
                    value={chartKind}
                />
            </FilterToolbar>
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
                            tickFormatter: (v: number) => `${v} ${displayUnit}`,
                        }}
                    />
                </div>
            )}
        </ToolPanel>
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
