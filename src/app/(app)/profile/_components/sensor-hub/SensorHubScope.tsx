'use client';

import { useState } from 'react';

import { FilterSelect } from '~/components/ui/FilterSelect';

export type SensorHubScope = {
    deviceId: number | undefined;
    locationId: number | undefined;
    sensorId: number | undefined;
};

export type SensorHubScopeController = {
    isActive: boolean;
    reset: () => void;
    scope: SensorHubScope;
    setDevice: (deviceId: number | undefined) => void;
    setLocation: (locationId: number | undefined) => void;
    setSensor: (sensorId: number | undefined) => void;
};

export type SensorHubScopeCounts = {
    device?: ReadonlyMap<number, number>;
    location?: ReadonlyMap<number, number>;
};

type ScopeDevice = { id: number; location_id: number; name: string };
type ScopeEntity = { id: number; name: string };

const EMPTY_SCOPE: SensorHubScope = {
    deviceId: undefined,
    locationId: undefined,
    sensorId: undefined,
};

export function SensorHubScopeFilters({
    controller,
    counts,
    devices,
    locations,
    sensors,
}: {
    controller: SensorHubScopeController;
    counts?: SensorHubScopeCounts;
    devices?: readonly ScopeDevice[];
    locations: readonly ScopeEntity[];
    sensors?: readonly ScopeEntity[];
}) {
    const { scope } = controller;
    const devicesInLocation = devices?.filter(
        (device) =>
            scope.locationId === undefined ||
            device.location_id === scope.locationId,
    );
    return (
        <>
            <FilterSelect
                label="Location"
                onValueChange={(value) => controller.setLocation(toId(value))}
                options={locations.map((location) => ({
                    count: counts?.location?.get(location.id),
                    label: location.name,
                    value: String(location.id),
                }))}
                placeholder="All locations"
                value={fromId(scope.locationId)}
            />
            {devicesInLocation !== undefined && (
                <FilterSelect
                    label="Device"
                    onValueChange={(value) => controller.setDevice(toId(value))}
                    options={devicesInLocation.map((device) => ({
                        count: counts?.device?.get(device.id),
                        label: device.name,
                        value: String(device.id),
                    }))}
                    placeholder="All devices"
                    value={fromId(scope.deviceId)}
                />
            )}
            {sensors !== undefined && (
                <FilterSelect
                    label="Sensor"
                    onValueChange={(value) => controller.setSensor(toId(value))}
                    options={sensors.map((sensor) => ({
                        label: sensor.name,
                        value: String(sensor.id),
                    }))}
                    placeholder="All sensors"
                    value={fromId(scope.sensorId)}
                />
            )}
        </>
    );
}

export function useSensorHubScope(): SensorHubScopeController {
    const [scope, setScope] = useState<SensorHubScope>(EMPTY_SCOPE);
    return {
        isActive:
            scope.deviceId !== undefined ||
            scope.locationId !== undefined ||
            scope.sensorId !== undefined,
        reset: () => setScope(EMPTY_SCOPE),
        scope,
        setDevice: (deviceId) =>
            setScope((previous) => ({ ...previous, deviceId })),
        setLocation: (locationId) =>
            setScope((previous) => ({
                ...previous,
                deviceId: undefined,
                locationId,
            })),
        setSensor: (sensorId) =>
            setScope((previous) => ({ ...previous, sensorId })),
    };
}

function fromId(id: number | undefined): string | undefined {
    return id === undefined ? undefined : String(id);
}

function toId(value: string | undefined): number | undefined {
    return value === undefined ? undefined : Number(value);
}
