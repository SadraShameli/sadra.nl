import type { RouterOutputs } from '~/trpc/react';

export type RecordingSummary =
    RouterOutputs['recording']['getRecordingsNoFile'][number];

export const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];
