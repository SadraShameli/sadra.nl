import { describe, expect, it, vi } from 'vitest';

import { ruleCreateSchema } from '~/lib/schemas/accounting';
import { accountingRouter } from '~/server/api/routers/accounting';
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

import { createFakeDatabase, writeTable } from '../../server/fakeDatabase';

vi.mock('~/environment', () => ({ environment: { NODE_ENV: 'test' } }));
vi.mock('~/server/db', async () => {
    const { databaseSchema } = await import('~/server/db/databaseSchema');
    return { ...databaseSchema, db: {} };
});
vi.mock('~/lib/auth/server', () => ({
    auth: { api: { getSession: vi.fn() } },
}));
vi.mock('~/lib/email', () => ({}));
vi.mock('~/lib/notify', () => ({ scheduleFanOut: vi.fn() }));

const ROOT = { user: { email: 'root@x.test', id: 'root-1', role: 'root' } };
const RULE_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const RULE_TABLE = 'sadranl_accounting_rule';

const VALID_CREATE = {
    credentialId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    direction: 'OUT',
    display: 'Bad regex',
    ledger: { id: '1', label: 'Costs' },
    match: '(',
    matchType: 'regex',
    taxCode: 'NONE',
} as const;

describe('rule pattern validation', () => {
    it('refuses to create a rule whose regular expression does not compile', () => {
        expect(ruleCreateSchema.safeParse(VALID_CREATE).success).toBe(false);
    });

    it.each(['(a+)+$', String.raw`(\w*)*@`, String.raw`^(\d{1,3})+x`])(
        'refuses %s, whose nested quantifiers can backtrack for minutes',
        (match) => {
            expect(
                ruleCreateSchema.safeParse({ ...VALID_CREATE, match }).success,
            ).toBe(false);
        },
    );

    it('accepts an ordinary merchant regex with a quantified group', () => {
        expect(
            ruleCreateSchema.safeParse({
                ...VALID_CREATE,
                match: String.raw`^albert\s+heijn (\d{4}|online)?$`,
            }).success,
        ).toBe(true);
    });

    it('still accepts a parenthesis as a plain contains pattern', () => {
        expect(
            ruleCreateSchema.safeParse({
                ...VALID_CREATE,
                matchType: 'contains',
            }).success,
        ).toBe(true);
    });

    it('refuses an update that leaves a stored regex rule with an invalid pattern', async () => {
        const { database, queries } = createFakeDatabase((query) =>
            query.text.startsWith('select')
                ? [{ match: 'coffee', match_type: 'regex' }]
                : [],
        );
        const caller = createCallerFactory(
            createTRPCRouter({ accounting: accountingRouter }),
        )({ db: database, headers: new Headers(), session: ROOT as never });

        await expect(
            caller.accounting.rules.update({ id: RULE_ID, match: '(' }),
        ).rejects.toThrow();
        expect(queries.some((query) => writeTable(query) === RULE_TABLE)).toBe(
            false,
        );
    });
});
