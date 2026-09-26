import { getTableColumns, type Table } from 'drizzle-orm';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { type z } from 'zod';

import {
    AccountReadIssueKind,
    compareText,
    type PersonalRules,
    type StoredFirmId,
    UnresolvedPlanReason,
} from '~/lib/prop-accounts';
import { NO_PLAN_OPT_INS } from '~/lib/prop-calculator';
import {
    propAccountEventOutputSchema,
    propAccountListedOutputSchema,
    propAccountOutputSchema,
    propAccountSnapshotOutputSchema,
    propCopyGroupOutputSchema,
    propFeeOutputSchema,
    propPayoutOutputSchema,
    propSavedScenarioOutputSchema,
    propSizingDecisionOutputSchema,
} from '~/lib/schemas/propAccountOutputs';
import {
    propAccount,
    propAccountEvent,
    type PropAccountEventRow,
    type PropAccountRow,
    propAccountSnapshot,
    type PropAccountSnapshotRow,
    propCopyGroup,
    type PropCopyGroupRow,
    propFee,
    type PropFeeRow,
    propPayout,
    type PropPayoutRow,
    propSavedScenario,
    type PropSavedScenarioRow,
    propSizingDecision,
    type PropSizingDecisionRow,
} from '~/server/db/schemas/prop';

import {
    accountRow,
    copyGroupRow,
    decisionRow,
    eventRow,
    feeRow,
    payoutRow,
    scenarioRow,
    snapshotRow,
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

interface OutputCase {
    readonly derived?: Readonly<Record<string, unknown>>;
    readonly enumColumns: readonly string[];
    readonly jsonbColumns: readonly string[];
    readonly name: string;
    readonly row: Record<string, unknown>;
    readonly schema: z.ZodObject;
    readonly table: Table;
}

type StrictPersonalRules = z.infer<
    typeof propAccountOutputSchema
>['personalRules'];

function camelRow(row: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
            key.replaceAll(/_(\w)/g, (_, letter: string) =>
                letter.toUpperCase(),
            ),
            value,
        ]),
    );
}

const CASES: readonly OutputCase[] = [
    {
        derived: { readIssues: [] },
        enumColumns: ['dashboardConvention', 'stage', 'status'],
        jsonbColumns: ['optIns', 'personalRules', 'tags'],
        name: 'account',
        row: accountRow({
            opt_ins: {
                takesFundedReset: false,
                takesOneTimeEarlyWithdrawal: false,
            },
        }),
        schema: propAccountOutputSchema,
        table: propAccount,
    },
    {
        derived: { readIssues: [] },
        enumColumns: ['dashboardConvention', 'stage', 'status'],
        jsonbColumns: ['optIns', 'personalRules', 'tags'],
        name: 'listed account',
        row: accountRow({
            opt_ins: {
                takesFundedReset: false,
                takesOneTimeEarlyWithdrawal: false,
            },
        }),
        schema: propAccountListedOutputSchema,
        table: propAccount,
    },
    {
        enumColumns: ['source'],
        jsonbColumns: [],
        name: 'snapshot',
        row: snapshotRow(),
        schema: propAccountSnapshotOutputSchema,
        table: propAccountSnapshot,
    },
    {
        enumColumns: ['status'],
        jsonbColumns: [],
        name: 'payout',
        row: payoutRow(),
        schema: propPayoutOutputSchema,
        table: propPayout,
    },
    {
        enumColumns: ['kind'],
        jsonbColumns: [],
        name: 'fee',
        row: feeRow(),
        schema: propFeeOutputSchema,
        table: propFee,
    },
    {
        enumColumns: ['kind'],
        jsonbColumns: ['detail'],
        name: 'event',
        row: eventRow(),
        schema: propAccountEventOutputSchema,
        table: propAccountEvent,
    },
    {
        enumColumns: [],
        jsonbColumns: [],
        name: 'copy group',
        row: copyGroupRow(),
        schema: propCopyGroupOutputSchema,
        table: propCopyGroup,
    },
    {
        enumColumns: ['stage'],
        jsonbColumns: [],
        name: 'sizing decision',
        row: decisionRow(),
        schema: propSizingDecisionOutputSchema,
        table: propSizingDecision,
    },
    {
        enumColumns: [],
        jsonbColumns: [],
        name: 'saved scenario',
        row: scenarioRow(),
        schema: propSavedScenarioOutputSchema,
        table: propSavedScenario,
    },
];

