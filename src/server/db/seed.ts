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
      locationName: 'Test Location 1',
      locationId: 10001,
    },
    {
      name: 'Rotterdam',
      locationName: 'Test Location 2',
      locationId: 10002,
    },
    {
      name: 'Delft',
      locationName: 'Test Location 3',
      locationId: 10003,
    },
    {
      name: 'Den Haag',
      locationName: 'Test Location 4',
      locationId: 10004,
    },
    {
      name: 'Amsterdam',
      locationName: 'Test Location 5',
      locationId: 10005,
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
      deviceId: 20001,
      locationId: 1,
      registerInterval: 60,
      loudnessThreshold: 80,
    },
    {
      name: 'Test Device 2',
      deviceId: 20002,
      locationId: 1,
      registerInterval: 60,
      loudnessThreshold: 80,
    },
    {
      name: 'Test Device 3',
      deviceId: 20003,
      locationId: 2,
      registerInterval: 60,
      loudnessThreshold: 80,
    },
    {
      name: 'Test Device 4',
      deviceId: 20004,
      locationId: 3,
      registerInterval: 60,
      loudnessThreshold: 80,
    },
    {
      name: 'Test Device 5',
      deviceId: 20005,
      locationId: 4,
      registerInterval: 60,
      loudnessThreshold: 80,
    },
    {
      name: 'Test Device 6',
      deviceId: 20006,
      locationId: 5,
      registerInterval: 60,
      loudnessThreshold: 80,
    },
  ]);

  await db.insert(reading).values([
    {
      value: 29.17,
      sensorId: 1,
      deviceId: 1,
      locationId: 1,
    },
    {
      value: 57.64,
      sensorId: 2,
      deviceId: 1,
      locationId: 1,
    },
    {
      value: 1004.46,
      sensorId: 3,
      deviceId: 1,
      locationId: 1,
    },
    {
      value: 66.06,
      sensorId: 4,
      deviceId: 1,
      locationId: 1,
    },
    {
      value: 73.27,
      sensorId: 5,
      deviceId: 1,
      locationId: 1,
    },
    {
      value: 74,
      sensorId: 6,
      deviceId: 1,
      locationId: 1,
    },
    {
      value: 2731,
      sensorId: 8,
      deviceId: 1,
      locationId: 1,
    },
  ]);

  await db.insert(recording).values([
    {
      deviceId: 2,
      locationId: 1,
      file: Buffer.from(fs.readFileSync('src/assets/wav/1.wav')),
      fileName: getRecordingFileName(new Date()),
    },
    {
      deviceId: 2,
      locationId: 1,
      fileName: getRecordingFileName(new Date()),
      file: Buffer.from(fs.readFileSync('src/assets/wav/2.wav')),
    },
    {
      deviceId: 2,
      locationId: 1,
      fileName: getRecordingFileName(new Date()),
      file: Buffer.from(fs.readFileSync('src/assets/wav/3.wav')),
    },
    {
      deviceId: 2,
      locationId: 1,
      fileName: getRecordingFileName(new Date()),
      file: Buffer.from(fs.readFileSync('src/assets/wav/4.wav')),
    },
  ]);

  await db.insert(sensorsToDevices).values([
    {
      deviceId: 1,
      sensorId: 1,
    },
    {
      deviceId: 1,
      sensorId: 2,
    },
    {
      deviceId: 1,
      sensorId: 3,
    },
    {
      deviceId: 1,
      sensorId: 6,
    },
    {
      deviceId: 2,
      sensorId: 7,
    },
    {
      deviceId: 3,
      sensorId: 7,
    },
    {
      deviceId: 4,
      sensorId: 7,
    },
    {
      deviceId: 5,
      sensorId: 7,
    },
    {
      deviceId: 6,
      sensorId: 7,
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
