import { db } from '../..';
import { location } from '../../schemas/main';
import { DatabaseSeeder } from '../../types';

export default class SeedLocation extends DatabaseSeeder {
    async run() {
        await db.insert(location).values([
            {
                location_id: 10_001,
                location_name: 'Test Location 1',
                name: 'Rijswijk',
            },
            {
                location_id: 10_002,
                location_name: 'Test Location 2',
                name: 'Rotterdam',
            },
            {
                location_id: 10_003,
                location_name: 'Test Location 3',
                name: 'Delft',
            },
            {
                location_id: 10_004,
                location_name: 'Test Location 4',
                name: 'Den Haag',
            },
            {
                location_id: 10_005,
                location_name: 'Test Location 5',
                name: 'Amsterdam',
            },
            {
                location_id: 10_006,
                location_name: 'Bitfactory',
                name: 'Rotterdam',
            },
        ]);
    }
}
