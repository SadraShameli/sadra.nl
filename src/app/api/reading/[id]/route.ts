import { Prisma } from '@prisma/client';
import { type NextRequest, NextResponse } from 'next/server';

import { db } from '~/server/db';

interface RequestProps {
    id: string;
}

export async function GET(request: NextRequest, { params }: { params: RequestProps }) {
    try {
        const reading = await db.reading.findUniqueOrThrow({ where: { id: +params.id } });

        return NextResponse.json(reading);
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return NextResponse.json({ error: `Reading id ${params.id} not found` }, { status: 404 });
            }

            return NextResponse.json({ error: `Prisma returned error: ${e.code}` }, { status: 500 });
        }
    }
}
