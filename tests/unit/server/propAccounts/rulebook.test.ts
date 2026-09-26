import { describe, expect, it, vi } from 'vitest';
import { type z } from 'zod';

import {
    DEFAULT_RULEBOOK,
    EvalSizingMode,
    RULEBOOK_SCHEMA_VERSION,
    type rulebookSchema,
} from '~/lib/prop-calculator/advisor';
import {
    PropRecord,
    PropStoredRecordRejection,
} from '~/lib/schemas/propAccountOutputs';

import { assertUserScopedWhere, insertedColumnValues } from '../fakeDatabase';
import {
    callerFor,
    defined,
    deletesFrom,
    errorShapeOf,
    insertsInto,
    propWrites,
    rejectionOf,
    rulebookRow,
    SIGNED_IN,
    tableResponder,
    TABLES,
    USER_ID,
} from './propRouterHarness';

type RulebookInput = z.input<typeof rulebookSchema>;

function editableRulebook(): RulebookInput {
    const clone: unknown = structuredClone(DEFAULT_RULEBOOK);
    return clone as RulebookInput;
}

vi.mock('~/environment', () => ({ environment: { NODE_ENV: 'test' } }));
vi.mock('~/server/db', () => ({ db: {} }));
vi.mock('~/lib/auth/server', () => ({
    auth: { api: { getSession: vi.fn() } },
}));
vi.mock('~/lib/email', () => ({}));
vi.mock('~/lib/notify', () => ({ fanOutEvent: vi.fn() }));
vi.mock('~/lib/observability/rate-limit', () => ({
    isWithinRateLimit: vi.fn(() => Promise.resolve(true)),
}));

describe('propAccounts.rulebook', () => {
    it('get without a stored row returns DEFAULT_RULEBOOK', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.rulebook]: [] }),
        );
        await expect(caller.rulebook.get()).resolves.toEqual(DEFAULT_RULEBOOK);
        assertUserScopedWhere(defined(queries[0]), USER_ID);
    });

    it('get fills defaults into an old-shape stored row', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.rulebook]: [
                    rulebookRow({
                        parameters: { funded: { riskCents: 20_000 } },
                    }),
                ],
            }),
        );
        const rulebook = await caller.rulebook.get();
        expect(rulebook.funded.riskCents).toBe(20_000);
        expect(rulebook.funded.takeProfitCents).toBe(
            DEFAULT_RULEBOOK.funded.takeProfitCents,
        );
        expect(rulebook.schemaVersion).toBe(RULEBOOK_SCHEMA_VERSION);
    });

    it('get fails loud and readable on a stored rulebook that breaks Hard Rule 4', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.rulebook]: [
                    rulebookRow({
                        parameters: {
                            eval: {
                                maxRiskDailyCapMultiple: 2,
                                mode: EvalSizingMode.MaxRisk,
                            },
                            strategy: { rr: 3 },
                        },
                    }),
                ],
            }),
        );
        const shape = errorShapeOf(await rejectionOf(caller.rulebook.get()));
        expect(shape.data.code).toBe('PRECONDITION_FAILED');
        expect(shape.data.zodError).toBeNull();
        expect(shape.message).toMatch(/Hard Rule 4/);
        expect(shape.message).toMatch(
            /save a valid rulebook or reset it to the defaults/i,
        );
        expect(shape.data.propRejection).toEqual({
            lifecycleRejection: null,
            limit: null,
            quota: null,
            reason: PropStoredRecordRejection.InvalidStoredRecord,
            record: PropRecord.Rulebook,
            recordId: null,
        });
    });

    it('upsert rejects an invalid rulebook before touching the database', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await expect(
            caller.rulebook.upsert({
                ...editableRulebook(),
                payout: {
                    ...DEFAULT_RULEBOOK.payout,
                    retainedCushionCents: 100_000,
                },
            }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        expect(queries).toHaveLength(0);
    });

    it('upsert writes one row keyed by the session user, conflict update scoped too', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.rulebook.upsert(editableRulebook());
        const [insert] = insertsInto(queries, TABLES.rulebook);
        expect(insertedColumnValues(defined(insert), 'user_id')).toEqual([
            USER_ID,
        ]);
        expect(insert?.text).toMatch(/on conflict \("user_id"\) do update set/);
        assertUserScopedWhere(defined(insert), USER_ID);
        expect(propWrites(queries)).toHaveLength(1);
    });

    it('reset deletes only the session user row', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.rulebook.reset();
        const [removal] = deletesFrom(queries, TABLES.rulebook);
        assertUserScopedWhere(defined(removal), USER_ID);
        expect(propWrites(queries)).toHaveLength(1);
    });
});
