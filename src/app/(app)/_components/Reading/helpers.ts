export type Granularity = 'day' | 'hour' | 'month' | 'raw' | 'week';

type DataPoint = { date: string; value: number };

export const GRANULARITIES: { label: string; value: Granularity }[] = [
    { label: 'Raw', value: 'raw' },
    { label: 'Hourly', value: 'hour' },
    { label: 'Daily', value: 'day' },
    { label: 'Weekly', value: 'week' },
    { label: 'Monthly', value: 'month' },
];

export function exportReadingsToCSV(
    readings: DataPoint[],
    sensorName: string,
    sensorUnit: string,
    locationName: string | undefined,
): void {
    const header = ['date', 'value', 'unit', 'sensor', 'location'].join(',');
    const rows = readings.map((r) =>
        [
            `"${r.date.trim()}"`,
            r.value,
            sensorUnit,
            `"${sensorName}"`,
            `"${locationName ?? ''}"`,
        ].join(','),
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildFilename(locationName, sensorName);
    a.click();
    URL.revokeObjectURL(url);
}

function buildFilename(
    locationName: string | undefined,
    sensorName: string,
): string {
    const date = new Date();
    const datePart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const location = sanitizeSegment(locationName ?? 'all_locations');
    const sensor = sanitizeSegment(sensorName);
    return `readings_${location}_${sensor}_${datePart}.csv`;
}

function sanitizeSegment(s: string): string {
    return s
        .trim()
        .toLowerCase()
        .replaceAll(/[^\w\s-]/g, '')
        .replaceAll(/\s+/g, '_')
        .replaceAll(/_+/g, '_');
}
