import { type Prisma } from '@prisma/client';

export const readings: Prisma.ReadingCreateInput[] = [
    {
        value: 29.17,
        sensor: {
            connect: {
                type: 'Temperature',
            },
        },
        device: {
            connect: {
                id: 1,
            },
        },
    },
    {
        value: 57.64,
        sensor: {
            connect: {
                type: 'Humidity',
            },
        },
        device: {
            connect: {
                id: 1,
            },
        },
    },
    {
        value: 66.06,
        sensor: {
            connect: {
                type: 'GasResistance',
            },
        },
        device: {
            connect: {
                id: 1,
            },
        },
    },
    {
        value: 1004.46,
        sensor: {
            connect: {
                type: 'AirPressure',
            },
        },
        device: {
            connect: {
                id: 1,
            },
        },
    },
    {
        value: 73.27,
        sensor: {
            connect: {
                type: 'Altitude',
            },
        },
        device: {
            connect: {
                id: 1,
            },
        },
    },
    {
        value: 74,
        sensor: {
            connect: {
                type: 'Loudness',
            },
        },
        device: {
            connect: {
                id: 1,
            },
        },
    },
    {
        value: 2731,
        sensor: {
            connect: {
                type: 'RPM',
            },
        },
        device: {
            connect: {
                id: 1,
            },
        },
    },
];
