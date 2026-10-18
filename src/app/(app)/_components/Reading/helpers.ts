import { type Granularity } from '~/lib/schemas/sensor';

export const DEFAULT_GRANULARITY: Granularity = 'hour';

export const SENSOR_READING_FRACTION_DIGITS = 3;

export const GRANULARITIES: { label: string; value: Granularity }[] = [
    { label: 'Raw', value: 'raw' },
    { label: 'Hourly', value: 'hour' },
    { label: 'Daily', value: 'day' },
    { label: 'Weekly', value: 'week' },
    { label: 'Monthly', value: 'month' },
];
