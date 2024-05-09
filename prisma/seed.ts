import { sensors } from './seed/sensors';
import { devices } from './seed/devices';
import { db } from '~/server/db';

async function main() {
    for (const sensor of sensors) {
        await db.sensor.create({
            data: sensor,
        });
    }

    for (const device of devices) {
        await db.device.create({
            data: device,
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
