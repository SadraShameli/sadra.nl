import { db } from '../..';
import { device } from '../../schemas/iot';
import { DatabaseSeeder } from '../../types';

export default class SeedDevice extends DatabaseSeeder {
    readonly name = 'iot:device';
    override readonly priority = 120;

    async run(): Promise<void> {
        await db
            .insert(device)
            .values([
                {
                    device_id: 20_001,
                    location_id: 1,
                    loudness_threshold: 70,
                    name: 'Test Device',
                    register_interval: 60,
                },
                {
                    device_id: 20_002,
                    location_id: 1,
                    loudness_threshold: 70,
                    name: 'Test Device 2',
                    register_interval: 60,
                },
                {
                    device_id: 20_003,
                    location_id: 2,
                    loudness_threshold: 70,
                    name: 'Test Device 3',
                    register_interval: 60,
                },
                {
                    device_id: 20_004,
                    location_id: 3,
                    loudness_threshold: 70,
                    name: 'Test Device 4',
                    register_interval: 60,
                },
                {
                    device_id: 20_005,
                    location_id: 4,
                    loudness_threshold: 70,
                    name: 'Test Device 5',
                    register_interval: 60,
                },
                {
                    device_id: 20_006,
                    location_id: 5,
                    loudness_threshold: 70,
                    name: 'Test Device 6',
                    register_interval: 60,
                },
                {
                    device_id: 20_007,
                    location_id: 5,
                    loudness_threshold: 70,
                    name: 'Bitfactory - Expedition',
                    register_interval: 60,
                },
            ])
            .onConflictDoNothing({ target: device.device_id });
    }
}
