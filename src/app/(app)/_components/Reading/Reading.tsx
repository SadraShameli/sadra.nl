'use client';

import { keepPreviousData, skipToken } from '@tanstack/react-query';
import { addDays } from 'date-fns';
import { AreaChart as ChartIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';

import type { location } from '~/server/db/schemas/iot';

import { StatStrip, StatStripSize } from '~/components/StatStrip';
import AreaChartNew from '~/components/ui/chart/area-chart-new';
import { timeAxisOf } from '~/components/ui/chart/time-axis';
import { ClearFiltersButton } from '~/components/ui/clear-filters-button';
import { EmptyState } from '~/components/ui/empty-state';
import { FilterDateRange } from '~/components/ui/filter-date-range';
import { FilterSelect } from '~/components/ui/filter-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { ToolbarSelect } from '~/components/ui/toolbar-select';
import { formatNumber } from '~/lib/format';
import {
    finestGranularityForRange,
    type Granularity,
    isReadingsSpanWithinCap,
    type PublicDevice,
    READINGS_SERIES_LONGEST_SPAN_MS,
} from '~/lib/schemas/sensor';
import { cn } from '~/lib/utilities';
import { api } from '~/trpc/react';

import {
    DEFAULT_GRANULARITY,
    GRANULARITIES,
    SENSOR_READING_FRACTION_DIGITS,
} from './helpers';
import { ReadingBodySkeleton } from './ReadingSkeleton';

export default function ReadingSection() {
    const [date, setDate] = useState<DateRange>();
    const [chosenLocation, setChosenLocation] =
        useState<typeof location.$inferSelect>();
    const [currentDevice, setCurrentDevice] = useState<PublicDevice>();
    const [chosenSensor, setChosenSensor] = useState<string>();
    const [granularity, setGranularity] =
        useState<Granularity>(DEFAULT_GRANULARITY);

    const locations = api.location.getLocations.useQuery();
    const defaultLocation = locations.data?.data.at(-1);
    const activeLocation = chosenLocation ?? defaultLocation;

    const currentReading = api.reading.getReadingsInput.useQuery(
        activeLocation
            ? {
                  date_from: date?.from,
                  date_to: date?.to,
                  device_id: currentDevice?.device_id,
                  granularity,
                  location_id: activeLocation.id,
              }
            : skipToken,
        { placeholderData: keepPreviousData },
    );

    const sensors = useMemo(
        () => currentReading.data?.data?.map((reading) => reading.sensor),
        [currentReading.data],
    );
    const activeSensor = sensors?.some((sensor) => sensor.name === chosenSensor)
        ? chosenSensor
        : sensors?.[0]?.name;

    const devices = api.location.getLocationDevices.useQuery(
        activeLocation
            ? { location_id: activeLocation.location_id }
            : skipToken,
    );

    const deviceList = useMemo(() => {
        const d = devices.data?.data;
        return Array.isArray(d) ? d : [];
    }, [devices.data]);

    const currentSensorData = useMemo(
        () =>
            currentReading.data?.data?.find(
                (r) => r.sensor.name === activeSensor,
            ),
        [currentReading.data, activeSensor],
    );

    const unit = currentSensorData?.sensor.unit;
    const hasFilters =
        date !== undefined ||
        currentDevice !== undefined ||
        granularity !== DEFAULT_GRANULARITY ||
        (chosenLocation !== undefined &&
            chosenLocation.id !== defaultLocation?.id);
    const resetFilters = () => {
        setDate(undefined);
        setCurrentDevice(undefined);
        setGranularity(DEFAULT_GRANULARITY);
        setChosenLocation(undefined);
    };

    return (
        <div
            className={cn(
                'app-reading',
                'overflow-hidden rounded-xl border border-line bg-surface-sunken',
            )}
        >
            <Tabs
                onValueChange={(value) =>
                    setChosenSensor(decodeURIComponent(value))
                }
                value={sensorTabValue(activeSensor ?? '')}
            >
                <div className="flex flex-wrap items-center gap-2.5 border-b border-line-faint p-4">
                    <ToolbarSelect
                        disabled={!locations.data?.data}
                        label="Location"
                        onValueChange={(value) => {
                            const loc = locations.data?.data.find(
                                (l) => l.location_name === value,
                            );
                            setChosenLocation(loc);
                            setCurrentDevice(undefined);
                        }}
                        options={(locations.data?.data ?? []).map((loc) => ({
                            label: loc.location_name,
                            value: loc.location_name,
                        }))}
                        value={activeLocation?.location_name ?? ''}
                    />

                    <FilterSelect
                        disabled={deviceList.length === 0}
                        label="Device"
                        onValueChange={(value) => {
                            setCurrentDevice(
                                value === undefined
                                    ? undefined
                                    : deviceList.find((x) => x.name === value),
                            );
                        }}
                        options={deviceList.map((d) => ({
                            label: d.name,
                            value: d.name,
                        }))}
                        placeholder="All devices"
                        value={currentDevice?.name}
                    />

                    <ToolbarSelect
                        disabled={!currentReading.data?.data}
                        label="Granularity"
                        onValueChange={(value) => {
                            const next = GRANULARITIES.find(
                                (g) => g.value === value,
                            );
                            if (next) setGranularity(next.value);
                        }}
                        options={GRANULARITIES.map((g) => ({
                            disabled: !isReadingsSpanWithinCap(
                                g.value,
                                date?.from,
                                date?.to,
                            ),
                            label: g.label,
                            value: g.value,
                        }))}
                        value={granularity}
                    />
                    <FilterDateRange
                        label="Reading date"
                        maxDate={new Date()}
                        minDate={addDays(
                            Date.now() - READINGS_SERIES_LONGEST_SPAN_MS,
                            1,
                        )}
                        onChange={(range) => {
                            setDate(range);
                            setGranularity((current) =>
                                isReadingsSpanWithinCap(
                                    current,
                                    range?.from,
                                    range?.to,
                                )
                                    ? current
                                    : (finestGranularityForRange(
                                          range?.from,
                                          range?.to,
                                      ) ?? current),
                            );
                        }}
                        placeholder="Pick a date"
                        value={date}
                    />

                    <ClearFiltersButton
                        active={hasFilters}
                        className="h-9"
                        onReset={resetFilters}
                    />
                </div>
                {sensors && (
                    <div className="border-b border-line-faint px-4 py-3">
                        <TabsList className="flex w-fit max-w-full scrollbar-none justify-start overflow-x-auto">
                            {sensors.map((sensor) => (
                                <TabsTrigger
                                    key={sensor.name}
                                    value={sensorTabValue(sensor.name)}
                                >
                                    {sensor.name}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </div>
                )}

                <div
                    className="shimmer"
                    data-loading={currentReading.isRefetching}
                >
                    {currentReading.data?.data?.map((reading) => (
                        <TabsContent
                            className="mt-0"
                            key={reading.sensor.name}
                            value={sensorTabValue(reading.sensor.name)}
                        >
                            <StatStrip
                                className="m-6 mb-0"
                                items={[
                                    {
                                        id: 'latest',
                                        label: 'Latest',
                                        value: (
                                            <ReadingFigure
                                                unit={reading.sensor.unit}
                                                value={
                                                    reading.latestReading.value
                                                }
                                            />
                                        ),
                                    },
                                    {
                                        id: 'high',
                                        label: `${reading.period_label} high`,
                                        value: (
                                            <ReadingFigure
                                                unit={reading.sensor.unit}
                                                value={reading.highest}
                                            />
                                        ),
                                    },
                                    {
                                        id: 'low',
                                        label: `${reading.period_label} low`,
                                        value: (
                                            <ReadingFigure
                                                unit={reading.sensor.unit}
                                                value={reading.lowest}
                                            />
                                        ),
                                    },
                                ]}
                                size={StatStripSize.Large}
                            />

                            <AreaChartNew
                                area={{
                                    dataKey: 'value',
                                }}
                                className={cn(
                                    'app-reading__chart',
                                    'm-6 w-auto',
                                )}
                                config={{
                                    location: {
                                        label: activeLocation?.location_name,
                                    },
                                    sensor: {
                                        label: activeSensor,
                                    },
                                }}
                                data={reading.readings}
                                tooltip={{
                                    labelKey: 'location',
                                    nameKey: 'sensor',
                                    valueFormatter: (value) =>
                                        `${formatNumber(value, SENSOR_READING_FRACTION_DIGITS)} ${reading.sensor.unit}`,
                                }}
                                xAxis={{
                                    dataKey: 'at',
                                    time:
                                        timeAxisOf(
                                            reading.readings.map(
                                                (point) => point.at,
                                            ),
                                        ) ?? undefined,
                                }}
                                yAxis={{
                                    tickFormatter: (value: number) =>
                                        `${value} ${unit ?? ''}`,
                                }}
                            />
                        </TabsContent>
                    ))}
                </div>
            </Tabs>

            {currentReading.data === undefined ? (
                <ReadingBodySkeleton />
            ) : currentReading.data.data ? null : (
                <div className="m-6 flex min-h-64 items-center justify-center rounded-md border border-line-faint chart-well">
                    <EmptyState
                        className="rounded-md bg-surface-sunken p-6 md:p-6"
                        description="Pick another location or a different date range."
                        icon={ChartIcon}
                        title={
                            <span className="type-display-item">
                                No readings for this selection yet
                            </span>
                        }
                    />
                </div>
            )}
        </div>
    );
}

function ReadingFigure({
    unit,
    value,
}: {
    readonly unit: string;
    readonly value: number;
}) {
    return (
        <>
            {value}
            <span className="text-2xl text-ink-muted italic"> {unit}</span>
        </>
    );
}

function sensorTabValue(name: string): string {
    return encodeURIComponent(name);
}