describe('propAccounts output schemas', () => {
    it.each(CASES)(
        'the $name output schema has exactly the table columns and its derived fields',
        ({ derived = {}, schema, table }) => {
            const columns = Object.keys(getTableColumns(table));
            expect(Object.keys(schema.shape).toSorted(compareText)).toEqual(
                [...columns, ...Object.keys(derived)].toSorted(compareText),
            );
        },
    );

    it.each(CASES)(
        'the $name output schema parses a stored row',
        ({ derived = {}, row, schema }) => {
            expect(
                schema.safeParse({ ...camelRow(row), ...derived }).success,
            ).toBe(true);
        },
    );

    it.each(CASES.filter((entry) => entry.enumColumns.length > 0))(
        'the $name output schema rejects an unknown enum value',
        ({ derived = {}, enumColumns, row, schema }) => {
            for (const column of enumColumns) {
                const result = schema.safeParse({
                    ...camelRow(row),
                    ...derived,
                    [column]: 'not-a-member',
                });
                expect(result.success, column).toBe(false);
            }
        },
    );

    it.each(CASES.filter((entry) => entry.jsonbColumns.length > 0))(
        'the $name output schema rejects a malformed jsonb value',
        ({ derived = {}, jsonbColumns, row, schema }) => {
            for (const column of jsonbColumns) {
                const result = schema.safeParse({
                    ...camelRow(row),
                    ...derived,
                    [column]: 42,
                });
                expect(result.success, column).toBe(false);
            }
        },
    );

    it('passes a stored firm id through, known or removed, with the read issues that flag it', () => {
        const stored = {
            ...camelRow(accountRow()),
            firmId: 'gone-firm',
            optIns: NO_PLAN_OPT_INS,
            readIssues: [
                {
                    kind: AccountReadIssueKind.UnresolvablePlan,
                    reason: UnresolvedPlanReason.UnknownFirm,
                },
                { kind: AccountReadIssueKind.CorruptPersonalRules },
            ],
        };
        const parsed = propAccountOutputSchema.safeParse(stored);
        expect(parsed.success).toBe(true);
        expect(parsed.data?.firmId).toBe('gone-firm');
        expectTypeOf<
            z.output<typeof propAccountOutputSchema>['firmId']
        >().toEqualTypeOf<StoredFirmId>();
        expectTypeOf<
            z.output<typeof propAccountListedOutputSchema>['firmId']
        >().toEqualTypeOf<StoredFirmId>();
        for (const firmId of ['', 'x'.repeat(33), 42, null]) {
            expect(
                propAccountOutputSchema.safeParse({ ...stored, firmId })
                    .success,
                String(firmId),
            ).toBe(false);
        }
    });

    it('lets only the listed account output carry unreadable personal rules, as null', () => {
        const stored = {
            ...camelRow(accountRow()),
            optIns: NO_PLAN_OPT_INS,
            personalRules: null,
            readIssues: [{ kind: AccountReadIssueKind.CorruptPersonalRules }],
        };
        const listed = propAccountListedOutputSchema.safeParse(stored);
        expect(listed.success).toBe(true);
        expect(listed.data?.personalRules).toBeNull();
        expect(propAccountOutputSchema.safeParse(stored).success).toBe(false);
        expectTypeOf<
            z.infer<typeof propAccountListedOutputSchema>['personalRules']
        >().toEqualTypeOf<null | StrictPersonalRules>();
        expectTypeOf<StrictPersonalRules>().toExtend<PersonalRules>();
        expectTypeOf<null>().not.toExtend<StrictPersonalRules>();
    });

    it('rejects a missing, unknown or malformed read issue', () => {
        const stored = {
            ...camelRow(accountRow()),
            optIns: NO_PLAN_OPT_INS,
        };
        for (const readIssues of [
            undefined,
            [{ kind: 'not-a-kind' }],
            [
                {
                    kind: AccountReadIssueKind.UnresolvablePlan,
                    reason: 'not-a-reason',
                },
            ],
            [{ kind: AccountReadIssueKind.UnresolvablePlan }],
        ]) {
            expect(
                propAccountOutputSchema.safeParse({ ...stored, readIssues })
                    .success,
                JSON.stringify(readIssues),
            ).toBe(false);
        }
    });

    it('rejects fractional cents in money columns', () => {
        const payout = camelRow(payoutRow());
        const decision = camelRow(decisionRow());
        const fractionalGross = propPayoutOutputSchema.safeParse({
            ...payout,
            grossCents: 100.5,
        });
        const fractionalRung = propSizingDecisionOutputSchema.safeParse({
            ...decision,
            acceptedRungsCents: [1.5],
        });
        expect(fractionalGross.success).toBe(false);
        expect(fractionalRung.success).toBe(false);
    });

    it('infers types assignable to each table row type', () => {
        expectTypeOf<PropAccountRow['firmId']>().toEqualTypeOf<StoredFirmId>();
        expectTypeOf<
            z.infer<typeof propAccountOutputSchema>
        >().toExtend<PropAccountRow>();
        expectTypeOf<
            z.infer<typeof propAccountSnapshotOutputSchema>
        >().toExtend<PropAccountSnapshotRow>();
        expectTypeOf<
            z.infer<typeof propPayoutOutputSchema>
        >().toExtend<PropPayoutRow>();
        expectTypeOf<
            z.infer<typeof propFeeOutputSchema>
        >().toExtend<PropFeeRow>();
        expectTypeOf<
            z.infer<typeof propAccountEventOutputSchema>
        >().toExtend<PropAccountEventRow>();
        expectTypeOf<
            z.infer<typeof propCopyGroupOutputSchema>
        >().toExtend<PropCopyGroupRow>();
        expectTypeOf<
            z.infer<typeof propSizingDecisionOutputSchema>
        >().toExtend<PropSizingDecisionRow>();
        expectTypeOf<
            z.infer<typeof propSavedScenarioOutputSchema>
        >().toExtend<PropSavedScenarioRow>();
    });
});
