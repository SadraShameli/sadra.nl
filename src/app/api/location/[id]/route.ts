import { type NextRequest, NextResponse } from 'next/server';

import { api } from '~/trpc/server';

type RequestProps = {
    id: string;
};

export async function GET(request: NextRequest, { params }: { params: RequestProps }) {
    const result = await api.location.getLocation({ location_id: +params.id });
    if (result.data) {
        return NextResponse.json(result.data, { status: result.status });
    }
    return NextResponse.json(result, { status: result.status });
}
