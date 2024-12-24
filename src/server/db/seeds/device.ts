import { db } from '..';
import { device } from '../schema';
import { DatabaseSeeder } from '../types';

export default class DeviceSeed extends DatabaseSeeder {
    async run() {
        await db.insert(device).values([
            {
                name: 'Test Device',
                device_id: 20001,
                location_id: 1,
                register_interval: 60,
                loudness_threshold: 70,
            },
            {
                name: 'Test Device 2',
                device_id: 20002,
                location_id: 1,
                register_interval: 60,
                loudness_threshold: 70,
            },
            {
                name: 'Test Device 3',
                device_id: 20003,
                location_id: 2,
                register_interval: 60,
                loudness_threshold: 70,
            },
            {
                name: 'Test Device 4',
                device_id: 20004,
                location_id: 3,
                register_interval: 60,
                loudness_threshold: 70,
            },
            {
                name: 'Test Device 5',
                device_id: 20005,
                location_id: 4,
                register_interval: 60,
                loudness_threshold: 70,
            },
            {
                name: 'Test Device 6',
                device_id: 20006,
                location_id: 5,
                register_interval: 60,
                loudness_threshold: 70,
            },
            {
                name: 'Bitfactory - Expedition',
                device_id: 20007,
                location_id: 5,
                register_interval: 60,
                loudness_threshold: 70,
            },
        ]);
    }
}
