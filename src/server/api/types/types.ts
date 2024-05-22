import { type Sensor } from '@prisma/client';

export type ReadingRecord = {
    date: string;
    value: number;
    sensor_id: number;
};

export type GetReadingsRecord = {
    readings: ReadingRecord[];
    latestReading: ReadingRecord;
    sensor: Sensor;
    highest: number;
    lowest: number;
    period: number;
};
