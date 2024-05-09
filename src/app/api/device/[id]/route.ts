import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '~/server/db';

interface RequestProps {
    id: string;
}

export async function GET(request: NextRequest, { params }: { params: RequestProps }) {
    try {
        const device = await db.device.findUniqueOrThrow({ where: { device_id: +params.id } });

        return NextResponse.json(device);
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return NextResponse.json({ error: `Device id ${params.id} not found` }, { status: 404 });
            }

            return NextResponse.json({ error: `Prisma returned error: ${e.code}` }, { status: 500 });
        }
    }
}
