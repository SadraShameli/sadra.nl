import fs from 'fs';

import { type Prisma } from '@prisma/client';

import { getRecordingFileName } from '~/server/api/routers/recording';

export const recordings: Prisma.RecordingCreateInput[] = [
    {
        location: {
            connect: {
                id: 1,
            },
        },
        device: {
            connect: {
                id: 2,
            },
        },
        file: Buffer.from(fs.readFileSync('src/assets/wav/1.wav')),
        file_name: getRecordingFileName(new Date()),
    },
    {
        location: {
            connect: {
                id: 1,
            },
        },
        device: {
            connect: {
                id: 2,
            },
        },
        file: Buffer.from(fs.readFileSync('src/assets/wav/2.wav')),
        file_name: getRecordingFileName(new Date()),
    },
    {
        location: {
            connect: {
                id: 1,
            },
        },
        device: {
            connect: {
                id: 2,
            },
        },
        file: Buffer.from(fs.readFileSync('src/assets/wav/3.wav')),
        file_name: getRecordingFileName(new Date()),
    },
    {
        location: {
            connect: {
                id: 1,
            },
        },
        device: {
            connect: {
                id: 2,
            },
        },
        file: Buffer.from(fs.readFileSync('src/assets/wav/4.wav')),
        file_name: getRecordingFileName(new Date()),
    },
];
