import { eq } from 'drizzle-orm';

import { db } from '../..';
import { reading } from '../../schemas/iot';
import { DatabaseSeeder } from '../../types';

export default class SeedReading extends DatabaseSeeder {
    readonly name = 'iot:reading';
    override readonly priority = 140;

    async run(): Promise<void> {
        const [existing] = await db
            .select({ id: reading.id })
            .from(reading)
            .where(eq(reading.device_id, 1))
            .limit(1);
        if (existing) return;
        const q = db.insert(reading).values([
            {
                device_id: 1,
                location_id: 1,
                sensor_id: 1,
                value: 29.17,
            },
            {
                device_id: 1,
                location_id: 1,
                sensor_id: 2,
                value: 57.64,
            },
            {
                device_id: 1,
                location_id: 1,
                sensor_id: 3,
                value: 1004.46,
            },
            {
                device_id: 1,
                location_id: 1,
                sensor_id: 4,
                value: 66.06,
            },
            {
                device_id: 1,
                location_id: 1,
                sensor_id: 5,
                value: 73.27,
            },
            {
                device_id: 1,
                location_id: 1,
                sensor_id: 6,
                value: 74,
            },
            {
                device_id: 1,
                location_id: 1,
                sensor_id: 8,
                value: 2731,
            },
        ]);
        await q;
    }
}
