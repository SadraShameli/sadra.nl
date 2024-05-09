import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '~/server/db';

interface RequestProps {
    id: string;
}

export async function GET(request: NextRequest, { params }: { params: RequestProps }) {
    try {
        const sound = await db.soundRecord.findUniqueOrThrow({ where: { id: +params.id } });

        return new Response(sound.file, { headers: { 'content-type': 'audio/wav' } });
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return NextResponse.json({ error: `Sound id ${params.id} not found` }, { status: 404 });
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

        await db.soundRecord.create({ data: { deviceId: device.id, file: Buffer.from(blob) } });

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
