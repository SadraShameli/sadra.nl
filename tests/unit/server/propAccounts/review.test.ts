import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    AccountTracking,
    SnapshotSource,
} from '~/lib/prop-accounts';
import { PROP_MUTATIONS_PER_WINDOW } from '~/lib/prop-accounts/server';
import {
    ALL_FIRMS,
    DrawdownKind,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator';
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
    eventRow,
    IDS,
    insertsInto,
    mutationRejection,
    planKeyFields,
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

function eodTrailingEntry() {
    for (const firm of ALL_FIRMS) {
        const plan = firm.plans.find(
            (candidate: Plan) =>
                !candidate.isInstantFunded &&
                candidate.drawdownFor(TradingPhase.Eval).kind ===
                    DrawdownKind.EodTrailing,
        );
        if (plan !== undefined) return { firm, plan };
    }
    throw new Error('no eval plan with an end-of-day trailing drawdown');
}

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

function movedLiveOn(day: string) {
    return eventRow({
        kind: AccountEventKind.MovedLive,
        occurred_on: day,
    });
}

function reviewAccountId(index: number): string {
    return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function reviewSnapshotId(index: number): string {
    return `00000000-0000-4000-9000-${String(index).padStart(12, '0')}`;
}

function stagedAccountRow(overrides: Record<string, unknown> = {}) {
    const key = planKeyFields(eodTrailingEntry());
    return accountRow({
        account_size: key.accountSize,
        firm_id: key.firmId,
        funded_on: '2026-09-10',
        plan_serial: key.planSerial,
        stage: AccountStage.Live,
        ...overrides,
    });
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
        expect(insertedColumnValues(defined(snapshotInsert), 'as_of')).toEqual([
            '2026-09-21',
        ]);
        expect(insertedColumnValues(defined(snapshotInsert), 'source')).toEqual(
            [SnapshotSource.WeeklyReview],
        );
        const [decisionInsert] = insertsInto(queries, TABLES.decision);
        expect(
            insertedColumnValues(defined(decisionInsert), 'snapshot_id'),
        ).toEqual([IDS.snapshot]);
        expect(
            insertedColumnValues(defined(decisionInsert), 'decided_on'),
        ).toEqual(['2026-09-21']);
        expect(insertedColumnValues(defined(decisionInsert), 'source')).toEqual(
            [AdviceSource.Documented],
        );
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
                    snapshotRow({
                        account_id: IDS.account,
                        as_of: '2026-09-21',
                    }),
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
            snapshots: [{ accountId: IDS.account, balanceCents: 5_050_000 }],
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
        expect(insertedColumnValues(defined(decisionInsert), 'stage')).toEqual([
            AccountStage.Eval,
        ]);
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

    it('checks a snapshot against the stage the account had on the review date, not its stage today', async () => {
        const key = planKeyFields(eodTrailingEntry());
        const liveToday = accountRow({
            account_size: key.accountSize,
            firm_id: key.firmId,
            funded_on: '2026-09-10',
            plan_serial: key.planSerial,
            stage: AccountStage.Live,
        });
        const movedLiveAfterReview = eventRow({
            kind: AccountEventKind.MovedLive,
            occurred_on: '2026-09-25',
        });
        const withoutPeak = {
            accountId: IDS.account,
            balanceCents: 5_050_000,
            dashboardFloorCents: 4_900_000,
            payoutsTaken: 0,
            tradingDays: 4,
        };
        const responder = tableResponder({
            [TABLES.account]: [liveToday],
            [TABLES.event]: [movedLiveAfterReview],
            [TABLES.snapshot]: [
                snapshotRow({ account_id: IDS.account, id: IDS.snapshot }),
            ],
        });
        const fundedEra = callerFor(SIGNED_IN, responder);
        const rejection = fundedEra.caller.review.submit(
            reviewSubmitInput({ decisions: [], snapshots: [withoutPeak] }),
        );
        const shape = errorShapeOf(await rejectionOf(rejection));
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.MissingSnapshotField),
        );
        expect(shape.message).toContain('Highest end-of-day balance');
        expect(propWrites(fundedEra.queries)).toHaveLength(0);
    });

    it('still accepts a live-stage snapshot dated on or after the move live', async () => {
        const key = planKeyFields(eodTrailingEntry());
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow({
                        account_size: key.accountSize,
                        firm_id: key.firmId,
                        funded_on: '2026-09-10',
                        plan_serial: key.planSerial,
                        stage: AccountStage.Live,
                    }),
                ],
                [TABLES.event]: [
                    eventRow({
                        kind: AccountEventKind.MovedLive,
                        occurred_on: '2026-09-15',
                    }),
                ],
                [TABLES.snapshot]: [
                    snapshotRow({ account_id: IDS.account, id: IDS.snapshot }),
                ],
            }),
        );
        await caller.review.submit(
            reviewSubmitInput({
                decisions: [],
                snapshots: [
                    {
                        accountId: IDS.account,
                        balanceCents: 5_050_000,
                        dashboardFloorCents: 4_900_000,
                        payoutsTaken: 0,
                        tradingDays: 4,
                    },
                ],
            }),
        );
        expect(insertsInto(queries, TABLES.snapshot)).toHaveLength(1);
    });
});

