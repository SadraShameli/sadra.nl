'use client';
import { type Location, type Sensor } from '@prisma/client';
import {
    AreaChart as ChartLIcon,
    Map,
    MapPin,
    ThermometerSnowflake,
} from 'lucide-react';
import { useEffect, useState } from 'react';

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/Tabs';
import { api } from '~/trpc/react';

type ReadingSectionProps = {
    sensors: Sensor[];
    locations: Location[];
    location: Location;
};

export default function ReadingSection({
    sensors,
    locations,
    location,
}: ReadingSectionProps) {
    const [currentLocation, setCurrentLocation] = useState(location);
    const currentReadingResponse = api.reading.getReadingsLatest.useQuery({
        location_id: currentLocation.id.toString(),
    });
    const [currentReading, setCurrentReading] = useState(
        currentReadingResponse.data?.data,
    );

    useEffect(() => {
        if (currentReadingResponse.data?.data) {
            setCurrentReading(currentReadingResponse.data.data);
        }
    }, [currentReadingResponse]);

    return (
        <div className="mx-auto my-content w-full max-w-content">
            <SectionTitle text="Live readings" />
            <SectionDescription text="Ever been curious about the loudness, temperature, humidity and air pressure at various locations in real time?" />

            <RevealAnimation>
                <Card>
                    <Tabs
                        className="grid gap-y-3"
                        defaultValue={sensors?.[0]?.name}
                    >
                        <div className="flex flex-col items-center justify-between gap-y-5 md:flex-row">
                            <TabsList>
                                {sensors.map((sensor, index) => {
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
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline">
                                        <MapPin className="mr-1 size-5" />
                                        Locations
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuRadioGroup
                                        value={currentLocation?.name}
                                        onValueChange={(value) => {
                                            const location = locations.find(
                                                (location) =>
                                                    location.name == value,
                                            );
                                            if (location) {
                                                setCurrentLocation(location);
                                            }
                                        }}
                                    >
                                        {locations.map((location, index) => {
                                            return (
                                                <DropdownMenuRadioItem
                                                    value={location.name}
                                                    key={index}
                                                >
                                                    {location.name}
                                                </DropdownMenuRadioItem>
                                            );
                                        })}
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                        {currentReading && (
                            <>
                                {currentReading.map((reading, index) => {
                                    return (
                                        <TabsContent
                                            className={
                                                currentReadingResponse.isLoading
                                                    ? 'shimmer'
                                                    : ''
                                            }
                                            value={reading.sensor.name}
                                            key={index}
                                        >
                                            <div className="grid-row-3 grid min-h-[40rem] gap-5 text-sm font-semibold leading-none">
                                                <div className="row-span-1 grid gap-5 md:grid-cols-2">
                                                    <div className="grid grid-cols-2 gap-5">
                                                        <div className="flex rounded-xl bg-muted p-5">
                                                            <div className="absolute flex items-center gap-x-2">
                                                                <ThermometerSnowflake />
                                                                Latest
                                                            </div>
                                                            <div className="m-auto whitespace-nowrap text-2xl lg:text-4xl">
                                                                {`${reading.readings[0]?.[1]} ${reading.sensor.unit}`}
                                                            </div>
                                                        </div>
                                                        <div className="grid min-h-72 gap-5 md:h-auto">
                                                            <div className="flex rounded-xl bg-muted p-5">
                                                                <div className="absolute">
                                                                    {`${reading.period}h high`}
                                                                </div>
                                                                <div className="m-auto whitespace-nowrap text-xl lg:text-2xl">
                                                                    {`${reading.highest} ${reading.sensor.unit}`}
                                                                </div>
                                                            </div>
                                                            <div className="rounded-xl bg-muted p-5">
                                                                <div className="flex h-full">
                                                                    <div className="absolute">
                                                                        {`${reading.period}h low`}
                                                                    </div>
                                                                    <div className="m-auto whitespace-nowrap text-xl lg:text-2xl">
                                                                        {`${reading.lowest} ${reading.sensor.unit}`}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="rounded-xl bg-muted p-5">
                                                        <div className="absolute flex items-center justify-between gap-x-2">
                                                            <Map />
                                                            Other locations
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="row-span-2 rounded-xl bg-muted p-5">
                                                    <div className="absolute flex items-center justify-between gap-x-2">
                                                        <ChartLIcon />
                                                        Live Chart
                                                    </div>
                                                </div>
                                            </div>
                                        </TabsContent>
                                    );
                                })}
                            </>
                        )}
                    </Tabs>
                </Card>
            </RevealAnimation>
        </div>
    );
}
