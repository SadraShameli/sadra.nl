import fs from 'fs';

import { db } from '../..';
import { DatabaseSeeder } from '../../types';

import { getRecordingFileName } from '~/server/api/routers/recording';
import { recording } from '../../schemas/main';

export default class SeedRecording extends DatabaseSeeder {
    async run() {
        await db.insert(recording).values([
            {
                device_id: 2,
                location_id: 1,
                file_name: getRecordingFileName(new Date()),
                file: Buffer.from(fs.readFileSync('src/assets/wav/1.wav')),
            },
            {
                device_id: 2,
                location_id: 1,
                file_name: getRecordingFileName(new Date()),
                file: Buffer.from(fs.readFileSync('src/assets/wav/2.wav')),
            },
            {
                device_id: 2,
                location_id: 1,
                file_name: getRecordingFileName(new Date()),
                file: Buffer.from(fs.readFileSync('src/assets/wav/3.wav')),
            },
            {
                device_id: 2,
                location_id: 1,
                file_name: getRecordingFileName(new Date()),
                file: Buffer.from(fs.readFileSync('src/assets/wav/4.wav')),
            },
        ]);
    }
}
