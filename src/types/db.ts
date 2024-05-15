import { Prisma } from '@prisma/client';

export const getRecordingsNoFileSelect = Prisma.validator<Prisma.RecordingSelect>()({
    id: true,
    createdAt: true,
    deviceId: true,
    file_name: true,
});
