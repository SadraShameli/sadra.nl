import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
    const devices = await prisma.device.findMany();

    return NextResponse.json(devices);
}
