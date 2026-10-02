import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    DashboardBalanceConvention,
    FeeKind,
    PayoutStatus,
    personalRulesSchema,
    SnapshotSource,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import { AdviceSource } from '~/lib/prop-calculator/advisor';
import {
    accountCreateSchema,
    accountDateSchema,
    accountIdSchema,
    accountListSchema,
    accountUpdateSchema,
    copyGroupAssignSchema,
    copyGroupCreateSchema,
    copyGroupUpdateSchema,
    decisionCreateSchema,
    decisionRecordActualSchema,
    eventListSchema,
    eventRecordSchema,
    feeCreateSchema,
    feeUpdateSchema,
    importAccountsSchema,
    ledgerListSchema,
    payoutCreateSchema,
    payoutUpdateSchema,
    requiresEventNote,
    scenarioSaveSchema,
    snapshotBulkCreateSchema,
    snapshotCreateSchema,
    violationListSchema,
} from '~/lib/schemas/propAccounts';

function registryEntry(isMatch: (plan: Plan) => boolean): {
    firm: TradingFirm;
    plan: Plan;
} {
    for (const firm of ALL_FIRMS) {
        const plan = firm.plans.find(isMatch);
        if (plan !== undefined) return { firm, plan };
    }
    throw new Error('no registry plan matches');
}

const EVAL_ENTRY = registryEntry((p) => !p.isInstantFunded);
const INSTANT_ENTRY = registryEntry((p) => p.isInstantFunded);

function planKeyFields(entry: { firm: TradingFirm; plan: Plan }) {
    return {
        accountSize: entry.plan.id.accountSize,
        firmId: entry.firm.id,
        optIns: NO_PLAN_OPT_INS,
        planSerial: serializePlanId(entry.plan.id),
    };
}

const ACCOUNT_ID = randomUUID();

const VALID_CREATE = {
    ...planKeyFields(EVAL_ENTRY),
    dashboardConvention: DashboardBalanceConvention.Nominal,
    label: 'MFF 1',
    purchasedOn: '2026-09-01',
    stage: AccountStage.Eval,
};

const VALID_UPDATE = {
    ...planKeyFields(EVAL_ENTRY),
    copyGroupId: null,
    dashboardConvention: DashboardBalanceConvention.Nominal,
    externalAlias: null,
    firstFundedTradeOn: null,
    fundedOn: null,
    id: ACCOUNT_ID,
    label: 'MFF 1',
    liveStartBalanceCents: null,
    notes: null,
    personalRules: {},
    purchasedOn: '2026-09-01',
    replacesAccountId: null,
    tags: [],
};

const VALID_SNAPSHOT = {
    accountId: ACCOUNT_ID,
    asOf: '2026-09-25',
    balanceCents: 5_120_000,
    source: SnapshotSource.Manual,
};

function accountRows(count: number): unknown[] {
    return Array.from({ length: count }, (_, index) => ({
        ...VALID_CREATE,
        label: `A${index}`,
    }));
}

function isAccepted(
    schema: { safeParse: (value: unknown) => { success: boolean } },
    value: unknown,
): boolean {
    return schema.safeParse(value).success;
}

function snapshotRows(count: number): unknown[] {
    return Array.from({ length: count }, () => ({
        ...VALID_SNAPSHOT,
        accountId: randomUUID(),
    }));
}

function without(value: object, omitted: string): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== omitted),
    );
}

describe('accountDateSchema', () => {
    it('accepts real calendar dates', () => {
        for (const date of ['2026-09-25', '2024-02-29', '2026-12-31']) {
            expect(isAccepted(accountDateSchema, date)).toBe(true);
        }
    });

    it('rejects impossible or malformed dates', () => {
        for (const date of [
            '2026-02-30',
            '2026-02-29',
            '2026-13-01',
            '2026-04-31',
            '2026-1-01',
            '26-01-01',
            '2026-09-25T00:00:00Z',
            '',
        ]) {
            expect(isAccepted(accountDateSchema, date)).toBe(false);
        }
    });
});

describe('accountDateSchema sane range', () => {
    it('accepts calendar dates from 2000 through 2100', () => {
        for (const date of ['2000-01-01', '2026-09-26', '2100-12-31']) {
            expect(isAccepted(accountDateSchema, date), date).toBe(true);
        }
    });

    it('rejects dates before 2000 or after 2100', () => {
        for (const date of [
            '0000-01-01',
            '0001-01-01',
            '0999-06-15',
            '1999-12-31',
            '2101-01-01',
            '9999-12-31',
        ]) {
            expect(isAccepted(accountDateSchema, date), date).toBe(false);
        }
    });

    it('never lets an event list range reach a year below 1000', () => {
        expect(isAccepted(eventListSchema, { to: '0002-01-01' })).toBe(false);
        expect(isAccepted(eventListSchema, { from: '0001-01-01' })).toBe(false);
        expect(eventListSchema.parse({ to: '2000-01-01' }).from).toBe(
            '1997-01-01',
        );
    });
});

