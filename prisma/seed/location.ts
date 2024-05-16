import { type Prisma } from '@prisma/client';

export const locations: Prisma.LocationCreateInput[] = [
    {
        name: 'Rijswijk',
        location_name: 'Test Location',
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
];
