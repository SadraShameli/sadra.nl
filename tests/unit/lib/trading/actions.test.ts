import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    createDefaultTradingPlan,
    deleteAllAssessments,
    deleteAssessment,
    deletePrep,
    recordAssessmentOutcome,
    reorderTradingPlans,
    savePrep,
    setActiveTradingPlan,
} from '~/lib/trading/actions';
import { DEFAULT_PLAN, DEFAULT_PLAN_NAME } from '~/lib/trading/defaults';

import {
    assertInsertedForUser,
    assertUserScopedWhere,
    type FakeRow,
    insertedColumnValues,
    type IssuedQuery,
    readTable,
    TransactionStep,
    transactionSteps,
    writeTable,
} from '../../server/fakeDatabase';

const USER_ID = 'user-trading-actions';
const PLAN_ID = '00000000-0000-4000-8000-000000000001';
const ASSESSMENT_ID = '00000000-0000-4000-8000-000000000002';
const TRADING_PLAN_TABLE = /trading_plan$/;
const DEFAULT_PLAN_LOCK = `trading-default-plan:${USER_ID}`;

interface FakeState {
    queries: IssuedQuery[];
    respond: (query: IssuedQuery) => FakeRow[];
}

const fake = vi.hoisted(() => {
    const state: FakeState = { queries: [], respond: () => [] };
    return state;
});

const refresh = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ refresh }));

vi.mock('~/lib/auth/server', () => ({
    getServerSession: () => Promise.resolve({ user: { id: USER_ID } }),
}));

vi.mock('~/server/db', async () => {
    const { createFakeDatabase } = await import('../../server/fakeDatabase');
    const tradingSchema = await import('~/server/db/schemas/trading');
    const { database, queries } = createFakeDatabase((query) =>
        fake.respond(query),
    );
    fake.queries = queries;
    return { db: database, ...tradingSchema };
});

function inserts(): IssuedQuery[] {
    return fake.queries.filter((query) => query.text.startsWith('insert into'));
}

describe('createDefaultTradingPlan', () => {
    beforeEach(() => {
        fake.queries.length = 0;
        fake.respond = () => [];
        refresh.mockClear();
    });

    it('creates the active default plan for a user who has none', async () => {
        await createDefaultTradingPlan();
        const [insert] = inserts();
        if (!insert) throw new Error('no insert issued');
        expect(writeTable(insert)).toMatch(TRADING_PLAN_TABLE);
        assertInsertedForUser(insert, USER_ID);
        expect(insertedColumnValues(insert, 'name')).toEqual([
            DEFAULT_PLAN_NAME,
        ]);
        expect(insertedColumnValues(insert, 'is_active')).toEqual([true]);
        expect(insertedColumnValues(insert, 'config')).toEqual([
            JSON.stringify(DEFAULT_PLAN),
        ]);
        expect(refresh).toHaveBeenCalledOnce();
    });

    it('takes a per-user lock before checking, inside one transaction', async () => {
        await createDefaultTradingPlan();
        const [begin, lock, check] = fake.queries;
        expect(begin?.text).toBe(TransactionStep.Begin);
        expect(lock?.text).toBe(
            'select pg_advisory_xact_lock(hashtextextended($1, 0))',
        );
        expect(lock?.params).toEqual([DEFAULT_PLAN_LOCK]);
        if (!check) throw new Error('no existence check issued');
        expect(readTable(check)).toMatch(TRADING_PLAN_TABLE);
        assertUserScopedWhere(check, USER_ID);
        expect(transactionSteps(fake.queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Commit,
        ]);
    });

    it('writes nothing when the user already has a plan', async () => {
        fake.respond = (query) =>
            (readTable(query) ?? '').endsWith('trading_plan')
                ? [{ id: PLAN_ID }]
                : [];
        await createDefaultTradingPlan();
        expect(inserts()).toHaveLength(0);
        expect(refresh).toHaveBeenCalledOnce();
    });
});

describe('mutating trading actions refresh the router', () => {
    beforeEach(() => {
        fake.queries.length = 0;
        fake.respond = (query) =>
            query.text.includes(' returning ') ? [{ id: ASSESSMENT_ID }] : [];
        refresh.mockClear();
    });

    it.each([
        {
            call: () => setActiveTradingPlan({ planId: PLAN_ID }),
            name: 'setActiveTradingPlan',
        },
        {
            call: () => reorderTradingPlans({ orderedIds: [PLAN_ID] }),
            name: 'reorderTradingPlans',
        },
        {
            call: () => deleteAssessment({ id: ASSESSMENT_ID }),
            name: 'deleteAssessment',
        },
        { call: () => deleteAllAssessments(), name: 'deleteAllAssessments' },
        {
            call: () => deletePrep({ date: '2026-10-15' }),
            name: 'deletePrep',
        },
        {
            call: () =>
                savePrep({
                    checks: {
                        accountRiskReset: true,
                        economicEventsChecked: true,
                        htfBiasConfirmed: false,
                        journalReviewed: false,
                        keyLevelsMarked: true,
                        mentalCheckIn: true,
                        setupPlanWritten: false,
                    },
                    date: '2026-10-15',
                    notes: null,
                    planId: PLAN_ID,
                }),
            name: 'savePrep',
        },
        {
            call: () =>
                recordAssessmentOutcome({
                    actualRiskTaken: null,
                    executionDeviations: null,
                    followedPlan: true,
                    id: ASSESSMENT_ID,
                    notes: null,
                    outcome: 'win',
                    outcomeR: 2,
                }),
            name: 'recordAssessmentOutcome',
        },
    ])('$name calls refresh once after writing', async ({ call }) => {
        await call();
        expect(fake.queries.length).toBeGreaterThan(0);
        expect(refresh).toHaveBeenCalledOnce();
    });
});
