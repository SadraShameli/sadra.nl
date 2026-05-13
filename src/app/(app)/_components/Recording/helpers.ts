import type { RecordingSummary } from './types';

export function ConvertSecondsToString(sec: number | undefined) {
    if (sec == undefined || Number.isNaN(sec) || !Number.isFinite(sec)) {
        return '0:00';
    }

    const m = Math.floor((sec % 3600) / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

export function GetRandom(min: number, max: number | undefined) {
    if (max === undefined || max < min) return min;

    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function GetRecordingURL(recording: RecordingSummary | undefined) {
    return recording ? `/api/recording/${recording.id}` : '';
}
