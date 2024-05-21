import { type Sensor } from '@prisma/client';

export type ReadingsRecord = [string, number][];

export type GetReadingsRecord = {
    sensor: Sensor;
    readings: ReadingsRecord;
    highest: number;
    lowest: number;
    period: number;
};
