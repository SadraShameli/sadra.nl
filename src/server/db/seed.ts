/* eslint-disable drizzle/enforce-delete-with-where */
import fs from 'fs';
import { EndDBConnection, db } from '.';
import {
  location,
  sensor,
  device,
  reading,
  recording,
  sensorsToDevices,
} from './schema';
import { getRecordingFileName } from '../api/routers/recording';

async function main() {
  console.log('Seeding database');

  await db.insert(location).values([
    {
      name: 'Rijswijk',
      location_name: 'Test Location 1',
      location_id: 10001,
    },
    {
      name: 'Rotterdam',
      location_name: 'Test Location 2',
      location_id: 10002,
    },
    {
      name: 'Delft',
      location_name: 'Test Location 3',
      location_id: 10003,
    },
    {
      name: 'Den Haag',
      location_name: 'Test Location 4',
      location_id: 10004,
    },
    {
      name: 'Amsterdam',
      location_name: 'Test Location 5',
      location_id: 10005,
    },
  ]);

  await db.insert(sensor).values([
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

  await db.insert(device).values([
    {
      name: 'Test Device',
      device_id: 20001,
      location_id: 1,
      register_interval: 60,
      loudness_threshold: 70,
    },
    {
      name: 'Test Device 2',
      device_id: 20002,
      location_id: 1,
      register_interval: 60,
      loudness_threshold: 70,
    },
    {
      name: 'Test Device 3',
      device_id: 20003,
      location_id: 2,
      register_interval: 60,
      loudness_threshold: 70,
    },
    {
      name: 'Test Device 4',
      device_id: 20004,
      location_id: 3,
      register_interval: 60,
      loudness_threshold: 70,
    },
    {
      name: 'Test Device 5',
      device_id: 20005,
      location_id: 4,
      register_interval: 60,
      loudness_threshold: 70,
    },
    {
      name: 'Test Device 6',
      device_id: 20006,
      location_id: 5,
      register_interval: 60,
      loudness_threshold: 70,
    },
  ]);

  await db.insert(reading).values([
    {
      value: 29.17,
      sensor_id: 1,
      device_id: 1,
      location_id: 1,
    },
    {
      value: 57.64,
      sensor_id: 2,
      device_id: 1,
      location_id: 1,
    },
    {
      value: 1004.46,
      sensor_id: 3,
      device_id: 1,
      location_id: 1,
    },
    {
      value: 66.06,
      sensor_id: 4,
      device_id: 1,
      location_id: 1,
    },
    {
      value: 73.27,
      sensor_id: 5,
      device_id: 1,
      location_id: 1,
    },
    {
      value: 74,
      sensor_id: 6,
      device_id: 1,
      location_id: 1,
    },
    {
      value: 2731,
      sensor_id: 8,
      device_id: 1,
      location_id: 1,
    },
  ]);

  await db.insert(recording).values([
    {
      device_id: 2,
      location_id: 1,
      file: Buffer.from(fs.readFileSync('src/assets/wav/1.wav')),
      file_name: getRecordingFileName(new Date()),
    },
    {
      device_id: 2,
      location_id: 1,
      file_name: getRecordingFileName(new Date()),
      file: Buffer.from(fs.readFileSync('src/assets/wav/2.wav')),
    },
    {
      device_id: 2,
      location_id: 1,
      file_name: getRecordingFileName(new Date()),
      file: Buffer.from(fs.readFileSync('src/assets/wav/3.wav')),
    },
    {
      device_id: 2,
      location_id: 1,
      file_name: getRecordingFileName(new Date()),
      file: Buffer.from(fs.readFileSync('src/assets/wav/4.wav')),
    },
  ]);

  await db.insert(sensorsToDevices).values([
    {
      device_id: 1,
      sensor_id: 1,
    },
    {
      device_id: 1,
      sensor_id: 2,
    },
    {
      device_id: 1,
      sensor_id: 3,
    },
    {
      device_id: 1,
      sensor_id: 6,
    },
    {
      device_id: 2,
      sensor_id: 7,
    },
    {
      device_id: 3,
      sensor_id: 7,
    },
    {
      device_id: 4,
      sensor_id: 7,
    },
    {
      device_id: 5,
      sensor_id: 7,
    },
    {
      device_id: 6,
      sensor_id: 7,
    },
  ]);
}

main()
  .then(() => {
    console.log('Seeding complete');
  })
  .catch((e) => {
    console.error(e);
  })
  .finally(() => {
    void (async () => {
      void (await EndDBConnection());
      process.exit(1);
    })();
  });