describe('accountCreateSchema', () => {
    it('accepts a minimal valid account and fills defaults', () => {
        const result = accountCreateSchema.safeParse(VALID_CREATE);
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            copyGroupId: null,
            externalAlias: null,
            liveStartBalanceCents: null,
            notes: null,
            personalRules: {},
            tags: [],
        });
    });

    it('bounds the label to 1..64 characters after trimming', () => {
        expect(
            isAccepted(accountCreateSchema, { ...VALID_CREATE, label: '' }),
        ).toBe(false);
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                label: ' '.repeat(3),
            }),
        ).toBe(false);
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                label: 'x'.repeat(64),
            }),
        ).toBe(true);
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                label: 'x'.repeat(65),
            }),
        ).toBe(false);
    });

    it('rejects an impossible purchase date', () => {
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                purchasedOn: '2026-02-30',
            }),
        ).toBe(false);
    });

    it('accepts a nullable, non-negative live start balance', () => {
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                liveStartBalanceCents: null,
            }),
        ).toBe(true);
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                liveStartBalanceCents: 0,
            }),
        ).toBe(true);
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                liveStartBalanceCents: 5_000_000,
            }),
        ).toBe(true);
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                liveStartBalanceCents: -1,
            }),
        ).toBe(false);
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                liveStartBalanceCents: 1.5,
            }),
        ).toBe(false);
    });

    it('rejects an unresolvable plan key', () => {
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                planSerial: 'nope',
            }),
        ).toBe(false);
    });

    it('rejects stage Eval on an instant-funded plan and accepts Funded there', () => {
        const instant = { ...VALID_CREATE, ...planKeyFields(INSTANT_ENTRY) };
        const evalResult = accountCreateSchema.safeParse({
            ...instant,
            stage: AccountStage.Eval,
        });
        expect(evalResult.success).toBe(false);
        expect(
            evalResult.error?.issues.map((issue) => issue.path.join('.')),
        ).toEqual(['stage']);
        expect(
            isAccepted(accountCreateSchema, {
                ...instant,
                stage: AccountStage.Funded,
            }),
        ).toBe(true);
    });

    it('bounds tags to 20 entries of 32 characters', () => {
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                tags: Array.from({ length: 20 }, (_, index) => `t${index}`),
            }),
        ).toBe(true);
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                tags: Array.from({ length: 21 }, (_, index) => `t${index}`),
            }),
        ).toBe(false);
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                tags: ['x'.repeat(32)],
            }),
        ).toBe(true);
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                tags: ['x'.repeat(33)],
            }),
        ).toBe(false);
        expect(
            isAccepted(accountCreateSchema, { ...VALID_CREATE, tags: [''] }),
        ).toBe(false);
    });

    it('bounds notes to 2,000 characters', () => {
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                notes: 'x'.repeat(2000),
            }),
        ).toBe(true);
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                notes: 'x'.repeat(2001),
            }),
        ).toBe(false);
    });

    it('bounds the external alias to 64 characters', () => {
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                externalAlias: 'x'.repeat(65),
            }),
        ).toBe(false);
    });

    it('rejects a non-uuid copy group or replaced account', () => {
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                copyGroupId: 'abc',
            }),
        ).toBe(false);
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                replacesAccountId: 'abc',
            }),
        ).toBe(false);
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                copyGroupId: randomUUID(),
            }),
        ).toBe(true);
    });

    it('rejects an unknown dashboard convention or stage', () => {
        expect(
            isAccepted(accountCreateSchema, {
                ...VALID_CREATE,
                dashboardConvention: 'weird',
            }),
        ).toBe(false);
        expect(
            isAccepted(accountCreateSchema, { ...VALID_CREATE, stage: 'demo' }),
        ).toBe(false);
    });
});

describe('accountUpdateSchema', () => {
    it('accepts a full edit', () => {
        expect(isAccepted(accountUpdateSchema, VALID_UPDATE)).toBe(true);
    });

    it('never clears an omitted field: every editable field must be stated', () => {
        const withoutNotes = without(VALID_UPDATE, 'notes');
        expect(isAccepted(accountUpdateSchema, withoutNotes)).toBe(false);
    });

    it('has no stage or status key: supplying either fails loud', () => {
        expect(
            isAccepted(accountUpdateSchema, {
                ...VALID_UPDATE,
                stage: AccountStage.Funded,
            }),
        ).toBe(false);
        expect(
            isAccepted(accountUpdateSchema, {
                ...VALID_UPDATE,
                status: 'active',
            }),
        ).toBe(false);
        const parsed = accountUpdateSchema.safeParse(VALID_UPDATE);
        expect(parsed.data).not.toHaveProperty('stage');
        expect(parsed.data).not.toHaveProperty('status');
    });

    it('accepts a nullable, non-negative live start balance', () => {
        expect(
            isAccepted(accountUpdateSchema, {
                ...VALID_UPDATE,
                liveStartBalanceCents: 4_900_000,
            }),
        ).toBe(true);
        expect(
            isAccepted(accountUpdateSchema, {
                ...VALID_UPDATE,
                liveStartBalanceCents: -1,
            }),
        ).toBe(false);
    });

    it('rejects an account that replaces itself', () => {
        expect(
            isAccepted(accountUpdateSchema, {
                ...VALID_UPDATE,
                replacesAccountId: ACCOUNT_ID,
            }),
        ).toBe(false);
        expect(
            accountUpdateSchema.safeParse({
                ...VALID_UPDATE,
                replacesAccountId: ACCOUNT_ID,
            }).error?.issues[0]?.path,
        ).toEqual(['replacesAccountId']);
        expect(
            isAccepted(accountUpdateSchema, {
                ...VALID_UPDATE,
                replacesAccountId: randomUUID(),
            }),
        ).toBe(true);
    });

    it('rejects an account that replaces itself under an id in other letter case', () => {
        for (const [id, replacesAccountId] of [
            [ACCOUNT_ID, ACCOUNT_ID.toUpperCase()],
            [ACCOUNT_ID.toUpperCase(), ACCOUNT_ID],
        ]) {
            expect(
                accountUpdateSchema
                    .safeParse({
                        ...VALID_UPDATE,
                        id,
                        replacesAccountId,
                    })
                    .error?.issues.map((issue) => issue.path),
            ).toEqual([['replacesAccountId']]);
        }
    });

    it('requires a uuid id and a resolvable plan key', () => {
        expect(
            isAccepted(accountUpdateSchema, { ...VALID_UPDATE, id: 'x' }),
        ).toBe(false);
        expect(
            isAccepted(accountUpdateSchema, {
                ...VALID_UPDATE,
                planSerial: 'nope',
            }),
        ).toBe(false);
    });
});

describe('accountIdSchema and accountListSchema', () => {
    it('requires a uuid id', () => {
        expect(isAccepted(accountIdSchema, { id: ACCOUNT_ID })).toBe(true);
        expect(isAccepted(accountIdSchema, { id: '1' })).toBe(false);
    });

    it('hands every id on in lower case, so later compares and sets ignore letter case', () => {
        const upper = ACCOUNT_ID.toUpperCase();
        expect(accountIdSchema.parse({ id: upper })).toEqual({
            id: ACCOUNT_ID,
        });
        const update = accountUpdateSchema.parse({
            ...VALID_UPDATE,
            copyGroupId: upper,
            id: upper,
            replacesAccountId: randomUUID().toUpperCase(),
        });
        expect(update.id).toBe(ACCOUNT_ID);
        expect(update.copyGroupId).toBe(ACCOUNT_ID);
        expect(update.replacesAccountId).toBe(
            update.replacesAccountId?.toLowerCase(),
        );
        expect(
            snapshotCreateSchema.parse({ ...VALID_SNAPSHOT, accountId: upper })
                .accountId,
        ).toBe(ACCOUNT_ID);
    });

    it('defaults includeArchived to false and filters by stage and firm', () => {
        expect(accountListSchema.safeParse({}).data).toEqual({
            includeArchived: false,
        });
        expect(
            isAccepted(accountListSchema, {
                firmId: EVAL_ENTRY.firm.id,
                stage: AccountStage.Funded,
            }),
        ).toBe(true);
        expect(isAccepted(accountListSchema, { firmId: 'nope' })).toBe(false);
    });
});

