'use client';
import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { AreaChart as ChartLIcon, MapPin, ThermometerSnowflake } from 'lucide-react';

import { api } from '~/trpc/react';
import { cn } from '~/lib/utils';
import { type location, type sensor } from '~/server/db/schema';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/Tabs';
import SectionDescription from '~/components/SectionDescription';
import SectionTitle from '~/components/SectionTitle';
import RevealAnimation from '~/components/ui/Animations/Reveal';
import { Button } from '~/components/ui/Button';
import Card from '~/components/ui/Card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '~/components/ui/DropDown';
import AreaChartNew from './AreaChartNew';

import type { ReadingRecord } from '~/server/api/types/types';

export default function ReadingSection() {
    const locations = api.location.getLocations.useQuery();
    const [currentLocation, setCurrentLocation] = useState<typeof location.$inferSelect>();
    const currentReading = api.reading.getReadingsLatest.useQuery(
        currentLocation
            ? {
                  location_id: currentLocation.id,
              }
            : undefined,
        {
            placeholderData: keepPreviousData,
        },
    );

    const [oldSensors, setOldSensors] = useState<(typeof sensor.$inferSelect)[] | undefined>();
    const [currentSensor, setCurrentSensor] = useState<string>();
    const sensors = useMemo(() => currentReading.data?.data?.map((reading) => reading.sensor), [currentReading?.data]);

    useEffect(() => {
        if (oldSensors === undefined && sensors != undefined) {
            setOldSensors(sensors);
            setCurrentSensor(sensors[0]?.name);
        } else if (sensors?.length && oldSensors?.length) {
            setOldSensors(sensors);
            if (currentSensor && !sensors.find((sensor) => sensor.name == currentSensor)) {
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
        <div className="mx-auto my-content w-full max-w-content">
            <SectionTitle text="Live readings" />
            <SectionDescription text="Ever been curious about the temperature, humidity and loudness levels at various locations in real time?" />

            <RevealAnimation>
                <Card className="min-h-[538.81px]">
                    <Tabs
                        className="grid gap-y-3"
                        defaultValue={sensors?.at(0)?.name}
                        value={currentSensor}
                        onValueChange={(value) => setCurrentSensor(value)}
                    >
                        <div className="flex flex-col justify-between gap-y-5 md:flex-row md:gap-5">
                            {sensors && (
                                <TabsList className="w-fit">
                                    {sensors.map((sensor, index) => {
                                        return (
                                            <TabsTrigger value={sensor.name} key={index}>
                                                {sensor.name}
                                            </TabsTrigger>
                                        );
                                    })}
                                </TabsList>
                            )}

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button className="w-fit md:ml-0" variant="outline">
                                        <MapPin className="mr-1 size-5" />
                                        Locations
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuRadioGroup
                                        value={
                                            currentLocation ? currentLocation.name : locations.data?.data?.at(0)?.name
                                        }
                                        onValueChange={(value) => {
                                            const location = locations.data?.data?.find(
                                                (location) => location.name === value,
                                            );
                                            setCurrentLocation(location);
                                        }}
                                    >
                                        {locations.data?.data?.map((location, index) => {
                                            return (
                                                <DropdownMenuRadioItem value={location.name} key={index}>
                                                    {location.name}
                                                </DropdownMenuRadioItem>
                                            );
                                        })}
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {currentReading.data?.data?.map((reading, index) => {
                            return (
                                <TabsContent
                                    className={cn(!currentReading.data?.data?.length && 'shimmer')}
                                    value={reading.sensor.name}
                                    key={index}
                                >
                                    <div className="grid gap-5 text-sm font-semibold leading-none">
                                        <div className="grid gap-5 lg:grid-cols-2">
                                            <div className="grid grid-cols-2 gap-5">
                                                <div
                                                    className={cn([
                                                        'flex rounded-xl bg-muted p-5',
                                                        currentReading.isRefetching && 'shimmer',
                                                    ])}
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
                                                        className={cn([
                                                            'flex min-h-32 rounded-xl bg-muted p-5',
                                                            currentReading.isRefetching && 'shimmer',
                                                        ])}
                                                    >
                                                        <div className="absolute">{`${reading.period}h high`}</div>
                                                        <div className="m-auto whitespace-nowrap text-xl lg:text-3xl">
                                                            {`${reading.highest} ${reading.sensor.unit}`}
                                                        </div>
                                                    </div>
                                                    <div
                                                        className={cn([
                                                            'min-h-32 rounded-xl bg-muted p-5',
                                                            currentReading.isRefetching && 'shimmer',
                                                        ])}
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
                                            <div
                                                className={cn([
                                                    'rounded-xl border p-5',
                                                    currentReading.isRefetching && 'shimmer',
                                                ])}
                                            >
                                                <div className="absolute flex items-center gap-x-2 pb-5">
                                                    <ChartLIcon />
                                                    Live Chart
                                                </div>
                                                <div className="mt-12 grid">
                                                    {/* <ReadingAreaChart
                                                        xAxis={reading.readings.map((reading) => reading.date)}
                                                        yAxis={reading.readings.map((reading) => reading.value)}
                                                        yName={reading.sensor.name}
                                                    /> */}
                                                    <AreaChartNew
                                                        data={reading.readings}
                                                        config={{
                                                            location: {
                                                                label: currentLocation?.name,
                                                            },
                                                            sensor: {
                                                                label: currentSensor,
                                                            },
                                                        }}
                                                        xAxis={{ dataKey: 'date' as keyof ReadingRecord }}
                                                        yAxis={{
                                                            tickFormatter: (value) =>
                                                                `${value} ${sensors?.find((sensor) => sensor.name == currentSensor)?.unit}`,
                                                        }}
                                                        area={{ dataKey: 'value' }}
                                                        tooltip={{ labelKey: 'location', nameKey: 'sensor' }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>
                            );
                        })}
                    </Tabs>
                </Card>
            </RevealAnimation>
        </div>
    );
}
