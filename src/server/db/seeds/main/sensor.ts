import { db } from '../..';
import { DatabaseSeeder } from '../../types';

import { sensor } from '../../schemas/main';

export default class SeedSensor extends DatabaseSeeder {
    async run() {
        await db.insert(sensor).values([
            {
                name: 'Temperature',
                unit: '°C',
            },
            {
                name: 'Humidity',
                unit: '%',
            },
            {
                name: 'Air Pressure',
                unit: 'hPa',
            },
            {
                name: 'Gas Resistance',
                unit: 'Ohms',
            },
            {
                name: 'Altitude',
                unit: 'm',
            },
            {
                name: 'Loudness',
                unit: 'dB',
            },
            {
                name: 'Recording',
                unit: 'wav',
            },
            {
                name: 'RPM',
                unit: 'rpm',
            },
        ]);
    }
}
