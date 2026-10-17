import type { BetterAuthOptions } from 'better-auth';

const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const RATE_LIMIT_MAX_REQUESTS = 30;

export function authRateLimitOptions(enabled: boolean) {
    return {
        enabled,
        max: RATE_LIMIT_MAX_REQUESTS,
        storage: 'database',
        window: RATE_LIMIT_WINDOW_SECONDS,
    } satisfies BetterAuthOptions['rateLimit'];
}
