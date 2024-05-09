import { type Prisma } from '@prisma/client';

export const devices: Prisma.DeviceCreateInput[] = [
    {
        name: 'Test Device',
        type: 'Sound',
        device_id: 20001,
        register_interval: 30,
        loudness_threshold: 70,
        location: { connect: { id: 1 } },
    },
    {
        name: 'Test Device 2',
        type: 'Sensor',
        device_id: 20002,
        register_interval: 30,
        loudness_threshold: 70,
        location: { connect: { id: 2 } },
    },
];
