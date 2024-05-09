/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { PrismaClient } from '@prisma/client';
import { sensors } from './seed/sensors';
import { devices } from './seed/devices';

const prisma = new PrismaClient();

async function main() {
    for (const sensor of sensors) {
        await prisma.sensor.create({
            data: sensor,
        });
    }

    for (const device of devices) {
        await prisma.device.create({
            data: device,
        });
    }
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
