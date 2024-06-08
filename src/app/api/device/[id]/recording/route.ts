import { type NextRequest, NextResponse } from 'next/server';

import { api } from '~/trpc/server';

interface RequestProps {
  id: string;
  sensor_id: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: RequestProps },
) {
  const result = await api.device.getDeviceRecordings({
    device: { device_id: +params.id },
    sensor_id: +params.sensor_id,
  });
  if (result.data) {
    return NextResponse.json(result.data, { status: result.status });
  }
  return NextResponse.json(result, { status: result.status });
}
