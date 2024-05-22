import { type Prisma } from '@prisma/client';

export const sensors: Prisma.SensorCreateInput[] = [
    {
        name: 'Temperature',
        unit: 'C',
        enabled: true,
    },
    {
        name: 'Humidity',
        unit: '%',
        enabled: true,
    },
    {
        unit: 'hPa',
        name: 'Air Pressure',
        enabled: true,
    },
    {
        name: 'Gas Resistance',
        unit: 'Ohms',
        enabled: false,
    },
    {
        unit: 'm',
        name: 'Altitude',
        enabled: false,
    },
    {
        unit: 'dB',
        name: 'Loudness',
        enabled: true,
    },
    {
        unit: 'wav',
        name: 'Recording',
        enabled: false,
    },
    {
        unit: 'rpm/min',
        name: 'RPM',
        enabled: false,
    },
];
