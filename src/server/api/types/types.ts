import { type device, type sensor } from '~/server/db/schema';

export type Result<DataType> = {
  data?: DataType;
  status?: number;
  error?: unknown;
};

export type GetDeviceProps = typeof device.$inferSelect & {
  sensors: number[];
};

export type ReadingRecord = {
  date: string;
  value: number;
  sensor_id: number;
};

export type GetReadingsRecord = {
  readings: ReadingRecord[];
  latestReading: ReadingRecord;
  sensor: typeof sensor.$inferSelect;
  highest: number;
  lowest: number;
  period: number;
};
