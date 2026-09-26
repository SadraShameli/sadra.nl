import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isWithinRateLimit } from '~/lib/observability/rate-limit';

import {
    type FakeRow,
    insertedColumnValues,
    type IssuedQuery,
} from '../../server/fakeDatabase';

type SqlValue = boolean | Date | number | string;

interface StoredBucket {
    count: number;
    resetAt: Date;
}

const buckets = vi.hoisted(() => new Map<string, StoredBucket>());

vi.mock('~/server/db', async () => {
    const { rateLimitBucket } =
        await import('~/server/db/schemas/observability');
    const { createFakeDatabase } = await import('../../server/fakeDatabase');
    return { db: createFakeDatabase(respond).database, rateLimitBucket };
});

const TABLE = 'sadranl_rate_limit_bucket';
const WINDOW_MS = 60_000;
const TOKEN =
    /\s*(\$\d+|\d+|<=|[(),+]|excluded\."?\w+"?|"\w+"(?:\."\w+")?|\w+)/y;

function bucketKey(bucket: unknown, key: unknown): string {
    return `${String(bucket)}|${String(key)}`;
}

function evaluate(
    text: string,
    context: {
        excluded: StoredBucket;
        params: unknown[];
        stored: StoredBucket;
    },
): SqlValue {
    const tokens: string[] = [];
    TOKEN.lastIndex = 0;
    while (TOKEN.lastIndex < text.trim().length) {
        const match = TOKEN.exec(text.trim());
        if (match?.[1] === undefined) throw new Error(`cannot read ${text}`);
        tokens.push(match[1]);
    }
    let index = 0;
    const next = (): string => tokens[index++] ?? '';
    const expect_ = (token: string): void => {
        const actual = next();
        if (actual.toLowerCase() !== token) {
            throw new Error(`expected ${token}, got ${actual} in ${text}`);
        }
    };
    const column = (name: string, row: StoredBucket): SqlValue => {
        if (name === 'count') return row.count;
        if (name === 'reset_at') return row.resetAt;
        throw new Error(`unknown column ${name}`);
    };
    const primary = (): SqlValue => {
        const token = next();
        const lower = token.toLowerCase();
        if (token === '(') {
            const value = comparison();
            expect_(')');
            return value;
        }
        if (token.startsWith('$')) {
            const value = context.params[Number(token.slice(1)) - 1];
            return typeof value === 'number' || value instanceof Date
                ? value
                : new Date(String(value));
        }
        if (/^\d+$/.test(token)) return Number(token);
        if (lower.startsWith('excluded.')) {
            return column(token.slice(9).replaceAll('"', ''), context.excluded);
        }
        if (token.startsWith('"')) {
            return column(
                token.split('.').at(-1)?.replaceAll('"', '') ?? '',
                context.stored,
            );
        }
        if (lower === 'least') {
            expect_('(');
            const a = comparison();
            expect_(',');
            const b = comparison();
            expect_(')');
            return Math.min(Number(a), Number(b));
        }
        if (lower === 'case') {
            expect_('when');
            const condition = comparison();
            expect_('then');
            const whenTrue = comparison();
            expect_('else');
            const whenFalse = comparison();
            expect_('end');
            return condition === true ? whenTrue : whenFalse;
        }
        throw new Error(`unsupported token ${token} in ${text}`);
    };
    const sum = (): SqlValue => {
        let value = primary();
        while (tokens[index] === '+') {
            index += 1;
            value = Number(value) + Number(primary());
        }
        return value;
    };
    const comparison = (): SqlValue => {
        const left = sum();
        if (tokens[index] !== '<=') return left;
        index += 1;
        return Number(left) <= Number(sum());
    };
    const value = comparison();
    if (index === tokens.length) return value;
    throw new Error(`unread tail in ${text}`);
}

function respond(query: IssuedQuery): FakeRow[] {
    if (query.text.startsWith(`insert into "${TABLE}"`)) return upsert(query);
    if (query.text.startsWith('select') && query.text.includes(`"${TABLE}"`)) {
        const [bucket, key] = query.params;
        const row = buckets.get(bucketKey(bucket, key));
        return row === undefined ? [] : [toRow(bucket, key, { ...row })];
    }
    return [];
}

function splitAssignments(clause: string): Map<string, string> {
    const assignments = new Map<string, string>();
    let depth = 0;
    let current = '';
    const flush = (): void => {
        const match = /^\s*"(\w+)"\s*=\s*(.*)$/s.exec(current);
        if (match?.[1] && match[2]) assignments.set(match[1], match[2].trim());
        current = '';
    };
    for (const char of clause) {
        if (char === '(') depth += 1;
        else if (char === ')') depth -= 1;
        if (char === ',' && depth === 0) {
            flush();
            continue;
        }
        current += char;
    }
    flush();
    return assignments;
}

