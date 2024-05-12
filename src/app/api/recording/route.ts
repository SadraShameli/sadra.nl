import { PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';

const prisma = new PrismaClient();

export async function GET() {
    const recordings = await prisma.recording.findMany({ select: { id: true, createdAt: true, deviceId: true } });

    return NextResponse.json(recordings);
}
