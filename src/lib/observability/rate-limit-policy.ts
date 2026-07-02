export interface RateLimitState {
    count: number;
    resetAt: Date;
}

export function evaluateRateLimit(
    existing: null | RateLimitState,
    now: Date,
    max: number,
    windowMs: number,
): { allowed: boolean; next: RateLimitState } {
    if (!existing || existing.resetAt <= now) {
        return {
            allowed: true,
            next: { count: 1, resetAt: new Date(now.getTime() + windowMs) },
        };
    }
    if (existing.count >= max) {
        return { allowed: false, next: existing };
    }
    return {
        allowed: true,
        next: { count: existing.count + 1, resetAt: existing.resetAt },
    };
}
