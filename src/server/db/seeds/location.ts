import { db } from '..';
import { location } from '../schema';

export default async function LocationSeed() {
    return await db.insert(location).values([
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
    ]);
}
