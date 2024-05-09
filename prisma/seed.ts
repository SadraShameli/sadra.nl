import { db } from '~/server/db';
import { sensors } from './seed/sensors';
import { locations } from './seed/locations';
import { devices } from './seed/devices';
import { readings } from './seed/reading';
import { sounds } from './seed/sound';

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
        await db.readingRecord.create({
            data: reading,
        });
    }

    for (const sound of sounds) {
        await db.soundRecord.create({
            data: sound,
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
