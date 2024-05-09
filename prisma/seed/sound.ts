import { type Prisma } from '@prisma/client';
import fs from 'fs';

export const sounds: Prisma.SoundRecordCreateInput[] = [
    {
        device: {
            connect: {
                id: 1,
            },
        },
        file: Buffer.from(fs.readFileSync('src/assets/wav/1.wav')),
    },
];
