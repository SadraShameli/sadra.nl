import type { RouterOutputs } from '~/trpc/react';

export type RecordingSummary =
    RouterOutputs['recording']['getRecordingsNoFile'][number];
