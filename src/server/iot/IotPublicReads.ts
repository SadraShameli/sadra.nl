import 'server-only';
import { type inferRouterInputs } from '@trpc/server';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';

import { type AppRouter, createCaller } from '~/server/api/root';
import { db } from '~/server/db';

export enum IotCacheTag {
    Readings = 'iot-readings',
    Recordings = 'iot-recordings',
    Registry = 'iot-registry',
}

type IotInputs = inferRouterInputs<AppRouter>;

const IOT_CACHE_PROFILE = 'minutes';
const IOT_REVALIDATE_PROFILE = 'max';

export function markIotReadingsStale(): void {
    revalidateTag(IotCacheTag.Readings, IOT_REVALIDATE_PROFILE);
}

export function markIotRecordingsStale(): void {
    revalidateTag(IotCacheTag.Recordings, IOT_REVALIDATE_PROFILE);
}

export async function readPublicDevice(
    input: IotInputs['device']['getDevice'],
) {
    'use cache';
    cacheLife(IOT_CACHE_PROFILE);
    cacheTag(IotCacheTag.Registry);
    return publicCaller().device.getDevice(input);
}

export async function readPublicDeviceReadings(
    input: IotInputs['device']['getDeviceReadings'],
) {
    'use cache';
    cacheLife(IOT_CACHE_PROFILE);
    cacheTag(IotCacheTag.Registry, IotCacheTag.Readings);
    return publicCaller().device.getDeviceReadings(input);
}

export async function readPublicDeviceRecordings(
    input: IotInputs['device']['getDeviceRecordings'],
) {
    'use cache';
    cacheLife(IOT_CACHE_PROFILE);
    cacheTag(IotCacheTag.Registry, IotCacheTag.Recordings);
    return publicCaller().device.getDeviceRecordings(input);
}

export async function readPublicLocation(
    input: IotInputs['location']['getLocation'],
) {
    'use cache';
    cacheLife(IOT_CACHE_PROFILE);
    cacheTag(IotCacheTag.Registry);
    return publicCaller().location.getLocation(input);
}

export async function readPublicLocationDevices(
    input: IotInputs['location']['getLocationDevices'],
) {
    'use cache';
    cacheLife(IOT_CACHE_PROFILE);
    cacheTag(IotCacheTag.Registry);
    return publicCaller().location.getLocationDevices(input);
}

export async function readPublicLocationReadings(
    input: IotInputs['location']['getLocationReadings'],
) {
    'use cache';
    cacheLife(IOT_CACHE_PROFILE);
    cacheTag(IotCacheTag.Registry, IotCacheTag.Readings);
    return publicCaller().location.getLocationReadings(input);
}

export async function readPublicLocationRecordings(
    input: IotInputs['location']['getLocationRecordings'],
) {
    'use cache';
    cacheLife(IOT_CACHE_PROFILE);
    cacheTag(IotCacheTag.Registry, IotCacheTag.Recordings);
    return publicCaller().location.getLocationRecordings(input);
}

export async function readPublicLocations() {
    'use cache';
    cacheLife(IOT_CACHE_PROFILE);
    cacheTag(IotCacheTag.Registry);
    return publicCaller().location.getLocations();
}

export async function readPublicSensor(
    input: IotInputs['sensor']['getSensor'],
) {
    'use cache';
    cacheLife(IOT_CACHE_PROFILE);
    cacheTag(IotCacheTag.Registry);
    return publicCaller().sensor.getSensor(input);
}

export async function readPublicSensors() {
    'use cache';
    cacheLife(IOT_CACHE_PROFILE);
    cacheTag(IotCacheTag.Registry);
    return publicCaller().sensor.getSensors();
}

function publicCaller() {
    return createCaller({ db, headers: new Headers(), session: null });
}