describe('propAccounts.review.stagesOn', () => {
    it('gives the stage a live account had on the review date, funded when it moved live afterwards', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [stagedAccountRow()],
                [TABLES.event]: [movedLiveOn('2026-09-25')],
            }),
        );
        await expect(
            caller.review.stagesOn({ asOf: '2026-09-21' }),
        ).resolves.toEqual([
            { accountId: IDS.account, stage: AccountStage.Funded },
        ]);
    });

    it('gives live once the account moved live on or before the review date', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [stagedAccountRow()],
                [TABLES.event]: [movedLiveOn('2026-09-21')],
            }),
        );
        await expect(
            caller.review.stagesOn({ asOf: '2026-09-21' }),
        ).resolves.toEqual([
            { accountId: IDS.account, stage: AccountStage.Live },
        ]);
    });

    it('keeps an eval account in the eval stage without reading its events', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await expect(
            caller.review.stagesOn({ asOf: '2026-09-21' }),
        ).resolves.toEqual([
            { accountId: IDS.account, stage: AccountStage.Eval },
        ]);
        expect(
            queries.filter((query) => readTable(query) === TABLES.event),
        ).toHaveLength(0);
    });

    it('leaves out a ledger-only account, which has no plan stage', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow({
                        plan_label: 'Custom plan',
                        plan_serial: null,
                        tracking: AccountTracking.LedgerOnly,
                    }),
                ],
            }),
        );
        await expect(
            caller.review.stagesOn({ asOf: '2026-09-21' }),
        ).resolves.toEqual([]);
    });

    it('scopes the account and event reads by the session user', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [stagedAccountRow()],
                [TABLES.event]: [movedLiveOn('2026-09-15')],
            }),
        );
        await caller.review.stagesOn({ asOf: '2026-09-21' });
        const scopedTables = new Set<string>([TABLES.account, TABLES.event]);
        const reads = queries.filter((query) =>
            scopedTables.has(readTable(query) ?? ''),
        );
        expect(reads.map(readTable)).toEqual([TABLES.account, TABLES.event]);
        for (const read of reads) assertUserScopedWhere(read, USER_ID);
    });

    it('rejects a date that is not a calendar date', async () => {
        const { caller } = callerFor(SIGNED_IN, tableResponder());
        await expect(
            caller.review.stagesOn({ asOf: '2026-13-45' }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('agrees with the stage review.submit checks the same account against on that date', async () => {
        const rows = {
            [TABLES.account]: [stagedAccountRow()],
            [TABLES.event]: [movedLiveOn('2026-09-25')],
            [TABLES.snapshot]: [
                snapshotRow({ account_id: IDS.account, id: IDS.snapshot }),
            ],
        };
        const { caller } = callerFor(SIGNED_IN, tableResponder(rows));
        const [entry] = await caller.review.stagesOn({ asOf: '2026-09-21' });
        expect(entry?.stage).toBe(AccountStage.Funded);
        const rejection = callerFor(
            SIGNED_IN,
            tableResponder(rows),
        ).caller.review.submit(
            reviewSubmitInput({
                decisions: [],
                snapshots: [
                    {
                        accountId: IDS.account,
                        balanceCents: 5_050_000,
                        dashboardFloorCents: 4_900_000,
                        payoutsTaken: 0,
                        tradingDays: 4,
                    },
                ],
            }),
        );
        expect(
            errorShapeOf(await rejectionOf(rejection)).data.propRejection,
        ).toEqual(
            mutationRejection(PropMutationRejection.MissingSnapshotField),
        );
    });
});

describe('the stage starts loader of the review and snapshot routers', () => {
    const ROUTERS_DIRECTORY = path.resolve(
        import.meta.dirname,
        '../../../../src/server/api/routers/propAccounts',
    );
    const LOADER_MODULE = 'stageStarts.ts';
    const LOADER_NAMES = ['ledgerStageStarts', 'loadStageStarts'];

    function sources() {
        return readdirSync(ROUTERS_DIRECTORY)
            .filter((file) => file.endsWith('.ts'))
            .map((file) => ({
                file,
                text: readFileSync(path.join(ROUTERS_DIRECTORY, file), 'utf8'),
            }));
    }

    it.each(LOADER_NAMES)('defines %s in exactly one module', (name) => {
        const definers = sources()
            .filter(({ text }) =>
                new RegExp(String.raw`function\s+${name}\b`).test(text),
            )
            .map(({ file }) => file);
        expect(definers).toEqual([LOADER_MODULE]);
    });

    it.each(['review.ts', 'snapshot.ts'])(
        'reads the stage starts in %s through the shared module',
        (file) => {
            const text = readFileSync(
                path.join(ROUTERS_DIRECTORY, file),
                'utf8',
            );
            expect(text).toMatch(/from '\.\/stageStarts'/);
        },
    );

    it('scopes the shared event query by the user id', () => {
        const text = readFileSync(
            path.join(ROUTERS_DIRECTORY, LOADER_MODULE),
            'utf8',
        );
        expect(text).toMatch(/eq\(propAccountEvent\.userId, userId\)/);
    });
});