describe('importAccountsSchema', () => {
    it('accepts up to 200 rows and rejects 201 or none', () => {
        expect(isAccepted(importAccountsSchema, accountRows(200))).toBe(true);
        expect(isAccepted(importAccountsSchema, accountRows(201))).toBe(false);
        expect(isAccepted(importAccountsSchema, [])).toBe(false);
    });
});

describe('personalRulesSchema', () => {
    it('accepts no personal rules', () => {
        expect(personalRulesSchema.safeParse({}).success).toBe(true);
    });

    it('accepts each cap when positive', () => {
        expect(
            personalRulesSchema.safeParse({
                dailyLossLimitCents: 60_000,
                dailyProfitCapCents: 90_000,
                maxRiskPerTradeCents: 20_000,
                maxTradesPerDay: 3,
                retainedCushionCents: 250_000,
            }).success,
        ).toBe(true);
    });

    it('rejects a zero or negative cap', () => {
        for (const key of [
            'dailyLossLimitCents',
            'dailyProfitCapCents',
            'maxRiskPerTradeCents',
            'maxTradesPerDay',
            'retainedCushionCents',
        ]) {
            expect(personalRulesSchema.safeParse({ [key]: 0 }).success).toBe(
                false,
            );
            expect(personalRulesSchema.safeParse({ [key]: -5 }).success).toBe(
                false,
            );
        }
    });

    it('keeps the payout request override separate from the caps', () => {
        const parsed = personalRulesSchema.safeParse({
            payoutRequestOverrideCents: 100_000,
        });
        expect(parsed.success).toBe(true);
        expect(parsed.data).toEqual({ payoutRequestOverrideCents: 100_000 });
        expect(
            personalRulesSchema.safeParse({ payoutRequestOverrideCents: 0 })
                .success,
        ).toBe(false);
    });

    it('rejects a fractional trade count or cent amount', () => {
        expect(
            personalRulesSchema.safeParse({ maxTradesPerDay: 1.5 }).success,
        ).toBe(false);
        expect(
            personalRulesSchema.safeParse({ dailyLossLimitCents: 10.5 })
                .success,
        ).toBe(false);
    });
});

describe('snapshotCreateSchema', () => {
    it('requires balanceCents', () => {
        expect(isAccepted(snapshotCreateSchema, VALID_SNAPSHOT)).toBe(true);
        const withoutBalance = without(VALID_SNAPSHOT, 'balanceCents');
        expect(isAccepted(snapshotCreateSchema, withoutBalance)).toBe(false);
        expect(
            isAccepted(snapshotCreateSchema, {
                ...VALID_SNAPSHOT,
                balanceCents: null,
            }),
        ).toBe(false);
    });

    it('allows a negative balance for a $0-based dashboard', () => {
        expect(
            isAccepted(snapshotCreateSchema, {
                ...VALID_SNAPSHOT,
                balanceCents: -150_000,
            }),
        ).toBe(true);
    });

    it('bounds payoutsTaken to 0..1000 and tradingDays to 0..10000', () => {
        expect(
            isAccepted(snapshotCreateSchema, {
                ...VALID_SNAPSHOT,
                payoutsTaken: 0,
            }),
        ).toBe(true);
        expect(
            isAccepted(snapshotCreateSchema, {
                ...VALID_SNAPSHOT,
                payoutsTaken: 1000,
            }),
        ).toBe(true);
        expect(
            isAccepted(snapshotCreateSchema, {
                ...VALID_SNAPSHOT,
                payoutsTaken: 1001,
            }),
        ).toBe(false);
        expect(
            isAccepted(snapshotCreateSchema, {
                ...VALID_SNAPSHOT,
                payoutsTaken: -1,
            }),
        ).toBe(false);
        expect(
            isAccepted(snapshotCreateSchema, {
                ...VALID_SNAPSHOT,
                tradingDays: 10_000,
            }),
        ).toBe(true);
        expect(
            isAccepted(snapshotCreateSchema, {
                ...VALID_SNAPSHOT,
                tradingDays: 10_001,
            }),
        ).toBe(false);
        expect(
            isAccepted(snapshotCreateSchema, {
                ...VALID_SNAPSHOT,
                tradingDays: 2.5,
            }),
        ).toBe(false);
    });

    it('makes every optional extra nullable and defaults it to null', () => {
        const extras = [
            'highestEodBalanceCents',
            'highestIntradayBalanceCents',
            'payoutsTaken',
            'tradingDays',
            'qualifyingDaysSinceLastPayout',
            'balanceAtLastPayoutCents',
            'floorAtLastPayoutCents',
            'lastPayoutOn',
            'cycleBestDayProfitCents',
            'evalBestDayProfitCents',
            'cumulativePayoutCents',
            'lastTradedOn',
            'dashboardFloorCents',
        ];
        const nulls = Object.fromEntries(extras.map((key) => [key, null]));
        expect(
            isAccepted(snapshotCreateSchema, { ...VALID_SNAPSHOT, ...nulls }),
        ).toBe(true);
        const defaulted = snapshotCreateSchema.safeParse(VALID_SNAPSHOT);
        expect(defaulted.data).toMatchObject(nulls);
    });

    it('validates the optional dates and the trader-received cumulative payout', () => {
        expect(
            isAccepted(snapshotCreateSchema, {
                ...VALID_SNAPSHOT,
                lastPayoutOn: '2026-02-30',
            }),
        ).toBe(false);
        expect(
            isAccepted(snapshotCreateSchema, {
                ...VALID_SNAPSHOT,
                lastPayoutOn: '2026-09-01',
            }),
        ).toBe(true);
        expect(
            isAccepted(snapshotCreateSchema, {
                ...VALID_SNAPSHOT,
                floorAtLastPayoutCents: 4_810_000,
            }),
        ).toBe(true);
        expect(
            isAccepted(snapshotCreateSchema, {
                ...VALID_SNAPSHOT,
                cumulativePayoutCents: 90_000,
            }),
        ).toBe(true);
        expect(
            isAccepted(snapshotCreateSchema, {
                ...VALID_SNAPSHOT,
                cumulativePayoutCents: -1,
            }),
        ).toBe(false);
    });

    it('requires a known source and a real as-of date', () => {
        expect(
            isAccepted(snapshotCreateSchema, {
                ...VALID_SNAPSHOT,
                source: 'guess',
            }),
        ).toBe(false);
        expect(
            isAccepted(snapshotCreateSchema, {
                ...VALID_SNAPSHOT,
                asOf: '2026-02-31',
            }),
        ).toBe(false);
    });

    it('bulk create accepts up to 200 snapshots', () => {
        expect(isAccepted(snapshotBulkCreateSchema, snapshotRows(200))).toBe(
            true,
        );
        expect(isAccepted(snapshotBulkCreateSchema, snapshotRows(201))).toBe(
            false,
        );
        expect(isAccepted(snapshotBulkCreateSchema, [])).toBe(false);
    });

    it('bulk create rejects two snapshots for the same account and date', () => {
        const result = snapshotBulkCreateSchema.safeParse([
            VALID_SNAPSHOT,
            { ...VALID_SNAPSHOT, asOf: '2026-09-24' },
            { ...VALID_SNAPSHOT, balanceCents: 5_130_000 },
        ]);
        expect(result.success).toBe(false);
        expect(result.error?.issues.map((issue) => issue.path)).toEqual([
            [2, 'asOf'],
        ]);
    });

    it('bulk create treats account ids that differ only in letter case as one account', () => {
        const lower = randomUUID();
        expect(lower).toBe(lower.toLowerCase());
        const result = snapshotBulkCreateSchema.safeParse([
            { ...VALID_SNAPSHOT, accountId: lower },
            { ...VALID_SNAPSHOT, accountId: lower.toUpperCase() },
        ]);
        expect(result.success).toBe(false);
        expect(result.error?.issues.map((issue) => issue.path)).toEqual([
            [1, 'asOf'],
        ]);
    });

    it('bulk create accepts one account on many dates and one date on many accounts', () => {
        expect(
            isAccepted(snapshotBulkCreateSchema, [
                VALID_SNAPSHOT,
                { ...VALID_SNAPSHOT, asOf: '2026-09-24' },
                { ...VALID_SNAPSHOT, accountId: randomUUID() },
            ]),
        ).toBe(true);
    });
});

