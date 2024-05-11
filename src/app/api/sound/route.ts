import { PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';

const prisma = new PrismaClient();

export async function GET() {
    const sounds = await prisma.soundRecord.findMany({ select: { id: true, createdAt: true, deviceId: true } });

    return NextResponse.json(sounds);
}
