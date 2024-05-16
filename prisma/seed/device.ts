import { type Prisma } from '@prisma/client';

export const devices: Prisma.DeviceCreateInput[] = [
    {
        name: 'Test Device',
        register_interval: 30,
        loudness_threshold: 70,
        device_id: 20001,
        sensors: [6],
        type: {
            create: {
                name: 'Recording',
            },
        },
        location: { connect: { id: 1 } },
    },
    {
        name: 'Test Device 2',
        register_interval: 30,
        loudness_threshold: 70,
        device_id: 20002,
        sensors: [1, 2, 3, 4, 5, 6],
        type: {
            create: {
                name: 'Reading',
            },
        },
        location: { connect: { id: 1 } },
    },
    {
        name: 'Test Device 3',
        register_interval: 30,
        loudness_threshold: 70,
        device_id: 20003,
        sensors: [6],
        type: {
            connect: {
                id: 1,
            },
        },
        location: { connect: { id: 2 } },
    },
    {
        name: 'Test Device 4',
        register_interval: 30,
        loudness_threshold: 70,
        device_id: 20004,
        sensors: [6],
        type: {
            connect: {
                id: 1,
            },
        },
        location: { connect: { id: 3 } },
    },
    {
        name: 'Test Device 5',
        register_interval: 30,
        loudness_threshold: 70,
        device_id: 20005,
        sensors: [1, 2, 3, 4, 5, 6],
        type: {
            connect: {
                id: 2,
            },
        },
        location: { connect: { id: 4 } },
    },
    {
        name: 'Test Device 6',
        register_interval: 30,
        loudness_threshold: 70,
        device_id: 20006,
        sensors: [1, 2, 3, 4, 5, 6],
        type: {
            connect: {
                id: 2,
            },
        },
        location: { connect: { id: 5 } },
    },
];
