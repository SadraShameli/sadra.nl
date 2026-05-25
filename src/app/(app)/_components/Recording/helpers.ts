import { apiRoutes } from '~/lib/site/routes';

import type { RecordingSummary } from './types';

export function GetRandom(min: number, max: number | undefined) {
    if (max === undefined || max < min) return min;

    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function GetRecordingURL(recording: RecordingSummary | undefined) {
    return recording ? apiRoutes.recording(recording.id) : '';
}
