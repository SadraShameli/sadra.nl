'use client';

import { type Location, type Sensor } from '@prisma/client';
import { useMemo, useState } from 'react';

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
import LocationIcon from '~/components/ui/Icons/Location';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/Tabs';
import { api } from '~/trpc/react';

type ReadingSectionProps = {
    sensors: Sensor[];
    locations: Location[];
};

export default function ReadingSection({
    locations,
    sensors,
}: ReadingSectionProps) {
    const [currentLocation, setCurrentLocation] = useState(locations[0]);
    const [currentSensor, setCurrentSensor] = useState(sensors[0]);
    const currentReadings = api.sensor.getSensorReadings.useQuery({
        location_id: currentLocation?.id.toString(),
        sensor_id: currentSensor?.id.toString(),
    });
    const currentReading = useMemo(
        () =>
            currentReadings.data?.data?.find(
                (reading) => reading.sensor.id == currentSensor?.id,
            ),
        [currentReadings.data?.data, currentSensor?.id],
    );

    return (
        <div className="mx-auto my-content w-full max-w-content">
            <SectionTitle text="Live readings" />
            <SectionDescription text="Ever been curious about the loudness, temperature, humidity, and air pressure at various locations in real time?" />

            <RevealAnimation>
                <Card>
                    <Tabs
                        defaultValue={sensors[0]?.name}
                        onValueChange={(name) => {
                            const sensor = sensors.find((s) => s.name == name);
                            setCurrentSensor(sensor);
                        }}
                    >
                        <div className="flex justify-between">
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
                                        <LocationIcon className="mr-1 size-5" />
                                        Locations
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-56">
                                    <DropdownMenuRadioGroup
                                        value={currentLocation?.name}
                                        onValueChange={(value) => {
                                            const location = locations.filter(
                                                (location) =>
                                                    location.name == value,
                                            )[0];
                                            setCurrentLocation(location);
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
                        {currentSensor && currentLocation ? (
                            <div className="mt-10">
                                {sensors.map((sensor, index) => {
                                    return (
                                        <TabsContent
                                            value={sensor.name}
                                            key={index}
                                        >
                                            <div className="grid min-h-[40rem] grid-rows-5 gap-5 font-semibold leading-none ">
                                                <div className="row-span-2 grid grid-cols-12 gap-5">
                                                    <div className="col-span-4 flex rounded-xl bg-muted p-5">
                                                        <span className="absolute">
                                                            Latest
                                                        </span>
                                                        <span className="m-auto whitespace-nowrap text-5xl">
                                                            {currentReading
                                                                ? `${currentReading.readings[0]?.[1]} ${sensor.unit}`
                                                                : null}
                                                        </span>
                                                    </div>
                                                    <div className="col-span-3 grid gap-5 rounded-xl">
                                                        <div className="flex rounded-xl bg-muted p-5">
                                                            <span className="absolute">
                                                                {
                                                                    currentReading?.period
                                                                }
                                                                h High
                                                            </span>
                                                            <span className="m-auto whitespace-nowrap text-2xl">
                                                                {
                                                                    currentReading?.highest
                                                                }{' '}
                                                                {sensor.unit}
                                                            </span>
                                                        </div>
                                                        <div className="flex rounded-xl bg-muted p-5">
                                                            <span className="absolute">
                                                                {
                                                                    currentReading?.period
                                                                }
                                                                h Low
                                                            </span>
                                                            <span className="m-auto whitespace-nowrap text-2xl">
                                                                {
                                                                    currentReading?.lowest
                                                                }{' '}
                                                                {sensor.unit}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <span className="col-span-5 rounded-xl bg-muted p-5">
                                                        Other Locations
                                                    </span>
                                                </div>
                                                <span className="row-span-3 rounded-xl bg-muted p-5">
                                                    Chart
                                                </span>
                                            </div>
                                        </TabsContent>
                                    );
                                })}
                            </div>
                        ) : null}
                    </Tabs>
                </Card>
            </RevealAnimation>
        </div>
    );
}
