import fs from 'node:fs';

import { getRecordingFileName } from '~/server/api/routers/recording';

import { db } from '../..';
import { recording } from '../../schemas/main';
import { DatabaseSeeder } from '../../types';

export default class SeedRecording extends DatabaseSeeder {
    async run() {
        await db.insert(recording).values([
            {
                device_id: 2,
                file: Buffer.from(fs.readFileSync('src/assets/wav/1.wav')),
                file_name: getRecordingFileName(new Date()),
                location_id: 1,
            },
            {
                device_id: 2,
                file: Buffer.from(fs.readFileSync('src/assets/wav/2.wav')),
                file_name: getRecordingFileName(new Date()),
                location_id: 1,
            },
            {
                device_id: 2,
                file: Buffer.from(fs.readFileSync('src/assets/wav/3.wav')),
                file_name: getRecordingFileName(new Date()),
                location_id: 1,
            },
            {
                device_id: 2,
                file: Buffer.from(fs.readFileSync('src/assets/wav/4.wav')),
                file_name: getRecordingFileName(new Date()),
                location_id: 1,
            },
        ]);
    }
}
