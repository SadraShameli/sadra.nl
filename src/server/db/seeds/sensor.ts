import { db } from '..';
import { sensor } from '../schema';

export default async function SensorSeed() {
  return await db.insert(sensor).values([
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