describe('payout schemas', () => {
    const VALID_PAYOUT = {
        accountId: ACCOUNT_ID,
        grossCents: 100_000,
        requestedOn: '2026-09-10',
        status: PayoutStatus.Requested,
    };
    const PAYOUT_EDIT = {
        grossCents: 100_000,
        netCents: null,
        note: null,
        paidOn: null,
        requestedOn: '2026-09-10',
        status: PayoutStatus.Requested,
    };

    it('accepts a requested payout and defaults the optional fields', () => {
        const parsed = payoutCreateSchema.safeParse(VALID_PAYOUT);
        expect(parsed.success).toBe(true);
        expect(parsed.data).toMatchObject({
            netCents: null,
            note: null,
            paidOn: null,
        });
    });

    it('requires a paid date on a Paid payout', () => {
        expect(
            isAccepted(payoutCreateSchema, {
                ...VALID_PAYOUT,
                status: PayoutStatus.Paid,
            }),
        ).toBe(false);
        expect(
            isAccepted(payoutCreateSchema, {
                ...VALID_PAYOUT,
                paidOn: '2026-09-12',
                status: PayoutStatus.Paid,
            }),
        ).toBe(true);
    });

    it('rejects a paid date before the request date', () => {
        expect(
            isAccepted(payoutCreateSchema, {
                ...VALID_PAYOUT,
                paidOn: '2026-09-09',
                status: PayoutStatus.Paid,
            }),
        ).toBe(false);
    });

    it('rejects a net amount above the gross amount', () => {
        expect(
            isAccepted(payoutCreateSchema, {
                ...VALID_PAYOUT,
                netCents: 90_000,
            }),
        ).toBe(true);
        expect(
            isAccepted(payoutCreateSchema, {
                ...VALID_PAYOUT,
                netCents: 100_001,
            }),
        ).toBe(false);
    });

    it('requires a positive gross amount', () => {
        expect(
            isAccepted(payoutCreateSchema, { ...VALID_PAYOUT, grossCents: 0 }),
        ).toBe(false);
    });

    it('bounds the note', () => {
        expect(
            isAccepted(payoutCreateSchema, {
                ...VALID_PAYOUT,
                note: 'x'.repeat(501),
            }),
        ).toBe(false);
    });

    it('rejects a paid date on a payout that is not Paid', () => {
        expect(
            isAccepted(payoutCreateSchema, {
                ...VALID_PAYOUT,
                paidOn: '2026-09-12',
            }),
        ).toBe(false);
        expect(
            isAccepted(payoutCreateSchema, {
                ...VALID_PAYOUT,
                paidOn: '2026-09-12',
                status: PayoutStatus.Denied,
            }),
        ).toBe(false);
    });

    it('update needs an id and no account id, and every field stated', () => {
        expect(
            isAccepted(payoutUpdateSchema, {
                ...PAYOUT_EDIT,
                id: randomUUID(),
            }),
        ).toBe(true);
        expect(
            isAccepted(payoutUpdateSchema, {
                ...PAYOUT_EDIT,
                accountId: ACCOUNT_ID,
                id: randomUUID(),
            }),
        ).toBe(false);
        expect(isAccepted(payoutUpdateSchema, PAYOUT_EDIT)).toBe(false);
        const withoutNote = without(PAYOUT_EDIT, 'note');
        expect(
            isAccepted(payoutUpdateSchema, {
                ...withoutNote,
                id: randomUUID(),
            }),
        ).toBe(false);
    });

    it('update applies the same consistency rules', () => {
        expect(
            isAccepted(payoutUpdateSchema, {
                ...PAYOUT_EDIT,
                id: randomUUID(),
                status: PayoutStatus.Paid,
            }),
        ).toBe(false);
        expect(
            isAccepted(payoutUpdateSchema, {
                ...PAYOUT_EDIT,
                id: randomUUID(),
                netCents: 100_001,
            }),
        ).toBe(false);
    });
});

