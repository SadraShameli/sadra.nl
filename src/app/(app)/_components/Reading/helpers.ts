type DataPoint = { date: string; value: number };

export type Granularity = 'raw' | 'hourly' | 'daily';

export const GRANULARITIES: { value: Granularity; label: string }[] = [
    { value: 'raw', label: 'Raw' },
    { value: 'hourly', label: 'Hourly avg' },
    { value: 'daily', label: 'Daily avg' },
];

function granularityKey(date: string, granularity: Granularity): string {
    const trimmed = date.trim();
    if (granularity === 'daily') {
        return trimmed.split(',')[0]?.trim() ?? trimmed;
    }
    const [dayMonth, time] = trimmed.split(', ');
    const hour = time?.split(':')[0] ?? '0';
    return `${dayMonth ?? ''}, ${hour}:00`;
}

export function aggregateReadings(
    readings: DataPoint[],
    granularity: Granularity,
): DataPoint[] {
    if (granularity === 'raw') return readings;

    const groups = new Map<string, number[]>();
    for (const r of readings) {
        const key = granularityKey(r.date, granularity);
        const bucket = groups.get(key) ?? [];
        bucket.push(r.value);
        groups.set(key, bucket);
    }

    return Array.from(groups.entries()).map(([date, values]) => ({
        date,
        value:
            Math.round(
                (values.reduce((sum, v) => sum + v, 0) / values.length) * 100,
            ) / 100,
    }));
}

function sanitizeSegment(s: string): string {
    return s
        .trim()
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_');
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
