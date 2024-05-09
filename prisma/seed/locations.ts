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
];
