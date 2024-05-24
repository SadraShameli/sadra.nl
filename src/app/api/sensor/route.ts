import { NextResponse } from 'next/server';

import { api } from '~/trpc/server';

export async function GET() {
  const result = await api.sensor.getSensors();
  if (result.data) {
    return NextResponse.json(result.data, { status: result.status });
  }
  return NextResponse.json(result, { status: result.status });
}
