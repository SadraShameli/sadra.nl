import { type device, type sensor } from '~/server/db/schemas/main';

export type GetDeviceProps = typeof device.$inferSelect & {
    sensors: number[];
};

export interface GetReadingsRecord {
    highest: number;
    latestReading: ReadingRecord;
    lowest: number;
    period: number;
    readings: ReadingRecord[];
    sensor: typeof sensor.$inferSelect;
}

export interface ReadingRecord {
    date: string;
    value: number;
}

export interface Result<DataType> {
    data?: DataType;
    error?: unknown;
    status?: number;
}
