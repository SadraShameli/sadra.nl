import { z } from 'zod';

export function withFallback<TSchema extends z.ZodType>(
    schema: TSchema,
    fallback: z.output<TSchema>,
) {
    return z.union([schema, z.unknown().transform(() => fallback)]);
}
