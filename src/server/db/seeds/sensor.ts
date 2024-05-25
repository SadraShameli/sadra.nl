import { db } from '..';
import { sensor } from '../schema';

export async function SensorSeed() {
  return await db.insert(sensor).values([
    {
      name: 'Temperature',
      unit: '°C',
      enabled: true,
    },
    {
      name: 'Humidity',
      unit: '%',
      enabled: true,
    },
    {
      name: 'Air Pressure',
      unit: 'hPa',
      enabled: true,
    },
    {
      name: 'Gas Resistance',
      unit: 'Ohms',
      enabled: false,
    },
    {
      name: 'Altitude',
      unit: 'm',
      enabled: false,
    },
    {
      name: 'Loudness',
      unit: 'dB',
      enabled: true,
    },
    {
      name: 'Recording',
      unit: 'wav',
      enabled: false,
    },
    {
      name: 'RPM',
      unit: 'rpm/min',
      enabled: false,
    },
  ]);
}
