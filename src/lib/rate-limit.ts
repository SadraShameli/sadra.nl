type Bucket = {
    count: number;
    resetAt: number;
};

const buckets = new Map<string, Bucket>();

export async function checkRateLimit(args: {
    bucket: string;
    key: string;
    max: number;
    windowMs: number;
}): Promise<boolean> {
    const compoundKey = `${args.bucket}:${args.key.toLowerCase()}`;
    const now = Date.now();
    sweep(now);

    const entry = buckets.get(compoundKey);
    if (!entry || entry.resetAt <= now) {
        buckets.set(compoundKey, { count: 1, resetAt: now + args.windowMs });
        return true;
    }
    if (entry.count >= args.max) return false;
    entry.count += 1;
    return true;
}

function sweep(now: number): void {
    if (buckets.size < 1024) return;
    for (const [key, entry] of buckets) {
        if (entry.resetAt <= now) buckets.delete(key);
    }
}
