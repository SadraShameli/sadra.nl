import { type Prisma } from '@prisma/client';

export const sensors: Prisma.SensorCreateInput[] = [
    {
        unit: 'C',
        type: { create: { name: 'Temperature' } },
    },
    {
        unit: '%',
        type: { create: { name: 'Humidity' } },
    },
    {
        unit: 'kOhms',
        type: { create: { name: 'GasResistance' } },
    },
    {
        unit: 'hPa',
        type: { create: { name: 'AirPressure' } },
    },
    {
        unit: 'm',
        type: { create: { name: 'Altitude' } },
    },
    {
        unit: 'dB',
        type: { create: { name: 'Loudness' } },
    },
    {
        unit: 'rpm/min',
        type: { create: { name: 'RPM' } },
    },
];
