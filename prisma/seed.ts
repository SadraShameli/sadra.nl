import { db } from '~/server/db';

import { devices } from './seed/device';
import { locations } from './seed/location';
import { readings } from './seed/reading';
import { recordings } from './seed/recording';
import { sensors } from './seed/sensor';

async function main() {
    for (const sensor of sensors) {
        await db.sensor.create({
            data: sensor,
        });
    }

    for (const location of locations) {
        await db.location.create({
            data: location,
        });
    }

    for (const device of devices) {
        await db.device.create({
            data: device,
        });
    }

    for (const reading of readings) {
        await db.reading.create({
            data: reading,
        });
    }

    for (const recording of recordings) {
        await db.recording.create({
            data: recording,
        });
    }
}

main()
    .then(async () => {
        await db.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await db.$disconnect();
        process.exit(1);
    });