describe('fee schemas', () => {
    const VALID_FEE = {
        accountId: ACCOUNT_ID,
        amountCents: 9900,
        kind: FeeKind.EvalPurchase,
        paidOn: '2026-09-01',
    };

    it('accepts every fee kind, including Refund', () => {
        for (const kind of Object.values(FeeKind)) {
            expect(isAccepted(feeCreateSchema, { ...VALID_FEE, kind })).toBe(
                true,
            );
        }
        expect(Object.values(FeeKind)).toContain(FeeKind.Refund);
    });

    it('keeps amounts non-negative: a refund is a positive amount of kind Refund', () => {
        expect(
            isAccepted(feeCreateSchema, { ...VALID_FEE, amountCents: 0 }),
        ).toBe(true);
        expect(
            isAccepted(feeCreateSchema, {
                ...VALID_FEE,
                amountCents: -9900,
                kind: FeeKind.Refund,
            }),
        ).toBe(false);
    });

    it('rejects an unknown kind or an impossible date', () => {
        expect(isAccepted(feeCreateSchema, { ...VALID_FEE, kind: 'tip' })).toBe(
            false,
        );
        expect(
            isAccepted(feeCreateSchema, { ...VALID_FEE, paidOn: '2026-02-30' }),
        ).toBe(false);
    });

    it('update needs an id and no account id, and every field stated', () => {
        const rest = without(VALID_FEE, 'accountId');
        expect(
            isAccepted(feeUpdateSchema, {
                ...rest,
                id: randomUUID(),
                note: null,
            }),
        ).toBe(true);
        expect(
            isAccepted(feeUpdateSchema, {
                ...rest,
                accountId: ACCOUNT_ID,
                id: randomUUID(),
                note: null,
            }),
        ).toBe(false);
        expect(isAccepted(feeUpdateSchema, { ...rest, id: randomUUID() })).toBe(
            false,
        );
    });

    it('ledger lists filter by an optional account id', () => {
        expect(ledgerListSchema.safeParse({}).success).toBe(true);
        expect(isAccepted(ledgerListSchema, { accountId: ACCOUNT_ID })).toBe(
            true,
        );
        expect(isAccepted(ledgerListSchema, { accountId: 'x' })).toBe(false);
    });

    it('violation lists take an optional account id and an optional occurred-from date', () => {
        expect(violationListSchema.safeParse({}).success).toBe(true);
        expect(
            violationListSchema.parse({
                accountId: ACCOUNT_ID,
                occurredFrom: '2026-09-15',
            }),
        ).toEqual({ accountId: ACCOUNT_ID, occurredFrom: '2026-09-15' });
        expect(
            isAccepted(violationListSchema, { occurredFrom: '2026-9-15' }),
        ).toBe(false);
        expect(
            isAccepted(violationListSchema, { occurredFrom: '2026-02-30' }),
        ).toBe(false);
        expect(isAccepted(violationListSchema, { occurredFrom: null })).toBe(
            false,
        );
    });
});

describe('event schemas', () => {
    const VALID_EVENT = {
        accountId: ACCOUNT_ID,
        kind: AccountEventKind.EvalPassed,
        occurredOn: '2026-09-20',
    };

    it('records an event with a defaulted, bounded note', () => {
        const parsed = eventRecordSchema.safeParse(VALID_EVENT);
        expect(parsed.success).toBe(true);
        expect(parsed.data).toEqual({ ...VALID_EVENT, note: null });
        expect(
            isAccepted(eventRecordSchema, {
                ...VALID_EVENT,
                note: 'x'.repeat(500),
            }),
        ).toBe(true);
        expect(
            isAccepted(eventRecordSchema, {
                ...VALID_EVENT,
                note: 'x'.repeat(501),
            }),
        ).toBe(false);
    });

    it('never takes a field diff from the client: detail and changes fail loud', () => {
        expect(
            isAccepted(eventRecordSchema, {
                ...VALID_EVENT,
                detail: {
                    changes: [{ field: 'label', from: 'a', to: 'b' }],
                    note: null,
                },
            }),
        ).toBe(false);
        expect(
            isAccepted(eventRecordSchema, {
                ...VALID_EVENT,
                changes: [{ field: 'label', from: 'a', to: 'b' }],
            }),
        ).toBe(false);
    });

    it('rejects the server-written kinds Edited and Purchased', () => {
        for (const kind of [
            AccountEventKind.Edited,
            AccountEventKind.Purchased,
        ]) {
            expect(
                isAccepted(eventRecordSchema, { ...VALID_EVENT, kind }),
            ).toBe(false);
        }
    });

    it('accepts every other event kind', () => {
        const serverWritten = new Set<AccountEventKind>([
            AccountEventKind.Edited,
            AccountEventKind.Purchased,
        ]);
        const recordable = Object.values(AccountEventKind).filter(
            (kind) => !serverWritten.has(kind),
        );
        expect(recordable).toHaveLength(12);
        expect(recordable).toContain(AccountEventKind.BustReversed);
        for (const kind of recordable) {
            expect(
                isAccepted(eventRecordSchema, {
                    ...VALID_EVENT,
                    kind,
                    note: 'firm confirmed',
                }),
            ).toBe(true);
        }
    });

    it('requires a non-blank note on a bust reversal', () => {
        const reversal = {
            ...VALID_EVENT,
            kind: AccountEventKind.BustReversed,
        };
        expect(isAccepted(eventRecordSchema, reversal)).toBe(false);
        expect(isAccepted(eventRecordSchema, { ...reversal, note: null })).toBe(
            false,
        );
        expect(
            isAccepted(eventRecordSchema, { ...reversal, note: ' '.repeat(3) }),
        ).toBe(false);
        const parsed = eventRecordSchema.safeParse({
            ...reversal,
            note: 'Support reversed the bust: data feed outage',
        });
        expect(parsed.success).toBe(true);
        expect(parsed.data?.note).toBe(
            'Support reversed the bust: data feed outage',
        );
    });

    it('says a kind needs a note exactly where the record schema rejects it without one', () => {
        for (const kind of Object.values(AccountEventKind)) {
            const isAcceptedWithNote = isAccepted(eventRecordSchema, {
                ...VALID_EVENT,
                kind,
                note: 'firm confirmed',
            });
            const isAcceptedWithoutNote = isAccepted(eventRecordSchema, {
                ...VALID_EVENT,
                kind,
                note: null,
            });
            expect(requiresEventNote(kind), kind).toBe(
                isAcceptedWithNote && !isAcceptedWithoutNote,
            );
        }
        expect(requiresEventNote(AccountEventKind.BustReversed)).toBe(true);
        expect(requiresEventNote(AccountEventKind.Busted)).toBe(false);
    });

    it('rejects an unknown kind', () => {
        expect(
            isAccepted(eventRecordSchema, { ...VALID_EVENT, kind: 'vanished' }),
        ).toBe(false);
    });

    it('lists with optional from, to and account id', () => {
        expect(eventListSchema.safeParse({}).success).toBe(true);
        expect(isAccepted(eventListSchema, { accountId: ACCOUNT_ID })).toBe(
            true,
        );
        expect(isAccepted(eventListSchema, { from: '2026-01-01' })).toBe(true);
        expect(isAccepted(eventListSchema, { to: '2026-01-01' })).toBe(true);
        expect(isAccepted(eventListSchema, { from: '2026-02-30' })).toBe(false);
        expect(isAccepted(eventListSchema, { accountId: 'x' })).toBe(false);
    });

    it('allows a range of at most 3 years, with from before to', () => {
        expect(
            isAccepted(eventListSchema, {
                from: '2023-01-01',
                to: '2026-01-01',
            }),
        ).toBe(true);
        expect(
            isAccepted(eventListSchema, {
                from: '2023-01-01',
                to: '2026-01-02',
            }),
        ).toBe(false);
        expect(
            isAccepted(eventListSchema, {
                from: '2024-02-29',
                to: '2027-02-28',
            }),
        ).toBe(true);
        expect(
            isAccepted(eventListSchema, {
                from: '2024-02-29',
                to: '2027-03-01',
            }),
        ).toBe(false);
        expect(
            isAccepted(eventListSchema, {
                from: '2026-02-01',
                to: '2026-01-01',
            }),
        ).toBe(false);
        expect(
            isAccepted(eventListSchema, {
                from: '2026-01-01',
                to: '2026-01-01',
            }),
        ).toBe(true);
    });
});

