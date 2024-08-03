import { type getRecordingNoFile } from '~/server/api/routers/recording';

export function GetRandom(min: number, max: number | undefined) {
    if (!max) return 0;

    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function ConvertSecondsToString(sec: number | undefined) {
    if (sec == undefined || Number.isNaN(sec) || !Number.isFinite(sec)) {
        return '0:00';
    }

    const m = Math.floor((sec % 3600) / 60);
    const s = Math.round(sec % 60);
    const mS = m > 9 ? m : m || '0';
    const sS = s > 9 ? s : '0' + s;
    return `${mS}:${sS}`;
}

export function GetRecordingURL(recording: Awaited<ReturnType<typeof getRecordingNoFile>>) {
    return recording ? `/api/recording/${recording.id}` : '';
}
