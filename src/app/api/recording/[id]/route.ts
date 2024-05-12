import { Prisma } from '@prisma/client';
import { type NextRequest, NextResponse } from 'next/server';

import { db } from '~/server/db';

interface RequestProps {
    id: string;
}

export async function GET(request: NextRequest, { params }: { params: RequestProps }) {
    try {
        const recording = await db.recording.findUniqueOrThrow({ where: { id: +params.id } });

        return new Response(recording.file, { headers: { 'content-type': 'audio/wav' } });
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return NextResponse.json({ error: `Recording id ${params.id} not found` }, { status: 404 });
            }

            return NextResponse.json({ error: `Prisma returned error: ${e.code}` }, { status: 500 });
        }
    }
}

export async function POST(request: NextRequest, { params }: { params: RequestProps }) {
    try {
        if (!params?.id) {
            return NextResponse.json({ error: 'No device id provided' }, { status: 400 });
        }

        const device = await db.device.findUniqueOrThrow({ where: { device_id: +params.id } });

        const blob = await (await request.blob()).arrayBuffer();

        await db.recording.create({ data: { deviceId: device.id, file: Buffer.from(blob) } });

        return NextResponse.json(device, { status: 201 });
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return NextResponse.json({ error: `Device id ${params.id} not found` }, { status: 404 });
            }

            return NextResponse.json({ error: `Prisma returned error: ${e.code}` }, { status: 500 });
        }
    }
}