describe('eventListSchema range bounds', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('bounds a missing end to 3 years after the start', () => {
        expect(eventListSchema.parse({ from: '2020-01-01' })).toEqual({
            from: '2020-01-01',
            to: '2023-01-01',
        });
        expect(eventListSchema.parse({ from: '2024-02-29' }).to).toBe(
            '2027-02-28',
        );
    });

    it('bounds a missing start to 3 years before the end', () => {
        expect(eventListSchema.parse({ to: '2026-01-01' })).toEqual({
            from: '2023-01-01',
            to: '2026-01-01',
        });
        expect(eventListSchema.parse({ to: '2028-02-29' }).from).toBe(
            '2025-03-01',
        );
    });

    it('bounds a range with neither side to 3 years ending on the latest calendar date in any time zone', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-25T23:30:00Z'));
        expect(eventListSchema.parse({ accountId: ACCOUNT_ID })).toEqual({
            accountId: ACCOUNT_ID,
            from: '2023-09-26',
            to: '2026-09-26',
        });
    });

    it('keeps an explicit range as given', () => {
        expect(
            eventListSchema.parse({ from: '2025-01-01', to: '2025-06-30' }),
        ).toEqual({ from: '2025-01-01', to: '2025-06-30' });
    });
});

function codePoints(text: string): string {
    return Array.from(
        text,
        (character) =>
            `U+${character.codePointAt(0)?.toString(16).toUpperCase() ?? ''}`,
    ).join(' ');
}

function inside(character: string): string {
    return `Rapid${character}One`;
}

