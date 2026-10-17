import { z } from 'zod';

enum PostgresErrorCode {
    UniqueViolation = '23505',
}

const postgresErrorSchema = z.object({ code: z.string() });

const wrappedPostgresErrorSchema = z.object({ cause: postgresErrorSchema });

export function isUniqueViolation(error: unknown): boolean {
    return postgresErrorCodeOf(error) === PostgresErrorCode.UniqueViolation;
}

export async function retryOnUniqueViolation<T>(
    attempt: () => Promise<T>,
    maxAttempts = 3,
): Promise<T> {
    let lastError: unknown;
    for (let index = 0; index < maxAttempts; index++) {
        try {
            return await attempt();
        } catch (error) {
            lastError = error;
            if (!isUniqueViolation(error)) throw error;
        }
    }
    throw lastError;
}

function postgresErrorCodeOf(error: unknown): null | string {
    const direct = postgresErrorSchema.safeParse(error);
    if (direct.success) return direct.data.code;
    const wrapped = wrappedPostgresErrorSchema.safeParse(error);
    return wrapped.success ? wrapped.data.cause.code : null;
}
