import fs from 'fs';

import { type Prisma } from '@prisma/client';

import { getRecordingFileName } from '~/server/api/routers/recording';

export const recordings: Prisma.RecordingCreateInput[] = [
    {
        device: {
            connect: {
                id: 1,
            },
        },
        file: Buffer.from(fs.readFileSync('src/assets/wav/1.wav')),
        file_name: getRecordingFileName(new Date()),
    },
];
