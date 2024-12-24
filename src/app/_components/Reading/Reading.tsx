'use client';

import { keepPreviousData } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
    Calendar as CalendarIcon,
    AreaChart as ChartIcon,
    MapPin,
    ThermometerSnowflake,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';

import { cn } from '~/lib/utils';
import { type location, type sensor } from '~/server/db/schema';
import { api } from '~/trpc/react';

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

export default function ReadingSection() {
    const [date, setDate] = useState<DateRange>();
    const [currentLocation, setCurrentLocation] =
        useState<typeof location.$inferSelect>();

    const [oldSensors, setOldSensors] = useState<
        (typeof sensor.$inferSelect)[] | undefined
    >();
    const [currentSensor, setCurrentSensor] = useState<string>();

    const currentReading = api.reading.getReadingsInput.useQuery(
        currentLocation
            ? {
                  location_id: currentLocation.id,
                  date_from: date?.from,
                  date_to: date?.to,
              }
            : undefined,
        {
            placeholderData: keepPreviousData,
        },
    );
    const sensors = useMemo(
        () => currentReading.data?.data?.map((reading) => reading.sensor),
        [currentReading?.data],
    );
    const locations = api.location.getLocations.useQuery();

    useEffect(() => {
        if (oldSensors === undefined && sensors != undefined) {
            setOldSensors(sensors);
            setCurrentSensor(sensors[0]?.name);
        } else if (sensors?.length && oldSensors?.length) {
            setOldSensors(sensors);
            if (
                currentSensor &&
                !sensors.find((sensor) => sensor.name == currentSensor)
            ) {
                setCurrentSensor(sensors.at(-1)?.name);
            }
        }
    }, [currentSensor, oldSensors, sensors]);

    useEffect(() => {
        if (!currentLocation) {
            setCurrentLocation(locations.data?.data?.at(-1));
        }
    }, [currentLocation, locations]);

    return (
        <div className="pt-spacing-inner">
            <Card className="container flex min-h-[538.81px] flex-col">
                <Tabs
                    className="grid gap-y-5 my-spacing-inner lg:my-0"
                    defaultValue={sensors?.at(0)?.name}
                    value={currentSensor}
                    onValueChange={(value) => setCurrentSensor(value)}
                >
                    <div className="flex flex-wrap justify-between gap-5">
                        <div
                            className={cn(
                                'flex flex-col justify-between gap-y-5 lg:flex-row lg:gap-5',
                                !currentReading.data?.data && 'justify-end',
                            )}
                        >
                            <div className="grid gap-5 lg:grid-flow-col">
                                <div className="grid gap-2">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                className={cn(
                                                    'w-[300px] justify-start text-left font-normal',
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
                                            className="w-auto p-0"
                                            align="start"
                                        >
                                            <Calendar
                                                mode="range"
                                                defaultMonth={date?.from}
                                                selected={date}
                                                onSelect={setDate}
                                                numberOfMonths={2}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                <DropdownMenu>
                                    <DropdownMenuTrigger
                                        asChild
                                        disabled={!locations.data?.data}
                                    >
                                        <Button
                                            className="w-fit lg:ml-0"
                                            variant="outline"
                                        >
                                            <MapPin className="mr-1 size-5" />
                                            Locations
                                        </Button>
                                    </DropdownMenuTrigger>

                                    <DropdownMenuContent>
                                        <DropdownMenuRadioGroup
                                            value={
                                                currentLocation
                                                    ? currentLocation.location_name
                                                    : locations.data?.data?.at(
                                                          0,
                                                      )?.location_name
                                            }
                                            onValueChange={(value) => {
                                                const location =
                                                    locations.data?.data?.find(
                                                        (location) =>
                                                            location.location_name ===
                                                            value,
                                                    );
                                                setCurrentLocation(location);
                                            }}
                                        >
                                            {locations.data?.data?.map(
                                                (location, index) => {
                                                    return (
                                                        <DropdownMenuRadioItem
                                                            value={
                                                                location.location_name
                                                            }
                                                            key={index}
                                                        >
                                                            {
                                                                location.location_name
                                                            }
                                                        </DropdownMenuRadioItem>
                                                    );
                                                },
                                            )}
                                        </DropdownMenuRadioGroup>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>

                        {sensors && (
                            <TabsList className="w-fit">
                                {sensors?.map((sensor, index) => {
                                    return (
                                        <TabsTrigger
                                            value={sensor.name}
                                            key={index}
                                        >
                                            {sensor.name}
                                        </TabsTrigger>
                                    );
                                })}
                            </TabsList>
                        )}
                    </div>

                    {currentReading.data?.data?.map((reading, index) => {
                        return (
                            <TabsContent
                                className={cn(
                                    !currentReading.data?.data?.length &&
                                        'shimmer',
                                )}
                                value={reading.sensor.name}
                                key={index}
                            >
                                <div className="grid gap-5 text-sm font-semibold leading-none">
                                    <div className="grid gap-5 lg:grid-cols-2">
                                        <div
                                            className={cn(
                                                'rounded-xl border p-5',
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
                                                    data={reading.readings}
                                                    config={{
                                                        location: {
                                                            label: currentLocation?.location_name,
                                                        },
                                                        sensor: {
                                                            label: currentSensor,
                                                        },
                                                    }}
                                                    xAxis={{ dataKey: 'date' }}
                                                    yAxis={{
                                                        tickFormatter: (
                                                            value,
                                                        ) =>
                                                            `${value} ${sensors?.find((sensor) => sensor.name == currentSensor)?.unit}`,
                                                    }}
                                                    area={{ dataKey: 'value' }}
                                                    tooltip={{
                                                        labelKey: 'location',
                                                        nameKey: 'sensor',
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-5">
                                            <div
                                                className={cn(
                                                    'flex rounded-xl bg-muted p-5',
                                                    currentReading.isRefetching &&
                                                        'shimmer',
                                                )}
                                            >
                                                <div className="absolute flex items-center gap-x-2">
                                                    <ThermometerSnowflake />
                                                    Latest
                                                </div>

                                                <div className="m-auto whitespace-nowrap text-2xl lg:text-4xl">
                                                    {`${reading.latestReading.value} ${reading.sensor.unit}`}
                                                </div>
                                            </div>

                                            <div className="grid gap-5">
                                                <div
                                                    className={cn(
                                                        'flex min-h-36 rounded-xl bg-muted p-5',
                                                        currentReading.isRefetching &&
                                                            'shimmer',
                                                    )}
                                                >
                                                    <div className="absolute">{`${reading.period}h high`}</div>

                                                    <div className="m-auto whitespace-nowrap text-xl lg:text-3xl">
                                                        {`${reading.highest} ${reading.sensor.unit}`}
                                                    </div>
                                                </div>

                                                <div
                                                    className={cn(
                                                        'min-h-36 rounded-xl bg-muted p-5',
                                                        currentReading.isRefetching &&
                                                            'shimmer',
                                                    )}
                                                >
                                                    <div className="flex h-full">
                                                        <div className="absolute">{`${reading.period}h low`}</div>

                                                        <div className="m-auto whitespace-nowrap text-xl lg:text-3xl">
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