function storedCount(bucket: string, key: string): number | undefined {
    return buckets.get(bucketKey(bucket, key))?.count;
}

function toRow(bucket: unknown, key: unknown, row: StoredBucket): FakeRow {
    return { bucket, count: row.count, key, reset_at: row.resetAt };
}

function upsert(query: IssuedQuery): FakeRow[] {
    const value = (column: string): unknown =>
        insertedColumnValues(query, column)[0];
    const key = bucketKey(value('bucket'), value('key'));
    const excluded: StoredBucket = {
        count: Number(value('count')),
        resetAt: new Date(String(value('reset_at'))),
    };
    const stored = buckets.get(key);
    if (stored === undefined) {
        buckets.set(key, excluded);
    } else {
        const clause =
            /\son conflict .*? do update set (.*?)(?:\sreturning\s.*)?$/is.exec(
                query.text,
            )?.[1] ?? '';
        const context = { excluded, params: query.params, stored };
        const assignments = splitAssignments(clause);
        const count = assignments.get('count');
        const resetAt = assignments.get('reset_at');
        buckets.set(key, {
            count:
                count === undefined
                    ? stored.count
                    : Number(evaluate(count, context)),
            resetAt:
                resetAt === undefined
                    ? stored.resetAt
                    : new Date(evaluate(resetAt, context) as Date),
        });
    }
    const row = buckets.get(key);
    return row === undefined ? [] : [toRow(value('bucket'), value('key'), row)];
}

function within(bucket: string, key: string, max: number) {
    return isWithinRateLimit({ bucket, key, max, windowMs: WINDOW_MS });
}

beforeEach(() => {
    buckets.clear();
});

describe('isWithinRateLimit', () => {
    it('counts parallel calls exactly: none is lost to a read-then-write race', async () => {
        const results = await Promise.all(
            Array.from({ length: 25 }, () =>
                within('prop-accounts:account', 'user-1', 100),
            ),
        );
        expect(results.every(Boolean)).toBe(true);
        expect(storedCount('prop-accounts:account', 'user-1')).toBe(25);
    });

    it('lets exactly max parallel calls through and blocks the rest', async () => {
        const results = await Promise.all(
            Array.from({ length: 25 }, () =>
                within('contact:ip', '10.0.0.1', 10),
            ),
        );
        expect(results.filter(Boolean)).toHaveLength(10);
        expect(results.filter((allowed) => !allowed)).toHaveLength(15);
    });

    it('keeps the caller contract: max calls per window, then blocked, then a fresh window after it resets', async () => {
        const outcomes: boolean[] = [];
        for (let call = 0; call < 5; call++) {
            outcomes.push(await within('accounting:run', 'user-1', 3));
        }
        expect(outcomes).toEqual([true, true, true, false, false]);
        const stored = buckets.get(bucketKey('accounting:run', 'user-1'));
        if (stored === undefined) throw new Error('expected a stored bucket');
        stored.resetAt = new Date(Date.now() - 1);
        expect(await within('accounting:run', 'user-1', 3)).toBe(true);
        expect(storedCount('accounting:run', 'user-1')).toBe(1);
        expect(
            buckets
                .get(bucketKey('accounting:run', 'user-1'))
                ?.resetAt.getTime(),
        ).toBeGreaterThan(Date.now());
    });

    it('blocks every call when max is 0, the first call of a fresh window included', async () => {
        expect(await within('prop-accounts:event', 'user-1', 0)).toBe(false);
        expect(await within('prop-accounts:event', 'user-1', 0)).toBe(false);
        const stored = buckets.get(bucketKey('prop-accounts:event', 'user-1'));
        if (stored === undefined) throw new Error('expected a stored bucket');
        stored.resetAt = new Date(Date.now() - 1);
        expect(await within('prop-accounts:event', 'user-1', 0)).toBe(false);
    });

    it('keys case-insensitively and keeps buckets and keys apart', async () => {
        expect(await within('contact:email', 'Someone@Example.com', 1)).toBe(
            true,
        );
        expect(await within('contact:email', 'someone@example.com', 1)).toBe(
            false,
        );
        expect(await within('contact:ip', 'someone@example.com', 1)).toBe(true);
        expect(await within('contact:email', 'other@example.com', 1)).toBe(
            true,
        );
    });
});
