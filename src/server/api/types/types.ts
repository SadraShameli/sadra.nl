import { type device, type sensor } from '~/server/db/schemas/main';

export interface Result<DataType> {
    data?: DataType;
    status?: number;
    error?: unknown;
}

export type GetDeviceProps = typeof device.$inferSelect & {
    sensors: number[];
};

export interface ReadingRecord {
    date: string;
    value: number;
}

export interface GetReadingsRecord {
    readings: ReadingRecord[];
    latestReading: ReadingRecord;
    sensor: typeof sensor.$inferSelect;
    highest: number;
    lowest: number;
    period: number;
}
