interface PgError {
    code?: string;
}

export function isUniqueViolation(error: unknown): boolean {
    return (
        error !== null &&
        typeof error === 'object' &&
        (error as PgError).code === '23505'
    );
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
