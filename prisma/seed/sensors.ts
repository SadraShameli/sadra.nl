import { type Prisma } from '@prisma/client';

export const sensors: Prisma.SensorCreateInput[] = [
    {
        type: 'Temperature',
        unit: 'C',
        sensor_id: 1,
    },
    {
        type: 'Humidity',
        unit: '%',
        sensor_id: 2,
    },
    {
        type: 'GasResistance',
        unit: 'kOhms',
        sensor_id: 3,
    },
    {
        type: 'AirPressure',
        unit: 'hPa',
        sensor_id: 4,
    },
    {
        type: 'Altitude',
        unit: 'm',
        sensor_id: 5,
    },
    {
        type: 'Sound',
        unit: 'dB',
        sensor_id: 6,
    },
    {
        type: 'RPM',
        unit: 'rpm/min',
        sensor_id: 7,
    },
];
