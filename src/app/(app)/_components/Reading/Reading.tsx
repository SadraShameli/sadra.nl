'use client';

import { keepPreviousData, skipToken } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
    Calendar as CalendarIcon,
    AreaChart as ChartIcon,
    Cpu,
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
import { type device, type location } from '~/server/db/schemas/main';
import { api } from '~/trpc/react';

import {
    exportReadingsToCSV,
    GRANULARITIES,
    type Granularity,
} from './helpers';

export default function ReadingSection() {
    const [date, setDate] = useState<DateRange>();
    const [currentLocation, setCurrentLocation] =
        useState<typeof location.$inferSelect>();
    const [currentDevice, setCurrentDevice] =
        useState<typeof device.$inferSelect>();
    const [currentSensor, setCurrentSensor] = useState<string>();
    const [granularity, setGranularity] = useState<Granularity>('hour');

    const currentReading = api.reading.getReadingsInput.useQuery(
        currentLocation
            ? {
                  date_from: date?.from,
                  date_to: date?.to,
                  device_id: currentDevice?.device_id,
                  granularity,
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

    const devices = api.location.getLocationDevices.useQuery(
        currentLocation
            ? { location_id: currentLocation.location_id }
            : skipToken,
    );

    const deviceList = useMemo(() => {
        const d = devices.data?.data;
        return Array.isArray(d) ? d : [];
    }, [devices.data]);

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

    useEffect(() => {
        setCurrentDevice(undefined);
    }, [currentLocation]);

    const currentGranularityLabel =
        GRANULARITIES.find((g) => g.value === granularity)?.label ?? 'Raw';

    return (
        <div className={cn('app-reading', 'pt-spacing-inner')}>
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
                                                'app-reading__date-picker',
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
                                            className={cn(
                                                'app-reading__location-picker',
                                                'w-fit',
                                            )}
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
                                        disabled={deviceList.length === 0}
                                    >
                                        <Button
                                            className={cn(
                                                'app-reading__device-picker',
                                                'w-fit',
                                            )}
                                            variant="outline"
                                        >
                                            <Cpu className="mr-1 size-5" />
                                            {currentDevice?.name ??
                                                'All devices'}
                                        </Button>
                                    </DropdownMenuTrigger>

                                    <DropdownMenuContent>
                                        <DropdownMenuRadioGroup
                                            onValueChange={(value) => {
                                                if (value === '__all__') {
                                                    setCurrentDevice(undefined);
                                                    return;
                                                }
                                                const d = deviceList.find(
                                                    (x) => x.name === value,
                                                );
                                                setCurrentDevice(d);
                                            }}
                                            value={
                                                currentDevice?.name ?? '__all__'
                                            }
                                        >
                                            <DropdownMenuRadioItem value="__all__">
                                                All devices
                                            </DropdownMenuRadioItem>
                                            {deviceList.map((d) => (
                                                <DropdownMenuRadioItem
                                                    key={d.device_id}
                                                    value={d.name}
                                                >
                                                    {d.name}
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
                                            className={cn(
                                                'app-reading__granularity-picker',
                                                'w-fit',
                                            )}
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
                                    className={cn(
                                        'app-reading__export',
                                        'w-fit',
                                    )}
                                    disabled={!currentSensorData}
                                    onClick={() => {
                                        if (!currentSensorData) return;
                                        exportReadingsToCSV(
                                            currentSensorData.readings,
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
                        const chartData = reading.readings;
                        return (
                            <TabsContent
                                key={reading.sensor.name}
                                value={reading.sensor.name}
                            >
                                <div className="grid gap-5 text-sm leading-none font-semibold">
                                    <div className="grid gap-5 lg:grid-cols-2">
                                        <div
                                            className={cn(
                                                'app-reading__chart',
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
                                                    'app-reading__latest',
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
                                                        'app-reading__period-high',
                                                        'relative flex min-h-36 rounded-xl bg-muted p-5',
                                                        currentReading.isRefetching &&
                                                            'shimmer',
                                                    )}
                                                >
                                                    <div className="absolute">{`${reading.period_label} high`}</div>

                                                    <div className="m-auto text-xl whitespace-nowrap lg:text-3xl">
                                                        {`${reading.highest} ${reading.sensor.unit}`}
                                                    </div>
                                                </div>

                                                <div
                                                    className={cn(
                                                        'app-reading__period-low',
                                                        'relative min-h-36 rounded-xl bg-muted p-5',
                                                        currentReading.isRefetching &&
                                                            'shimmer',
                                                    )}
                                                >
                                                    <div className="flex h-full">
                                                        <div className="absolute">{`${reading.period_label} low`}</div>

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
