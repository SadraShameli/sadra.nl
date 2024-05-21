import { type Sensor } from '@prisma/client';

export type ReadingRecord = [string, number];

export type GetReadingsRecord = {
    readings: ReadingRecord[];
    latestReading: ReadingRecord;
    sensor: Sensor;
    highest: number;
    lowest: number;
    period: number;
};
