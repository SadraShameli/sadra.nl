import { describe, expect, it, vi } from 'vitest';

import { AccountStage, SnapshotSource } from '~/lib/prop-accounts';
import { PROP_MUTATIONS_PER_WINDOW } from '~/lib/prop-accounts/server';
import { AdviceSource } from '~/lib/prop-calculator/advisor';
import { PropMutationRejection } from '~/lib/schemas/propAccountOutputs';

import {
    assertUserScopedWhere,
    insertedColumnValues,
    readTable,
    TransactionStep,
    transactionSteps,
} from '../fakeDatabase';
import {
    accountRow,
    callerFor,
    defined,
    errorShapeOf,
    IDS,
    insertsInto,
    mutationRejection,
    propWrites,
    rejectionOf,
    SIGNED_IN,
    snapshotRow,
    tableResponder,
    TABLES,
    USER_ID,
} from './propRouterHarness';

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

function reviewSubmitInput(overrides: Record<string, unknown> = {}) {
    return {
        asOf: '2026-09-21',
        decisions: [
            {
                acceptedRiskCents: 40_000,
                acceptedRungsCents: [40_000, 60_000],
                accountId: IDS.account,
                headlineRiskCents: 40_000,
                stage: AccountStage.Eval,
            },
        ],
        snapshots: [
            {
                accountId: IDS.account,
                balanceCents: 5_050_000,
                dashboardFloorCents: 4_900_000,
                highestEodBalanceCents: 5_100_000,
                tradingDays: 4,
            },
        ],
        ...overrides,
    };
}

const MAX_REVIEW_ACCOUNTS = 200;

function fullReviewInput() {
    const indexes = Array.from({ length: MAX_REVIEW_ACCOUNTS }, (_, i) => i);
    return reviewSubmitInput({
        decisions: indexes.map((index) => ({
            acceptedRiskCents: 40_000,
            acceptedRungsCents: [40_000, 60_000],
            accountId: reviewAccountId(index),
            headlineRiskCents: 40_000,
            stage: AccountStage.Eval,
        })),
        snapshots: indexes.map((index) => ({
            accountId: reviewAccountId(index),
            balanceCents: 5_050_000,
            dashboardFloorCents: 4_900_000,
            highestEodBalanceCents: 5_100_000,
            tradingDays: 4,
        })),
    });
}

