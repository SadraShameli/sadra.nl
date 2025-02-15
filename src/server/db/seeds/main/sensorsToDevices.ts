import { db } from '../..';
import { DatabaseSeeder } from '../../types';

import { sensorsToDevices } from '../../schemas/main';

export default class SeedSensorsToDevices extends DatabaseSeeder {
    async run() {
        await db.insert(sensorsToDevices).values([
            {
                device_id: 1,
                sensor_id: 1,
            },
            {
                device_id: 1,
                sensor_id: 2,
            },
            {
                device_id: 1,
                sensor_id: 3,
            },
            {
                device_id: 1,
                sensor_id: 4,
            },
            {
                device_id: 1,
                sensor_id: 5,
            },
            {
                device_id: 1,
                sensor_id: 6,
            },
            {
                device_id: 2,
                sensor_id: 7,
            },
            {
                device_id: 3,
                sensor_id: 1,
            },
            {
                device_id: 3,
                sensor_id: 2,
            },
            {
                device_id: 3,
                sensor_id: 3,
            },
            {
                device_id: 3,
                sensor_id: 4,
            },
            {
                device_id: 3,
                sensor_id: 5,
            },
            {
                device_id: 4,
                sensor_id: 1,
            },
            {
                device_id: 4,
                sensor_id: 2,
            },
            {
                device_id: 4,
                sensor_id: 3,
            },
            {
                device_id: 4,
                sensor_id: 4,
            },
            {
                device_id: 4,
                sensor_id: 5,
            },
            {
                device_id: 4,
                sensor_id: 6,
            },
            {
                device_id: 5,
                sensor_id: 1,
            },
            {
                device_id: 5,
                sensor_id: 2,
            },
            {
                device_id: 5,
                sensor_id: 3,
            },
            {
                device_id: 5,
                sensor_id: 4,
            },
            {
                device_id: 5,
                sensor_id: 5,
            },
            {
                device_id: 5,
                sensor_id: 6,
            },
            {
                device_id: 6,
                sensor_id: 1,
            },
            {
                device_id: 6,
                sensor_id: 2,
            },
            {
                device_id: 6,
                sensor_id: 3,
            },
            {
                device_id: 6,
                sensor_id: 4,
            },
            {
                device_id: 6,
                sensor_id: 5,
            },
            {
                device_id: 6,
                sensor_id: 6,
            },
        ]);
    }
}
