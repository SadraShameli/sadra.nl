import { NextResponse } from 'next/server';
import { db } from '~/server/db';

export async function GET() {
    const locations = await db.location.findMany();

    return NextResponse.json(locations);
}
