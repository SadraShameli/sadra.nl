import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
    const sensors = await prisma.sensor.findMany();

    return NextResponse.json(sensors);
}
