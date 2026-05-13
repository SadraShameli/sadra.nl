const REDIRECT_DIGEST_PREFIX = 'NEXT_REDIRECT';

export function isRedirectError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const digest = (error as { digest?: unknown }).digest;
    return (
        typeof digest === 'string' && digest.startsWith(REDIRECT_DIGEST_PREFIX)
    );
}
