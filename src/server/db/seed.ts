import { endDb } from '.';

import DeviceSeed from './seeds/device';
import LocationSeed from './seeds/location';
import ReadingSeed from './seeds/reading';
import RecordingSeed from './seeds/recording';
import SensorSeed from './seeds/sensor';
import SensorsToDevicesSeed from './seeds/sensorsToDevices';

async function main() {
  console.log('Seeding database');

  await LocationSeed();
  await SensorSeed();
  await DeviceSeed();
  await ReadingSeed();
  await RecordingSeed();
  await SensorsToDevicesSeed();
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
      await endDb();
      process.exit(0);
    })();
  });
