import { DeviceSeed } from './seeds/device';
import { LocationSeed } from './seeds/location';
import { ReadingSeed } from './seeds/reading';
import { RecordingSeed } from './seeds/recording';
import { SensorSeed } from './seeds/sensor';
import { SensorsToDevicesSeed } from './seeds/sensorsToDevices';

import { endDb } from '.';

async function main() {
  console.log('Seeding database');

  await Promise.all([
    LocationSeed(),
    SensorSeed(),
    DeviceSeed(),
    ReadingSeed(),
    RecordingSeed(),
    SensorsToDevicesSeed(),
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
      await endDb();
      process.exit(0);
    })();
  });
