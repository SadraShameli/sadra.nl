import { describe, expect, it, vi } from 'vitest';

import { OFFICIAL_PROGRAMS } from '~/lib/lifting/programs/official';
import { programScheduleSchema } from '~/lib/lifting/schemas';
import { liftingProgramRouter } from '~/server/api/routers/lifting/program';
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

import {
    createFakeDatabase,
    type FakeRow,
    type IssuedQuery,
    readTable,
    writeTable,
} from '../fakeDatabase';

vi.mock('~/environment', () => ({ environment: { NODE_ENV: 'test' } }));
vi.mock('~/server/db', async () => {
    const schema = await import('~/server/db/schemas/lifting');
    return { db: {}, ...schema };
});
vi.mock('~/lib/auth/server', () => ({
    auth: { api: { getSession: vi.fn() } },
}));
vi.mock('~/lib/email', () => ({}));
vi.mock('~/lib/notify', () => ({ scheduleFanOut: vi.fn() }));

const USER_ID = 'lifting-user';
const OTHER_USER_ID = 'other-lifting-user';
const PROGRAM_ID = '00000000-0000-4000-8000-000000000001';
const PROGRAM_TABLE = 'sadranl_lifting_program';

const VALID_SCHEDULE = {
    weeks: [
        {
            days: [
                {
                    blocks: [
                        {
                            exerciseSlug: 'back-squat',
                            kind: 'straight',
                            reps: 5,
                            sets: 3,
                        },
                    ],
                    name: 'Day 1',
                },
            ],
        },
    ],
};

const FOREIGN_PRIVATE_PROGRAM: FakeRow = {
    category: 'strength',
    created_at: new Date('2026-01-01T00:00:00Z'),
    days_per_week: 1,
    description: 'private notes',
    id: PROGRAM_ID,
    is_official: false,
    is_public: false,
    length_weeks: 1,
    name: 'Secret plan',
    owner_id: OTHER_USER_ID,
    schedule: VALID_SCHEDULE,
    slug: 'secret-plan',
    updated_at: new Date('2026-01-01T00:00:00Z'),
};

function callerWith(programs: readonly FakeRow[]) {
    const { database, queries } = createFakeDatabase((query) => {
        if (readTable(query) === PROGRAM_TABLE) {
            return programs.filter((row) => isVisibleTo(query, row));
        }
        return writeTable(query) === null
            ? []
            : [{ id: PROGRAM_ID, slug: 'x' }];
    });
    const caller = createCallerFactory(
        createTRPCRouter({ program: liftingProgramRouter }),
    )({
        db: database,
        headers: new Headers(),
        session: {
            user: { email: 'lifter@example.com', id: USER_ID, role: 'user' },
        } as never,
    });
    return { caller, queries };
}

function isVisibleTo(query: IssuedQuery, row: FakeRow): boolean {
    const ownerParameter = /"owner_id" = \$(\d+)/.exec(query.text);
    const isScopesOwner = ownerParameter?.[1] !== undefined;
    if (!isScopesOwner) return true;
    const owner = query.params[Number(ownerParameter[1]) - 1];
    const isAllowsShared = /"owner_id" is null/i.test(query.text);
    return row.owner_id === owner || (isAllowsShared && row.owner_id === null);
}

function writesOf(queries: readonly IssuedQuery[]): readonly IssuedQuery[] {
    return queries.filter((query) => writeTable(query) !== null);
}

describe('lifting program visibility', () => {
    it('refuses to clone another user private program and writes nothing', async () => {
        const { caller, queries } = callerWith([FOREIGN_PRIVATE_PROGRAM]);
        await expect(
            caller.program.cloneToCustom({ id: PROGRAM_ID }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(writesOf(queries)).toEqual([]);
    });

    it('refuses to enroll in another user private program and writes nothing', async () => {
        const { caller, queries } = callerWith([FOREIGN_PRIVATE_PROGRAM]);
        await expect(
            caller.program.enroll({
                oneRepMaxes: {},
                programId: PROGRAM_ID,
                startDate: '2026-10-01',
            }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(writesOf(queries)).toEqual([]);
    });
});

describe('lifting program schedule validation', () => {
    it('rejects a custom program whose schedule has no weeks', async () => {
        const { caller, queries } = callerWith([]);
        await expect(
            caller.program.createCustom({
                category: 'strength',
                daysPerWeek: 1,
                lengthWeeks: 1,
                name: 'Empty',
                schedule: {} as never,
            }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        expect(writesOf(queries)).toEqual([]);
    });

    it('accepts every official program schedule', () => {
        for (const program of OFFICIAL_PROGRAMS) {
            expect(
                programScheduleSchema.safeParse(program.schedule).success,
                program.slug,
            ).toBe(true);
        }
    });

    it('accepts a custom program with a complete schedule', async () => {
        const { caller, queries } = callerWith([]);
        await caller.program.createCustom({
            category: 'strength',
            daysPerWeek: 1,
            lengthWeeks: 1,
            name: 'Full',
            schedule: VALID_SCHEDULE,
        });
        expect(writesOf(queries)).toHaveLength(1);
    });
});
