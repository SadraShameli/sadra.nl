import { Prisma } from '@prisma/client';

import { type getRecordingNoFile, type getRecordingsNoFile } from '~/server/api/routers/recording';

export const getRecordingsNoFileSelect = Prisma.validator<Prisma.RecordingSelect>()({
    id: true,
    createdAt: true,
    device_id: true,
    file_name: true,
});

export type getRecordingsNoFileReturn = Prisma.PromiseReturnType<typeof getRecordingsNoFile>;
export type getRecordingNoFileReturn = Prisma.PromiseReturnType<typeof getRecordingNoFile>;
