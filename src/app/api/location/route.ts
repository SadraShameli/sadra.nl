import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
    const locations = await prisma.location.findMany();

    return NextResponse.json(locations);
}
