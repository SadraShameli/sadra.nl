'use client';

import { keepPreviousData } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
    Calendar as CalendarIcon,
    AreaChart as ChartIcon,
    Download,
    MapPin,
    SlidersHorizontal,
    ThermometerSnowflake,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';

import RevealAnimation from '~/components/ui/Animations/Reveal';
import { Button } from '~/components/ui/Button';
import { Calendar } from '~/components/ui/Calendar';
import { Card } from '~/components/ui/Card';
import AreaChartNew from '~/components/ui/Chart/AreaChartNew';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '~/components/ui/DropDown';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/Popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/Tabs';
import { cn } from '~/lib/utils';
import { type location } from '~/server/db/schemas/main';
import { api } from '~/trpc/react';

import {
    aggregateReadings,
    exportReadingsToCSV,
    GRANULARITIES,
    type Granularity,
} from './helpers';

export default function ReadingSection() {
    const [date, setDate] = useState<DateRange>();
    const [currentLocation, setCurrentLocation] =
        useState<typeof location.$inferSelect>();
    const [currentSensor, setCurrentSensor] = useState<string>();
    const [granularity, setGranularity] = useState<Granularity>('raw');

    const currentReading = api.reading.getReadingsInput.useQuery(
        currentLocation
            ? {
                  date_from: date?.from,
                  date_to: date?.to,
                  location_id: currentLocation.id,
              }
            : undefined,
        { placeholderData: keepPreviousData },
    );

    const sensors = useMemo(
        () => currentReading.data?.data?.map((reading) => reading.sensor),
        [currentReading.data],
    );

    const locations = api.location.getLocations.useQuery();

    const currentSensorData = useMemo(
        () =>
            currentReading.data?.data?.find(
                (r) => r.sensor.name === currentSensor,
            ),
        [currentReading.data, currentSensor],
    );

    useEffect(() => {
        if (!sensors?.length) return;
        if (!currentSensor) {
            setCurrentSensor(sensors[0]?.name);
        } else if (!sensors.some((s) => s.name === currentSensor)) {
            setCurrentSensor(sensors.at(-1)?.name);
        }
    }, [sensors, currentSensor]);

    useEffect(() => {
        if (!currentLocation) {
            setCurrentLocation(locations.data?.data.at(-1));
        }
    }, [currentLocation, locations]);

    const currentGranularityLabel =
        GRANULARITIES.find((g) => g.value === granularity)?.label ?? 'Raw';

    return (
        <div className="pt-spacing-inner">
            <Card className="container flex min-h-[538.81px] flex-col">
                <Tabs
                    className="grid gap-y-5"
                    onValueChange={(value) => setCurrentSensor(value)}
                    value={currentSensor ?? ''}
                >
                    <div className="flex flex-wrap justify-between gap-5">
                        <div
                            className={cn(
                                'flex flex-col justify-between gap-y-5 lg:flex-row lg:gap-5',
                                !currentReading.data?.data && 'justify-end',
                            )}
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            className={cn(
                                                'w-75 justify-start text-left font-normal',
                                                !date &&
                                                    'text-muted-foreground',
                                            )}
                                            variant="outline"
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {date?.from ? (
                                                date.to ? (
                                                    <>
                                                        {format(
                                                            date.from,
                                                            'LLL dd, y',
                                                        )}{' '}
                                                        -{' '}
                                                        {format(
                                                            date.to,
                                                            'LLL dd, y',
                                                        )}
                                                    </>
                                                ) : (
                                                    format(
                                                        date.from,
                                                        'LLL dd, y',
                                                    )
                                                )
                                            ) : (
                                                <span>Pick a date</span>
                                            )}
                                        </Button>
                                    </PopoverTrigger>

                                    <PopoverContent
                                        align="start"
                                        className="mt-2 w-auto p-0"
                                    >
                                        <Calendar
                                            defaultMonth={date?.from}
                                            mode="range"
                                            numberOfMonths={2}
                                            onSelect={setDate}
                                            selected={date}
                                        />
                                    </PopoverContent>
                                </Popover>

                                <DropdownMenu>
                                    <DropdownMenuTrigger
                                        asChild
                                        disabled={!locations.data?.data}
                                    >
                                        <Button
                                            className="w-fit"
                                            variant="outline"
                                        >
                                            <MapPin className="mr-1 size-5" />
                                            Locations
                                        </Button>
                                    </DropdownMenuTrigger>

                                    <DropdownMenuContent>
                                        <DropdownMenuRadioGroup
                                            onValueChange={(value) => {
                                                const loc =
                                                    locations.data?.data.find(
                                                        (l) =>
                                                            l.location_name ===
                                                            value,
                                                    );
                                                setCurrentLocation(loc);
                                            }}
                                            value={
                                                currentLocation
                                                    ? currentLocation.location_name
                                                    : locations.data?.data.at(
                                                          -1,
                                                      )?.location_name
                                            }
                                        >
                                            {locations.data?.data.map((loc) => (
                                                <DropdownMenuRadioItem
                                                    key={loc.location_name}
                                                    value={loc.location_name}
                                                >
                                                    {loc.location_name}
                                                </DropdownMenuRadioItem>
                                            ))}
                                        </DropdownMenuRadioGroup>
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                <DropdownMenu>
                                    <DropdownMenuTrigger
                                        asChild
                                        disabled={!currentReading.data?.data}
                                    >
                                        <Button
                                            className="w-fit"
                                            variant="outline"
                                        >
                                            <SlidersHorizontal className="mr-1 size-4" />
                                            {currentGranularityLabel}
                                        </Button>
                                    </DropdownMenuTrigger>

                                    <DropdownMenuContent>
                                        <DropdownMenuRadioGroup
                                            onValueChange={(v) =>
                                                setGranularity(v as Granularity)
                                            }
                                            value={granularity}
                                        >
                                            {GRANULARITIES.map((g) => (
                                                <DropdownMenuRadioItem
                                                    key={g.value}
                                                    value={g.value}
                                                >
                                                    {g.label}
                                                </DropdownMenuRadioItem>
                                            ))}
                                        </DropdownMenuRadioGroup>
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                <Button
                                    className="w-fit"
                                    disabled={!currentSensorData}
                                    onClick={() => {
                                        if (!currentSensorData) return;
                                        exportReadingsToCSV(
                                            aggregateReadings(
                                                currentSensorData.readings,
                                                granularity,
                                            ),
                                            currentSensorData.sensor.name,
                                            currentSensorData.sensor.unit,
                                            currentLocation?.location_name,
                                        );
                                    }}
                                    variant="outline"
                                >
                                    <Download className="mr-1 size-4" />
                                    Export CSV
                                </Button>
                            </div>
                        </div>

                        {sensors && (
                            <TabsList className="w-fit">
                                {sensors.map((sensor) => (
                                    <TabsTrigger
                                        key={sensor.name}
                                        value={sensor.name}
                                    >
                                        {sensor.name}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        )}
                    </div>

                    {currentReading.data?.data?.map((reading) => {
                        const chartData = aggregateReadings(
                            reading.readings,
                            granularity,
                        );
                        return (
                            <TabsContent
                                key={reading.sensor.name}
                                value={reading.sensor.name}
                            >
                                <div className="grid gap-5 text-sm leading-none font-semibold">
                                    <div className="grid gap-5 lg:grid-cols-2">
                                        <div
                                            className={cn(
                                                'relative rounded-xl border p-5',
                                                currentReading.isRefetching &&
                                                    'shimmer',
                                            )}
                                        >
                                            <div className="absolute flex items-center gap-x-2 pb-5">
                                                <ChartIcon />
                                                Live Chart
                                            </div>

                                            <div className="mt-12 grid">
                                                <AreaChartNew
                                                    area={{ dataKey: 'value' }}
                                                    config={{
                                                        location: {
                                                            label: currentLocation?.location_name,
                                                        },
                                                        sensor: {
                                                            label: currentSensor,
                                                        },
                                                    }}
                                                    data={chartData}
                                                    tooltip={{
                                                        labelKey: 'location',
                                                        nameKey: 'sensor',
                                                    }}
                                                    xAxis={{ dataKey: 'date' }}
                                                    yAxis={{
                                                        tickFormatter: (
                                                            value: number,
                                                        ) =>
                                                            `${value} ${sensors?.find((s) => s.name === currentSensor)?.unit}`,
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-5">
                                            <div
                                                className={cn(
                                                    'relative flex rounded-xl bg-muted p-5',
                                                    currentReading.isRefetching &&
                                                        'shimmer',
                                                )}
                                            >
                                                <div className="absolute flex items-center gap-x-2">
                                                    <ThermometerSnowflake />
                                                    Latest
                                                </div>

                                                <div className="m-auto text-2xl whitespace-nowrap lg:text-4xl">
                                                    {`${reading.latestReading.value} ${reading.sensor.unit}`}
                                                </div>
                                            </div>

                                            <div className="grid gap-5">
                                                <div
                                                    className={cn(
                                                        'relative flex min-h-36 rounded-xl bg-muted p-5',
                                                        currentReading.isRefetching &&
                                                            'shimmer',
                                                    )}
                                                >
                                                    <div className="absolute">{`${reading.period}h high`}</div>

                                                    <div className="m-auto text-xl whitespace-nowrap lg:text-3xl">
                                                        {`${reading.highest} ${reading.sensor.unit}`}
                                                    </div>
                                                </div>

                                                <div
                                                    className={cn(
                                                        'relative min-h-36 rounded-xl bg-muted p-5',
                                                        currentReading.isRefetching &&
                                                            'shimmer',
                                                    )}
                                                >
                                                    <div className="flex h-full">
                                                        <div className="absolute">{`${reading.period}h low`}</div>

                                                        <div className="m-auto text-xl whitespace-nowrap lg:text-3xl">
                                                            {`${reading.lowest} ${reading.sensor.unit}`}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>
                        );
                    })}
                </Tabs>

                {!currentReading.data?.data && (
                    <div className="mx-auto my-auto flex">
                        {currentReading.isLoading ? (
                            <p>Fetching readings...</p>
                        ) : (
                            currentReading.isFetched && (
                                <RevealAnimation className="mx-auto my-auto">
                                    <p>
                                        No readings could be found. Try
                                        switching to another{' '}
                                        <strong className="underline decoration-dashed">
                                            location
                                        </strong>{' '}
                                        or a different{' '}
                                        <strong className="underline decoration-dashed">
                                            date range.
                                        </strong>
                                    </p>
                                </RevealAnimation>
                            )
                        )}
                    </div>
                )}
            </Card>
        </div>
    );
}
