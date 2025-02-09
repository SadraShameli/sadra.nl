import { db } from '../..';
import { DatabaseSeeder } from '../../types';

import { location } from '../../schemas/main';

export default class SeedLocation extends DatabaseSeeder {
    async run() {
        await db.insert(location).values([
            {
                name: 'Rijswijk',
                location_name: 'Test Location 1',
                location_id: 10001,
            },
            {
                name: 'Rotterdam',
                location_name: 'Test Location 2',
                location_id: 10002,
            },
            {
                name: 'Delft',
                location_name: 'Test Location 3',
                location_id: 10003,
            },
            {
                name: 'Den Haag',
                location_name: 'Test Location 4',
                location_id: 10004,
            },
            {
                name: 'Amsterdam',
                location_name: 'Test Location 5',
                location_id: 10005,
            },
            {
                name: 'Rotterdam',
                location_name: 'Bitfactory',
                location_id: 10006,
            },
        ]);
    }
}
