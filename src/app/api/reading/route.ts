import { Prisma, type ReadingRecord } from '@prisma/client';
import { type NextRequest, NextResponse } from 'next/server';

import { db } from '~/server/db';

interface RequestProps {
    device_id: string;
    sensors: Record<string, string>;
}

export async function GET() {
    const readings = await db.readingRecord.findMany();

    return NextResponse.json(readings);
}

export async function POST(request: NextRequest) {
    const body = (await request.json()) as RequestProps;

    if (!body.sensors || !Object.keys(body.sensors).length) {
        return NextResponse.json({ error: 'No sensor provided' }, { status: 400 });
    }

    try {
        const readings: ReadingRecord[] = [];

        for (const sensor in body.sensors) {
            const value = body.sensors[sensor];

            if (!value) {
                return NextResponse.json({ error: `No value provided for sensor ${sensor}` }, { status: 400 });
            }

            const device = await db.device.findFirstOrThrow({ where: { device_id: +body.device_id } });

            readings.push(await db.readingRecord.create({ data: { deviceId: device.id, sensorId: +sensor, value: +value } }));
        }

        return NextResponse.json(readings, { status: 201 });
    } catch (e) {
        console.log(e);
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return NextResponse.json({ error: `Device id ${body.device_id} not found` }, { status: 404 });
            }

            return NextResponse.json({ error: `Prisma returned error: ${e.code}` }, { status: 500 });
        }
    }
}
