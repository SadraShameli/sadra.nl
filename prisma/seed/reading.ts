import { type Prisma } from '@prisma/client';

export const readings: Prisma.ReadingCreateInput[] = [
    {
        value: 29.17,
        sensor: {
            connect: {
                id: 1,
            },
        },
        location: {
            connect: {
                id: 1,
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
                id: 2,
            },
        },
        location: {
            connect: {
                id: 1,
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
                id: 3,
            },
        },
        location: {
            connect: {
                id: 1,
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
                id: 4,
            },
        },
        location: {
            connect: {
                id: 1,
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
                id: 5,
            },
        },
        location: {
            connect: {
                id: 1,
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
                id: 6,
            },
        },
        location: {
            connect: {
                id: 1,
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
                id: 7,
            },
        },
        location: {
            connect: {
                id: 1,
            },
        },
        device: {
            connect: {
                id: 1,
            },
        },
    },
];