function reviewAccountId(index: number): string {
    return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function reviewSnapshotId(index: number): string {
    return `00000000-0000-4000-9000-${String(index).padStart(12, '0')}`;
}

describe('propAccounts.review', () => {
    it('submit inserts every snapshot and decision in one transaction, each decision linked to its account snapshot', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.snapshot]: [
                    snapshotRow({ account_id: IDS.account, id: IDS.snapshot }),
                ],
            }),
        );
        await caller.review.submit(reviewSubmitInput());
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Commit,
        ]);
        const [snapshotInsert] = insertsInto(queries, TABLES.snapshot);
        expect(
            insertedColumnValues(defined(snapshotInsert), 'as_of'),
        ).toEqual(['2026-09-21']);
        expect(
            insertedColumnValues(defined(snapshotInsert), 'source'),
        ).toEqual([SnapshotSource.WeeklyReview]);
        const [decisionInsert] = insertsInto(queries, TABLES.decision);
        expect(
            insertedColumnValues(defined(decisionInsert), 'snapshot_id'),
        ).toEqual([IDS.snapshot]);
        expect(
            insertedColumnValues(defined(decisionInsert), 'decided_on'),
        ).toEqual(['2026-09-21']);
        expect(
            insertedColumnValues(defined(decisionInsert), 'source'),
        ).toEqual([AdviceSource.Documented]);
    });

    it('checks ownership of every account before writing anything', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.review.submit(reviewSubmitInput());
        const load = queries.find(
            (query) => readTable(query) === TABLES.account,
        );
        assertUserScopedWhere(defined(load), USER_ID);
    });

    it('rejects a foreign account and writes nothing', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, (query) =>
            /^select count\(\*\)/i.test(query.text) ? [{ count: 0 }] : [],
        );
        await expect(
            caller.review.submit(reviewSubmitInput()),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('a stored duplicate gives DuplicateSnapshot and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.snapshot]: [
                    snapshotRow({ account_id: IDS.account, as_of: '2026-09-21' }),
                ],
            }),
        );
        const rejection = caller.review.submit(reviewSubmitInput());
        const shape = errorShapeOf(await rejectionOf(rejection));
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.DuplicateSnapshot),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('a complete but implausible snapshot gives ImplausibleSnapshot and writes nothing', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const implausible = reviewSubmitInput({
            snapshots: [
                {
                    accountId: IDS.account,
                    balanceCents: 5_080_000,
                    dashboardFloorCents: 4_900_000,
                    highestEodBalanceCents: 5_050_000,
                    tradingDays: 4,
                },
            ],
        });
        const rejection = caller.review.submit(implausible);
        const shape = errorShapeOf(await rejectionOf(rejection));
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ImplausibleSnapshot),
        );
        expect(shape.message).toContain('highest end-of-day balance');
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('a missing required field gives MissingSnapshotField and writes nothing', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const incomplete = reviewSubmitInput({
            snapshots: [
                { accountId: IDS.account, balanceCents: 5_050_000 },
            ],
        });
        const rejection = caller.review.submit(incomplete);
        const shape = errorShapeOf(await rejectionOf(rejection));
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.MissingSnapshotField),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('rejects a decision for an account without a snapshot in the batch', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await expect(
            caller.review.submit(
                reviewSubmitInput({
                    decisions: [
                        {
                            acceptedRiskCents: 40_000,
                            acceptedRungsCents: [40_000],
                            accountId: IDS.otherAccount,
                            headlineRiskCents: 40_000,
                            stage: AccountStage.Eval,
                        },
                    ],
                }),
            ),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('checks the snapshot and decision quotas before inserting', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({}, { [TABLES.snapshot]: 20_000 }),
        );
        await expect(
            caller.review.submit(reviewSubmitInput()),
        ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    });

    it('checks the rate limit exactly once per submission', async () => {
        const rateLimit = await import('~/lib/observability/rate-limit');
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.snapshot]: [
                    snapshotRow({ account_id: IDS.account, id: IDS.snapshot }),
                ],
            }),
        );
        vi.mocked(rateLimit.isWithinRateLimit).mockClear();
        await caller.review.submit(reviewSubmitInput());
        expect(rateLimit.isWithinRateLimit).toHaveBeenCalledTimes(1);
    });

    it('scopes every prop select, insert by the session user', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.snapshot]: [
                    snapshotRow({ account_id: IDS.account, id: IDS.snapshot }),
                ],
            }),
        );
        await caller.review.submit(reviewSubmitInput());
        const [snapshotInsert] = insertsInto(queries, TABLES.snapshot);
        expect(
            insertedColumnValues(defined(snapshotInsert), 'user_id'),
        ).toEqual([USER_ID]);
        const [decisionInsert] = insertsInto(queries, TABLES.decision);
        expect(
            insertedColumnValues(defined(decisionInsert), 'user_id'),
        ).toEqual([USER_ID]);
    });

    it('records the account stage the server loaded, not the stage the client sent', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [accountRow({ stage: AccountStage.Eval })],
                [TABLES.snapshot]: [
                    snapshotRow({ account_id: IDS.account, id: IDS.snapshot }),
                ],
            }),
        );
        await caller.review.submit(
            reviewSubmitInput({
                decisions: [
                    {
                        acceptedRiskCents: 40_000,
                        acceptedRungsCents: [40_000, 60_000],
                        accountId: IDS.account,
                        headlineRiskCents: 40_000,
                        stage: AccountStage.Funded,
                    },
                ],
            }),
        );
        const [decisionInsert] = insertsInto(queries, TABLES.decision);
        expect(
            insertedColumnValues(defined(decisionInsert), 'stage'),
        ).toEqual([AccountStage.Eval]);
    });

    it('fails loudly instead of writing an orphaned decision when no snapshot id was stored for its account', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.snapshot]: [
                    snapshotRow({ account_id: IDS.otherAccount }),
                ],
            }),
        );
        await expect(
            caller.review.submit(reviewSubmitInput()),
        ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
        expect(insertsInto(queries, TABLES.decision)).toHaveLength(0);
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Rollback,
        ]);
    });

    it('records a full review of 200 accounts through a limiter that allows only the per-window mutation count', async () => {
        const rateLimit = await import('~/lib/observability/rate-limit');
        const hits = new Map<string, number>();
        vi.mocked(rateLimit.isWithinRateLimit).mockImplementationOnce(
            (limit) => {
                const count = (hits.get(limit.bucket) ?? 0) + 1;
                hits.set(limit.bucket, count);
                return Promise.resolve(
                    count <= Math.min(limit.max, PROP_MUTATIONS_PER_WINDOW),
                );
            },
        );
        const indexes = Array.from(
            { length: MAX_REVIEW_ACCOUNTS },
            (_, i) => i,
        );
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: indexes.map((index) =>
                    accountRow({ id: reviewAccountId(index) }),
                ),
                [TABLES.snapshot]: indexes.map((index) =>
                    snapshotRow({
                        account_id: reviewAccountId(index),
                        id: reviewSnapshotId(index),
                    }),
                ),
            }),
        );
        const result = await caller.review.submit(fullReviewInput());
        expect(result.snapshots).toHaveLength(MAX_REVIEW_ACCOUNTS);
        expect(hits.values().toArray()).toEqual([1]);
        const [decisionInsert] = insertsInto(queries, TABLES.decision);
        expect(
            insertedColumnValues(defined(decisionInsert), 'snapshot_id'),
        ).toEqual(indexes.map(reviewSnapshotId));
    });
});
