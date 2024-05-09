import { NextResponse, type NextRequest } from 'next/server';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface RequestProps {
    id: string;
}

export async function GET(request: NextRequest, { params }: { params: RequestProps }) {
    try {
        const sensor = await prisma.sensor.findUniqueOrThrow({ where: { id: +params.id } });

        return NextResponse.json(sensor);
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return NextResponse.json({ error: `Sensor id ${params.id} not found` }, { status: 400 });
            }

            return NextResponse.json({ error: `Prisma returned error: ${e.code}` }, { status: 500 });
        }
    }
}
