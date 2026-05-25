import { format } from 'date-fns';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';

import { db } from '../..';
import { recording } from '../../schemas/iot';
import { DatabaseSeeder } from '../../types';

export default class SeedRecording extends DatabaseSeeder {
    readonly name = 'iot:recording';
    override readonly priority = 150;

    async run(): Promise<void> {
        const [existing] = await db
            .select({ id: recording.id })
            .from(recording)
            .where(eq(recording.device_id, 2))
            .limit(1);
        if (existing) return;
        await db.insert(recording).values([
            {
                device_id: 2,
                file: Buffer.from(fs.readFileSync('src/assets/wav/1.wav')),
                file_name: recordingFileName(new Date()),
                location_id: 1,
            },
            {
                device_id: 2,
                file: Buffer.from(fs.readFileSync('src/assets/wav/2.wav')),
                file_name: recordingFileName(new Date()),
                location_id: 1,
            },
            {
                device_id: 2,
                file: Buffer.from(fs.readFileSync('src/assets/wav/3.wav')),
                file_name: recordingFileName(new Date()),
                location_id: 1,
            },
            {
                device_id: 2,
                file: Buffer.from(fs.readFileSync('src/assets/wav/4.wav')),
                file_name: recordingFileName(new Date()),
                location_id: 1,
            },
        ]);
    }
}

function recordingFileName(date: Date): string {
    return `${format(date, 'MMM d, y - HH.mm')}.wav`;
}
