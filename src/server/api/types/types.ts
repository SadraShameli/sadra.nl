import { type Location, type Reading, type Sensor } from '@prisma/client';

export type ReadingsRecord = [string, number][];

export type GetReadingsRecord = {
    readings: ReadingsRecord;
    highest: number;
    lowest: number;
    period: number;
};

export type GetReadingsLatest = {
    readings: Reading;
    highest: number;
    lowest: number;
    period: number;
};

export type GetSensorReadings = {
    sensor: Sensor;
} & GetReadingsRecord;
