import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';

export const positiveIntIdSchema = z.coerce.number().int().positive();

export const idPathParamSchema = z.object({
    id: positiveIntIdSchema,
});

export const idSensorPathParamSchema = z.object({
    id: positiveIntIdSchema,
    sensor_id: positiveIntIdSchema,
});

export const MAX_RECORDING_BYTES = 25 * 1024 * 1024;

export const recordingBlobSchema = z
    .instanceof(Blob)
    .refine((blob) => blob.size > 0, { message: 'Empty recording payload' })
    .refine((blob) => blob.size <= MAX_RECORDING_BYTES, {
        message: `Recording exceeds ${MAX_RECORDING_BYTES} byte limit`,
    });

export function zodErrorResponse(error: ZodError): NextResponse {
    return NextResponse.json(
        { error: 'Invalid input', issues: error.issues },
        { status: 400 },
    );
}

export function parseRouteParams<T extends z.ZodTypeAny>(
    schema: T,
    input: unknown,
):
    | { data: z.infer<T>; response?: never }
    | { data?: never; response: NextResponse } {
    const result = schema.safeParse(input);
    if (result.success) return { data: result.data };
    return { response: zodErrorResponse(result.error) };
}