describe('free text rejects invisible and control characters', () => {
    const UNSAFE = [
        '\u{0}',
        '\u{7}',
        '\u{1B}',
        '\u{7F}',
        '\u{85}',
        '\u{AD}',
        '\u{61C}',
        '\u{180E}',
        '\u{200B}',
        '\u{200E}',
        '\u{200F}',
        '\u{202A}',
        '\u{202B}',
        '\u{202C}',
        '\u{202D}',
        '\u{202E}',
        '\u{2060}',
        '\u{2066}',
        '\u{2067}',
        '\u{2068}',
        '\u{2069}',
        '\u{FEFF}',
        '\u{E0001}',
        '\u{E0041}',
        '\u{E007F}',
    ];
    const LINE_BREAKS = ['\n', '\r', '\t'];
    const SINGLE_LINE_ONLY_UNSAFE = [
        '\u{2028}',
        '\u{2029}',
        '\u{115F}',
        '\u{1160}',
        '\u{3164}',
        '\u{FFA0}',
        '\u{2800}',
        '\u{17B4}',
        '\u{17B5}',
        '\u{34F}',
        '\u{FE00}',
        '\u{FE0D}',
        '\u{E0100}',
        '\u{E01EF}',
        '\u{180B}',
        '\u{180C}',
        '\u{180D}',
        '\u{180F}',
        '\u{FE0E}',
        '\u{FE0F}',
    ];
    const PERSIAN_AND_JOINED = [
        'حساب اصلی',
        'می\u{200C}خواهم',
        'حساب\u{200C}های فاند شده ۲',
        'Rapid\u{200C}One',
        '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}',
        '\u{1F469}\u{1F3FD}\u{200D}\u{1F4BB}',
        '\u{1F3F4}\u{200D}\u{2620}\u{FE0F}',
        '\u{1F3F3}\u{FE0F}\u{200D}\u{1F308}',
        '\u{2764}\u{FE0F} MFF',
        'नमस्ते',
        '\u{D55C}\u{AD6D}\u{C5B4}',
    ];

    const SINGLE_LINE_FIELDS: [string, (text: string) => boolean][] = [
        [
            'account label',
            (text) =>
                isAccepted(accountCreateSchema, {
                    ...VALID_CREATE,
                    label: text,
                }),
        ],
        [
            'external alias',
            (text) =>
                isAccepted(accountCreateSchema, {
                    ...VALID_CREATE,
                    externalAlias: text,
                }),
        ],
        [
            'tag',
            (text) =>
                isAccepted(accountCreateSchema, {
                    ...VALID_CREATE,
                    tags: [text],
                }),
        ],
        [
            'updated label',
            (text) =>
                isAccepted(accountUpdateSchema, {
                    ...VALID_UPDATE,
                    label: text,
                }),
        ],
        [
            'copy group name',
            (text) => isAccepted(copyGroupCreateSchema, { name: text }),
        ],
        [
            'updated copy group name',
            (text) =>
                isAccepted(copyGroupUpdateSchema, {
                    id: randomUUID(),
                    name: text,
                    notes: null,
                }),
        ],
        [
            'scenario name',
            (text) =>
                isAccepted(scenarioSaveSchema, {
                    name: text,
                    query: 'firm=mffu',
                }),
        ],
    ];

    const NOTE_FIELDS: [string, (text: string) => boolean][] = [
        [
            'account notes',
            (text) =>
                isAccepted(accountCreateSchema, {
                    ...VALID_CREATE,
                    notes: text,
                }),
        ],
        [
            'copy group notes',
            (text) =>
                isAccepted(copyGroupCreateSchema, { name: 'A', notes: text }),
        ],
        [
            'payout note',
            (text) =>
                isAccepted(payoutCreateSchema, {
                    accountId: ACCOUNT_ID,
                    grossCents: 50_000,
                    note: text,
                    requestedOn: '2026-09-20',
                    status: PayoutStatus.Requested,
                }),
        ],
        [
            'fee note',
            (text) =>
                isAccepted(feeCreateSchema, {
                    accountId: ACCOUNT_ID,
                    amountCents: 10_000,
                    kind: FeeKind.EvalPurchase,
                    note: text,
                    paidOn: '2026-09-20',
                }),
        ],
        [
            'event note',
            (text) =>
                isAccepted(eventRecordSchema, {
                    accountId: ACCOUNT_ID,
                    kind: AccountEventKind.Busted,
                    note: text,
                    occurredOn: '2026-09-20',
                }),
        ],
        [
            'decision note',
            (text) =>
                isAccepted(decisionCreateSchema, {
                    acceptedRiskCents: 25_000,
                    acceptedRungsCents: [25_000],
                    accountId: ACCOUNT_ID,
                    decidedOn: '2026-09-21',
                    headlineRiskCents: 25_000,
                    note: text,
                    snapshotId: null,
                    source: 'documented',
                    stage: AccountStage.Funded,
                }),
        ],
    ];

    it('accepts ordinary text, accents, emoji and non-Latin scripts everywhere', () => {
        for (const [name, accepts] of [...SINGLE_LINE_FIELDS, ...NOTE_FIELDS]) {
            for (const text of ['MFF 1', 'Réserve €5', 'Apex ✓ 🚀', 'حساب ۱']) {
                expect(accepts(text), `${name}: ${text}`).toBe(true);
            }
        }
    });

    it('rejects control, bidirectional-override and zero-width characters everywhere', () => {
        for (const [name, accepts] of [...SINGLE_LINE_FIELDS, ...NOTE_FIELDS]) {
            for (const character of UNSAFE) {
                expect(
                    accepts(inside(character)),
                    `${name}: U+${character.codePointAt(0)?.toString(16).toUpperCase() ?? ''}`,
                ).toBe(false);
            }
        }
    });

    it('accepts Persian with ZWNJ, emoji ZWJ sequences and any script everywhere', () => {
        for (const [name, accepts] of [...SINGLE_LINE_FIELDS, ...NOTE_FIELDS]) {
            for (const text of PERSIAN_AND_JOINED) {
                expect(accepts(text), `${name}: ${text}`).toBe(true);
            }
        }
    });

    it('rejects line and paragraph separators and invisible fillers in single-line fields', () => {
        for (const [name, accepts] of SINGLE_LINE_FIELDS) {
            for (const character of SINGLE_LINE_ONLY_UNSAFE) {
                const codePoint = `U+${character.codePointAt(0)?.toString(16).toUpperCase() ?? ''}`;
                expect(
                    accepts(inside(character)),
                    `${name}: ${codePoint}`,
                ).toBe(false);
                expect(accepts(character), `${name}: only ${codePoint}`).toBe(
                    false,
                );
            }
        }
    });

    it('keeps a text or emoji presentation selector only directly after an emoji in single-line fields', () => {
        const presented = [
            '\u{2764}\u{FE0F} MFF',
            '\u{2764}\u{FE0E} MFF',
            '\u{A9}\u{FE0F} MFF',
            '\u{1F3F3}\u{FE0F}\u{200D}\u{1F308}',
            '\u{1F3F3}\u{FE0F}\u{200D}\u{26A7}\u{FE0F}',
            '\u{2764}\u{FE0F}\u{200D}\u{1F525}',
        ];
        const hidden = [
            '1\u{FE0F}\u{20E3} MFF',
            '1\u{FE0F} MFF',
            '#\u{FE0F}',
            'MFF\u{FE0F}',
            '\u{FE0F}MFF',
            '\u{2764}\u{FE0F}\u{FE0F}',
            '\u{2764}\u{FE0E}\u{FE0F}',
            '\u{2764}\u{200D}\u{FE0F}',
            '\u{2764} \u{FE0F}',
            '\u{2764}\u{E0100}',
            '\u{2764}\u{FE00}',
        ];
        for (const [name, accepts] of SINGLE_LINE_FIELDS) {
            for (const text of presented) {
                expect(accepts(text), `${name}: ${text}`).toBe(true);
            }
            for (const text of hidden) {
                expect(accepts(text), `${name}: ${codePoints(text)}`).toBe(
                    false,
                );
            }
        }
    });

    it('keeps ZWNJ only between two letters and ZWJ only between emoji in single-line fields', () => {
        const joined = [
            'می\u{200C}خواهم',
            'Rapid\u{200C}One',
            '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}',
            '\u{1F469}\u{1F3FD}\u{200D}\u{1F4BB}',
            '\u{2764}\u{FE0F}\u{200D}\u{1F525}',
        ];
        const stray = [
            'Rapid\u{200D}One',
            '\u{200C}MFF',
            'MFF\u{200C}',
            'MFF \u{200C}One',
            'Rapid\u{200C}\u{200C}One',
            'Rapid\u{200C}1',
            'می\u{200C}\u{200C}خواهم',
            '\u{1F468}\u{200D}\u{200D}\u{1F469}',
            '\u{1F468}\u{200D}',
            '\u{200D}\u{1F468}',
            '\u{1F468}\u{200D}One',
            '\u{1F468}\u{200C}\u{1F469}',
            'Rapid\u{200C}\u{200D}One',
        ];
        for (const [name, accepts] of SINGLE_LINE_FIELDS) {
            for (const text of joined) {
                expect(accepts(text), `${name}: ${codePoints(text)}`).toBe(
                    true,
                );
            }
            for (const text of stray) {
                expect(accepts(text), `${name}: ${codePoints(text)}`).toBe(
                    false,
                );
            }
        }
    });

    it('keeps a presentation selector in notes only directly after an emoji and rejects other variation selectors there', () => {
        const presented = [
            '\u{2764}\u{FE0F} MFF',
            '\u{2764}\u{FE0E} MFF',
            '\u{1F3F3}\u{FE0F}\u{200D}\u{1F308}',
            'Rapid\u{200D}One',
        ];
        const hidden = [
            'MFF\u{FE0F}',
            '\u{FE0F}MFF',
            '1\u{FE0F}\u{20E3} MFF',
            '\u{2764}\u{FE0F}\u{FE0F}',
            '\u{2764} \u{FE0F}',
            '\u{2764}\u{FE00}',
            '\u{2764}\u{E0100}',
            'MFF\u{FE0D}',
            'MFF\u{E01EF}',
            'MFF\u{180B}',
        ];
        for (const [name, accepts] of NOTE_FIELDS) {
            for (const text of presented) {
                expect(accepts(text), `${name}: ${codePoints(text)}`).toBe(
                    true,
                );
            }
            for (const text of hidden) {
                expect(accepts(text), `${name}: ${codePoints(text)}`).toBe(
                    false,
                );
            }
        }
    });

    it('rejects line breaks and tabs in single-line fields', () => {
        for (const [name, accepts] of SINGLE_LINE_FIELDS) {
            for (const character of LINE_BREAKS) {
                expect(accepts(inside(character)), name).toBe(false);
            }
        }
    });

    it('keeps line breaks and tabs in notes', () => {
        for (const [name, accepts] of NOTE_FIELDS) {
            for (const character of LINE_BREAKS) {
                expect(accepts(inside(character)), name).toBe(true);
            }
        }
    });
});

