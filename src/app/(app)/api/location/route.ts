import { NextResponse } from 'next/server';

import { readPublicLocations } from '~/server/iot/IotPublicReads';

export async function GET() {
    const result = await readPublicLocations();
    return NextResponse.json(result.data);
}
