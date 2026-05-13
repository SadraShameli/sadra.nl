import { db } from '../..';
import { reading } from '../../schemas/main';
import { DatabaseSeeder } from '../../types';

export default class SeedReading extends DatabaseSeeder {
    async run() {
        await db.insert(reading).values([
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
    }
}