function isQueryAccepted(query: string): boolean {
    return isAccepted(scenarioSaveSchema, { name: 'Base', query });
}

describe('scenario query text', () => {
    it('accepts an ordinary query string, encoded or not', () => {
        for (const query of [
            'firm=mffu&size=50000',
            'label=%D8%AD%D8%B3%D8%A7%D8%A8',
            'label=حساب\u{200C}ها',
            '',
        ]) {
            expect(isQueryAccepted(query), query).toBe(true);
        }
    });

    it('rejects control characters', () => {
        for (const character of [
            '\u{0}',
            '\u{7}',
            '\t',
            '\n',
            '\r',
            '\u{1B}',
            '\u{7F}',
            '\u{85}',
            '\u{9F}',
        ]) {
            expect(
                isQueryAccepted(`firm=mffu${character}&size=50000`),
                `U+${character.codePointAt(0)?.toString(16).toUpperCase() ?? ''}`,
            ).toBe(false);
        }
    });
});

describe('copy group schemas', () => {
    it('creates with a bounded name and optional notes', () => {
        expect(isAccepted(copyGroupCreateSchema, { name: 'Rapid trio' })).toBe(
            true,
        );
        expect(
            copyGroupCreateSchema.safeParse({ name: 'Rapid trio' }).data,
        ).toEqual({ name: 'Rapid trio', notes: null });
        expect(isAccepted(copyGroupCreateSchema, { name: '' })).toBe(false);
        expect(
            isAccepted(copyGroupCreateSchema, { name: 'x'.repeat(65) }),
        ).toBe(false);
        expect(
            isAccepted(copyGroupCreateSchema, {
                name: 'A',
                notes: 'x'.repeat(2001),
            }),
        ).toBe(false);
    });

    it('updates by uuid id', () => {
        expect(
            isAccepted(copyGroupUpdateSchema, {
                id: randomUUID(),
                name: 'A',
                notes: null,
            }),
        ).toBe(true);
        expect(
            isAccepted(copyGroupUpdateSchema, {
                id: 'x',
                name: 'A',
                notes: null,
            }),
        ).toBe(false);
    });

    it('assigns an account to a group or to none', () => {
        expect(
            isAccepted(copyGroupAssignSchema, {
                accountId: ACCOUNT_ID,
                copyGroupId: randomUUID(),
            }),
        ).toBe(true);
        expect(
            isAccepted(copyGroupAssignSchema, {
                accountId: ACCOUNT_ID,
                copyGroupId: null,
            }),
        ).toBe(true);
        expect(
            isAccepted(copyGroupAssignSchema, { accountId: ACCOUNT_ID }),
        ).toBe(false);
    });
});

describe('decision schemas', () => {
    const VALID_DECISION = {
        acceptedRiskCents: 25_000,
        acceptedRungsCents: [25_000],
        accountId: ACCOUNT_ID,
        decidedOn: '2026-09-21',
        headlineRiskCents: 25_000,
        snapshotId: null,
        source: 'documented',
        stage: AccountStage.Funded,
    };

    it('accepts a decision with up to 20 positive rungs', () => {
        expect(isAccepted(decisionCreateSchema, VALID_DECISION)).toBe(true);
        expect(
            isAccepted(decisionCreateSchema, {
                ...VALID_DECISION,
                acceptedRungsCents: Array.from({ length: 21 }, () => 100),
            }),
        ).toBe(false);
        expect(
            isAccepted(decisionCreateSchema, {
                ...VALID_DECISION,
                acceptedRungsCents: [0],
            }),
        ).toBe(false);
        expect(
            isAccepted(decisionCreateSchema, {
                ...VALID_DECISION,
                snapshotId: 'x',
            }),
        ).toBe(false);
    });

    it('accepts only a known AdviceSource member, at most 32 characters', () => {
        for (const source of Object.values(AdviceSource)) {
            expect(source.length).toBeLessThanOrEqual(32);
            expect(
                isAccepted(decisionCreateSchema, { ...VALID_DECISION, source }),
            ).toBe(true);
        }
        expect(
            isAccepted(decisionCreateSchema, {
                ...VALID_DECISION,
                source: 'not-a-source',
            }),
        ).toBe(false);
    });

    it('records the actual risk as a non-negative amount', () => {
        expect(
            isAccepted(decisionRecordActualSchema, {
                actualRiskCents: 24_000,
                id: randomUUID(),
            }),
        ).toBe(true);
        expect(
            isAccepted(decisionRecordActualSchema, {
                actualRiskCents: -1,
                id: randomUUID(),
            }),
        ).toBe(false);
    });
});

describe('scenarioSaveSchema', () => {
    it('bounds the query to 8,192 characters and the name to 64', () => {
        expect(
            isAccepted(scenarioSaveSchema, {
                name: 'Base',
                query: 'x'.repeat(8192),
            }),
        ).toBe(true);
        expect(
            isAccepted(scenarioSaveSchema, {
                name: 'Base',
                query: 'x'.repeat(8193),
            }),
        ).toBe(false);
        expect(
            isAccepted(scenarioSaveSchema, { name: '', query: 'firm=mffu' }),
        ).toBe(false);
        expect(
            isAccepted(scenarioSaveSchema, {
                name: 'x'.repeat(65),
                query: 'firm=mffu',
            }),
        ).toBe(false);
    });
});
