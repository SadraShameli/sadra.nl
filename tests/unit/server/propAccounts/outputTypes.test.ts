import { getTableColumns, type Table } from 'drizzle-orm';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { type z } from 'zod';

import {
    AccountEventKind,
    AccountReadIssueKind,
    AccountStage,
    AccountTracking,
    BankrollTransferKind,
    BustCause,
    compareText,
    FirmEngagementReason,
    FirmEngagementStatus,
    PayoutStatus,
    type PersonalRules,
    ReportedPayoutBasis,
    RuleViolationKind,
    type StoredFirmId,
    UnresolvedPlanReason,
    ViolationSource,
} from '~/lib/prop-accounts';
import { FirmId, NO_PLAN_OPT_INS } from '~/lib/prop-calculator';
import {
    propAccountEventOutputSchema,
    propAccountListedOutputSchema,
    propAccountOutputSchema,
    propAccountSnapshotOutputSchema,
    propBankrollTransferOutputSchema,
    propCopyGroupOutputSchema,
    propExternalFirmOutputSchema,
    propFeeOutputSchema,
    propFirmEngagementOutputSchema,
    propFirmStatementOutputSchema,
    propPayoutOutputSchema,
    propRoundOutputSchema,
    propRuleViolationOutputSchema,
    propSavedScenarioOutputSchema,
    propSizingDecisionOutputSchema,
} from '~/lib/schemas/propAccountOutputs';
import {
    bankrollTransferCreateSchema,
    bankrollTransferUpdateSchema,
    eventRecordSchema,
    externalFirmCreateSchema,
    externalFirmUpdateSchema,
    firmEngagementSetSchema,
    firmStatementCreateSchema,
    firmStatementUpdateSchema,
    payoutCreateSchema,
    payoutUpdateSchema,
    roundAssignSchema,
    roundCloseSchema,
    roundCreateSchema,
    roundUpdateSchema,
    violationCreateSchema,
    violationUpdateSchema,
    weeklyReviewSubmitSchema,
} from '~/lib/schemas/propAccounts';
import {
    propAccount,
    propAccountEvent,
    type PropAccountEventRow,
    type PropAccountRow,
    propAccountSnapshot,
    type PropAccountSnapshotRow,
    propBankrollTransfer,
    type PropBankrollTransferRow,
    propCopyGroup,
    type PropCopyGroupRow,
    propExternalFirm,
    type PropExternalFirmRow,
    propFee,
    type PropFeeRow,
    propFirmEngagement,
    type PropFirmEngagementRow,
    propFirmStatement,
    type PropFirmStatementRow,
    propPayout,
    type PropPayoutRow,
    propRound,
    type PropRoundRow,
    propRuleViolation,
    type PropRuleViolationRow,
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
import {
    bankrollTransferRow,
    externalFirmRow,
    firmEngagementRow,
    firmStatementRow,
    roundRow,
    VIDEO_IDS,
    violationRow,
} from './videoRecordFixtures';

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

const ACCOUNT_ID = VIDEO_IDS.account;
const EXTERNAL_FIRM_ID = VIDEO_IDS.externalFirm;
const DECISION_ID = VIDEO_IDS.decision;

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
        derived: { planRulesChanged: null, readIssues: [] },
        enumColumns: ['dashboardConvention', 'stage', 'status', 'tracking'],
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
        derived: { planRulesChanged: null, readIssues: [] },
        enumColumns: ['dashboardConvention', 'stage', 'status', 'tracking'],
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
        enumColumns: ['source', 'stage'],
        jsonbColumns: [],
        name: 'sizing decision',
        row: decisionRow(),
        schema: propSizingDecisionOutputSchema,
        table: propSizingDecision,
    },
    {
        enumColumns: ['kind'],
        jsonbColumns: [],
        name: 'bankroll transfer',
        row: bankrollTransferRow(),
        schema: propBankrollTransferOutputSchema,
        table: propBankrollTransfer,
    },
    {
        enumColumns: [],
        jsonbColumns: [],
        name: 'external firm',
        row: externalFirmRow(),
        schema: propExternalFirmOutputSchema,
        table: propExternalFirm,
    },
    {
        enumColumns: ['status'],
        jsonbColumns: [],
        name: 'round',
        row: roundRow(),
        schema: propRoundOutputSchema,
        table: propRound,
    },
    {
        enumColumns: ['reason', 'status'],
        jsonbColumns: [],
        name: 'firm engagement',
        row: firmEngagementRow(),
        schema: propFirmEngagementOutputSchema,
        table: propFirmEngagement,
    },
    {
        enumColumns: ['basis'],
        jsonbColumns: [],
        name: 'firm statement',
        row: firmStatementRow(),
        schema: propFirmStatementOutputSchema,
        table: propFirmStatement,
    },
    {
        enumColumns: ['kind', 'source'],
        jsonbColumns: [],
        name: 'rule violation',
        row: violationRow(),
        schema: propRuleViolationOutputSchema,
        table: propRuleViolation,
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
        >().toEqualTypeOf<null | StoredFirmId>();
        expectTypeOf<
            z.output<typeof propAccountListedOutputSchema>['firmId']
        >().toEqualTypeOf<null | StoredFirmId>();
        for (const firmId of ['', 'x'.repeat(33), 42, null]) {
            expect(
                propAccountOutputSchema.safeParse({ ...stored, firmId })
                    .success,
                String(firmId),
            ).toBe(false);
        }
    });

    it('types the tracking column and accepts a ledger-only account at a listed or an external firm', () => {
        expectTypeOf<
            z.output<typeof propAccountOutputSchema>['tracking']
        >().toEqualTypeOf<AccountTracking>();
        const ledgerOnly = {
            ...camelRow(accountRow()),
            optIns: NO_PLAN_OPT_INS,
            planLabel: 'Rapid 150K',
            planSerial: null,
            readIssues: [],
            tracking: AccountTracking.LedgerOnly,
        };
        for (const schema of [
            propAccountOutputSchema,
            propAccountListedOutputSchema,
        ]) {
            expect(schema.safeParse(ledgerOnly).success).toBe(true);
            expect(
                schema.safeParse({
                    ...ledgerOnly,
                    externalFirmId: EXTERNAL_FIRM_ID,
                    firmId: null,
                }).success,
            ).toBe(true);
        }
    });

    it.each([
        ['a modeled account without a plan serial', { planSerial: null }],
        ['a modeled account with a plan label', { planLabel: 'Rapid 150K' }],
        [
            'a ledger-only account without a plan label',
            { planSerial: null, tracking: AccountTracking.LedgerOnly },
        ],
        [
            'a ledger-only account at both a listed and an external firm',
            {
                externalFirmId: EXTERNAL_FIRM_ID,
                planLabel: 'Rapid 150K',
                planSerial: null,
                tracking: AccountTracking.LedgerOnly,
            },
        ],
    ] as const)('rejects %s in the account outputs', (_name, overrides) => {
        const stored = {
            ...camelRow(accountRow()),
            optIns: NO_PLAN_OPT_INS,
            readIssues: [],
            ...overrides,
        };
        expect(propAccountOutputSchema.safeParse(stored).success).toBe(false);
        expect(propAccountListedOutputSchema.safeParse(stored).success).toBe(
            false,
        );
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
        expectTypeOf<
            PropAccountRow['firmId']
        >().toEqualTypeOf<null | StoredFirmId>();
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
        expectTypeOf<
            z.infer<typeof propBankrollTransferOutputSchema>
        >().toExtend<PropBankrollTransferRow>();
        expectTypeOf<
            z.infer<typeof propExternalFirmOutputSchema>
        >().toExtend<PropExternalFirmRow>();
        expectTypeOf<
            z.infer<typeof propRoundOutputSchema>
        >().toExtend<PropRoundRow>();
        expectTypeOf<
            z.infer<typeof propFirmEngagementOutputSchema>
        >().toExtend<PropFirmEngagementRow>();
        expectTypeOf<
            z.infer<typeof propFirmStatementOutputSchema>
        >().toExtend<PropFirmStatementRow>();
        expectTypeOf<
            z.infer<typeof propRuleViolationOutputSchema>
        >().toExtend<PropRuleViolationRow>();
    });

    it('bounds the money columns of the video records', () => {
        const cases: [z.ZodType, Record<string, unknown>, string, number][] = [
            [
                propBankrollTransferOutputSchema,
                bankrollTransferRow(),
                'amountCents',
                0,
            ],
            [propRoundOutputSchema, roundRow(), 'budgetCents', 0],
            [
                propFirmStatementOutputSchema,
                firmStatementRow(),
                'reportedPayoutCents',
                -1,
            ],
            [propRuleViolationOutputSchema, violationRow(), 'costCents', 0.5],
        ];
        for (const [schema, row, column, value] of cases) {
            const stored = { ...camelRow(row), [column]: value };
            expect(schema.safeParse(stored).success, column).toBe(false);
        }
        const signedCost = { ...camelRow(violationRow()), costCents: -12_000 };
        expect(
            propRuleViolationOutputSchema.safeParse(signedCost).success,
        ).toBe(true);
    });

    it('carries a stored firm id or an external firm on the firm-keyed records', () => {
        expectTypeOf<
            z.output<typeof propRoundOutputSchema>['firmId']
        >().toEqualTypeOf<null | StoredFirmId>();
        expectTypeOf<
            z.output<typeof propFirmEngagementOutputSchema>['firmId']
        >().toEqualTypeOf<null | StoredFirmId>();
        expectTypeOf<
            z.output<typeof propFirmStatementOutputSchema>['firmId']
        >().toEqualTypeOf<null | StoredFirmId>();
        const round = camelRow(roundRow());
        expect(
            propRoundOutputSchema.safeParse({ ...round, firmId: '' }).success,
        ).toBe(false);
        expect(
            propRoundOutputSchema.safeParse({ ...round, firmId: 'gone-firm' })
                .success,
        ).toBe(true);
    });

    it('reads a bust cause from the event detail and rejects an unknown one', () => {
        const event = camelRow(eventRow({ kind: AccountEventKind.Busted }));
        const withCause = propAccountEventOutputSchema.safeParse({
            ...event,
            detail: {
                bustCause: BustCause.MaxDrawdown,
                changes: [],
                note: null,
            },
        });
        expect(withCause.success).toBe(true);
        expect(withCause.data?.detail.bustCause).toBe(BustCause.MaxDrawdown);
        expect(
            propAccountEventOutputSchema.safeParse({
                ...event,
                detail: { bustCause: 'bad-luck', changes: [], note: null },
            }).success,
        ).toBe(false);
    });
});

const ID = '22222222-2222-4222-8222-222222222222';

function engagementIssuePaths(input: unknown): string[] {
    return (
        firmEngagementSetSchema
            .safeParse(input)
            .error?.issues.map((issue) => issue.path.join('.')) ?? []
    );
}

function isAccepted(schema: z.ZodType, input: unknown): boolean {
    return schema.safeParse(input).success;
}

function without(value: object, omitted: string): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== omitted),
    );
}

describe('propAccounts video record input schemas', () => {
    it('records a bankroll transfer with a positive whole-cent amount on a real date', () => {
        const valid = {
            amountCents: 500_000,
            kind: BankrollTransferKind.Deposit,
            occurredOn: '2026-09-01',
        };
        expect(bankrollTransferCreateSchema.parse(valid)).toEqual({
            ...valid,
            note: null,
        });
        for (const amountCents of [0, -1, 1.5, 2_147_483_648]) {
            expect(
                isAccepted(bankrollTransferCreateSchema, {
                    ...valid,
                    amountCents,
                }),
                String(amountCents),
            ).toBe(false);
        }
        expect(
            isAccepted(bankrollTransferCreateSchema, {
                ...valid,
                occurredOn: '2026-02-30',
            }),
        ).toBe(false);
        expect(
            isAccepted(bankrollTransferCreateSchema, {
                ...valid,
                kind: 'gift',
            }),
        ).toBe(false);
        expect(
            isAccepted(bankrollTransferCreateSchema, {
                ...valid,
                note: 'x'.repeat(501),
            }),
        ).toBe(false);
        expect(
            isAccepted(bankrollTransferUpdateSchema, {
                ...valid,
                id: ID,
                note: null,
            }),
        ).toBe(true);
        expect(
            isAccepted(bankrollTransferUpdateSchema, { ...valid, id: ID }),
        ).toBe(false);
    });

    it('names an external firm on one line of 1 to 64 characters', () => {
        expect(
            externalFirmCreateSchema.parse({ name: '  Hola Prime ' }),
        ).toEqual({
            name: 'Hola Prime',
            notes: null,
        });
        for (const name of ['', ' '.repeat(3), 'x'.repeat(65), 'Hola\nPrime']) {
            expect(
                isAccepted(externalFirmCreateSchema, { name }),
                JSON.stringify(name),
            ).toBe(false);
        }
        expect(
            isAccepted(externalFirmUpdateSchema, {
                id: ID,
                name: 'Funded Seat',
                notes: null,
            }),
        ).toBe(true);
        expect(
            isAccepted(externalFirmUpdateSchema, {
                id: ID,
                name: 'Funded Seat',
            }),
        ).toBe(false);
    });

    it('opens a round with exactly one firm and an optional positive budget', () => {
        const valid = { label: 'September round', openedOn: '2026-09-01' };
        expect(
            roundCreateSchema.parse({ ...valid, firmId: FirmId.Mffu }),
        ).toEqual({
            ...valid,
            budgetCents: null,
            externalFirmId: null,
            firmId: FirmId.Mffu,
            notes: null,
        });
        expect(isAccepted(roundCreateSchema, valid)).toBe(false);
        expect(
            isAccepted(roundCreateSchema, { ...valid, firmId: FirmId.Mffu }),
        ).toBe(true);
        expect(
            isAccepted(roundCreateSchema, {
                ...valid,
                externalFirmId: EXTERNAL_FIRM_ID,
            }),
        ).toBe(true);
        expect(
            isAccepted(roundCreateSchema, {
                ...valid,
                externalFirmId: EXTERNAL_FIRM_ID,
                firmId: FirmId.Mffu,
            }),
        ).toBe(false);
        expect(
            isAccepted(roundCreateSchema, { ...valid, firmId: 'gone-firm' }),
        ).toBe(false);
        for (const budgetCents of [0, -100, 10.5]) {
            expect(
                isAccepted(roundCreateSchema, {
                    ...valid,
                    budgetCents,
                    firmId: FirmId.Mffu,
                }),
                String(budgetCents),
            ).toBe(false);
        }
        expect(
            isAccepted(roundUpdateSchema, {
                ...valid,
                budgetCents: null,
                externalFirmId: null,
                firmId: FirmId.Mffu,
                id: ID,
                notes: null,
            }),
        ).toBe(true);
        expect(isAccepted(roundUpdateSchema, { ...valid, id: ID })).toBe(false);
        expect(
            isAccepted(roundUpdateSchema, {
                ...valid,
                budgetCents: null,
                externalFirmId: null,
                firmId: null,
                id: ID,
                notes: null,
            }),
        ).toBe(false);
    });

    it('closes a round on a real date and assigns an account to a round or none, with the budget override off by default', () => {
        expect(
            isAccepted(roundCloseSchema, { closedOn: '2026-09-30', id: ID }),
        ).toBe(true);
        expect(
            isAccepted(roundCloseSchema, { closedOn: '2026-09-31', id: ID }),
        ).toBe(false);
        expect(
            roundAssignSchema.parse({ accountId: ACCOUNT_ID, roundId: ID }),
        ).toEqual({
            accountId: ACCOUNT_ID,
            overrideRoundBudget: false,
            roundId: ID,
        });
        expect(
            isAccepted(roundAssignSchema, {
                accountId: ACCOUNT_ID,
                roundId: null,
            }),
        ).toBe(true);
        expect(isAccepted(roundAssignSchema, { accountId: ACCOUNT_ID })).toBe(
            false,
        );
    });

    it('sets a firm engagement for exactly one firm, with a reason unless Active', () => {
        const valid = {
            firmId: FirmId.Mffu,
            sinceOn: '2026-09-21',
            status: FirmEngagementStatus.Active,
        };
        expect(firmEngagementSetSchema.parse(valid)).toEqual({
            ...valid,
            externalFirmId: null,
            note: null,
            reason: null,
            sentLiveOn: null,
        });
        expect(
            isAccepted(firmEngagementSetSchema, {
                ...valid,
                reason: FirmEngagementReason.SentLive,
                sentLiveOn: '2026-09-20',
                status: FirmEngagementStatus.Retired,
            }),
        ).toBe(true);
        expect(
            isAccepted(firmEngagementSetSchema, {
                ...valid,
                status: FirmEngagementStatus.Paused,
            }),
        ).toBe(false);
        expect(
            isAccepted(firmEngagementSetSchema, {
                ...valid,
                externalFirmId: EXTERNAL_FIRM_ID,
            }),
        ).toBe(false);
        expect(
            isAccepted(firmEngagementSetSchema, {
                ...valid,
                firmId: null,
            }),
        ).toBe(false);
        expect(
            isAccepted(firmEngagementSetSchema, {
                ...valid,
                externalFirmId: EXTERNAL_FIRM_ID,
                firmId: null,
            }),
        ).toBe(true);
    });

    it('keeps a reason off an Active firm and a sent-live date exactly on a SentLive reason, on or before the status date', () => {
        const retired = {
            firmId: FirmId.Mffu,
            reason: FirmEngagementReason.SentLive,
            sentLiveOn: '2026-09-20',
            sinceOn: '2026-09-21',
            status: FirmEngagementStatus.Retired,
        };
        expect(engagementIssuePaths(retired)).toEqual([]);
        expect(
            engagementIssuePaths({ ...retired, sentLiveOn: retired.sinceOn }),
        ).toEqual([]);
        expect(
            engagementIssuePaths({
                ...retired,
                status: FirmEngagementStatus.Active,
            }),
        ).toEqual(['reason']);
        expect(engagementIssuePaths({ ...retired, sentLiveOn: null })).toEqual([
            'sentLiveOn',
        ]);
        expect(
            engagementIssuePaths({
                ...retired,
                reason: FirmEngagementReason.LiveCooldown,
            }),
        ).toEqual(['sentLiveOn']);
        expect(
            engagementIssuePaths({
                ...retired,
                reason: null,
                status: FirmEngagementStatus.Active,
            }),
        ).toEqual(['sentLiveOn']);
        expect(
            engagementIssuePaths({ ...retired, sentLiveOn: '2026-09-22' }),
        ).toEqual(['sentLiveOn']);
    });

    it('records a firm statement for exactly one firm with a required basis and a non-negative total', () => {
        const valid = {
            asOf: '2026-09-21',
            basis: ReportedPayoutBasis.Net,
            firmId: FirmId.Mffu,
            reportedPayoutCents: 1_250_000,
        };
        expect(firmStatementCreateSchema.parse(valid)).toEqual({
            ...valid,
            externalFirmId: null,
            note: null,
        });
        expect(
            isAccepted(firmStatementCreateSchema, without(valid, 'basis')),
        ).toBe(false);
        expect(
            isAccepted(firmStatementCreateSchema, {
                ...valid,
                reportedPayoutCents: 0,
            }),
        ).toBe(true);
        expect(
            isAccepted(firmStatementCreateSchema, {
                ...valid,
                reportedPayoutCents: -1,
            }),
        ).toBe(false);
        expect(
            isAccepted(firmStatementCreateSchema, {
                ...valid,
                externalFirmId: EXTERNAL_FIRM_ID,
            }),
        ).toBe(false);
        expect(
            isAccepted(firmStatementCreateSchema, { ...valid, firmId: null }),
        ).toBe(false);
        const rest = without(valid, 'firmId');
        expect(
            isAccepted(firmStatementUpdateSchema, {
                ...rest,
                id: ID,
                note: null,
            }),
        ).toBe(true);
        expect(
            isAccepted(firmStatementUpdateSchema, {
                ...rest,
                firmId: FirmId.Mffu,
                id: ID,
                note: null,
            }),
        ).toBe(false);
    });

    it('logs a violation by hand with a signed cost and an optional decision, never as Detected', () => {
        const valid = {
            accountId: ACCOUNT_ID,
            kind: RuleViolationKind.ForcedRecovery,
            occurredOn: '2026-09-21',
        };
        expect(violationCreateSchema.parse(valid)).toEqual({
            ...valid,
            costCents: null,
            decisionId: null,
            note: null,
        });
        expect(
            isAccepted(violationCreateSchema, { ...valid, costCents: -12_000 }),
        ).toBe(true);
        expect(
            isAccepted(violationCreateSchema, { ...valid, costCents: 1.5 }),
        ).toBe(false);
        expect(
            isAccepted(violationCreateSchema, {
                ...valid,
                source: ViolationSource.Detected,
            }),
        ).toBe(false);
        expect(
            isAccepted(violationCreateSchema, {
                ...valid,
                decisionId: 'not-a-uuid',
            }),
        ).toBe(false);
        expect(
            isAccepted(violationCreateSchema, { ...valid, kind: 'bad-day' }),
        ).toBe(false);
        const rest = without(valid, 'accountId');
        expect(
            isAccepted(violationUpdateSchema, {
                ...rest,
                costCents: null,
                decisionId: DECISION_ID,
                id: ID,
                note: null,
            }),
        ).toBe(true);
        expect(isAccepted(violationUpdateSchema, { ...rest, id: ID })).toBe(
            false,
        );
    });

    it('orders a payout approval date between the request and the payment', () => {
        const payout = {
            accountId: ACCOUNT_ID,
            grossCents: 100_000,
            paidOn: '2026-09-14',
            requestedOn: '2026-09-10',
            status: PayoutStatus.Paid,
        };
        expect(payoutCreateSchema.parse(payout)).not.toHaveProperty(
            'approvedOn',
        );
        expect(
            isAccepted(payoutCreateSchema, { ...payout, approvedOn: null }),
        ).toBe(true);
        expect(
            isAccepted(payoutCreateSchema, {
                ...payout,
                approvedOn: '2026-09-12',
            }),
        ).toBe(true);
        expect(
            isAccepted(payoutCreateSchema, {
                ...payout,
                approvedOn: '2026-09-09',
            }),
        ).toBe(false);
        expect(
            isAccepted(payoutCreateSchema, {
                ...payout,
                approvedOn: '2026-09-15',
            }),
        ).toBe(false);
        const edit = without(payout, 'accountId');
        const update = { ...edit, id: ID, netCents: null, note: null };
        expect(payoutUpdateSchema.parse(update)).not.toHaveProperty(
            'approvedOn',
        );
        expect(
            isAccepted(payoutUpdateSchema, { ...update, approvedOn: null }),
        ).toBe(true);
        expect(
            isAccepted(payoutUpdateSchema, {
                ...update,
                approvedOn: '2026-09-09',
            }),
        ).toBe(false);
    });

    it('takes a bust cause only on a Busted event', () => {
        const busted = {
            accountId: ACCOUNT_ID,
            kind: AccountEventKind.Busted,
            occurredOn: '2026-09-21',
        };
        expect(
            eventRecordSchema.parse({
                ...busted,
                bustCause: BustCause.DailyLossLimit,
            }).bustCause,
        ).toBe(BustCause.DailyLossLimit);
        expect(eventRecordSchema.parse(busted)).not.toHaveProperty('bustCause');
        expect(
            isAccepted(eventRecordSchema, {
                ...busted,
                bustCause: BustCause.MaxDrawdown,
                kind: AccountEventKind.EvalPassed,
            }),
        ).toBe(false);
        expect(
            isAccepted(eventRecordSchema, { ...busted, bustCause: 'bad-luck' }),
        ).toBe(false);
    });

    it('rejects a weekly review decision for an account without a snapshot in the batch', () => {
        const snapshot = {
            accountId: ACCOUNT_ID,
            balanceCents: 5_050_000,
        };
        const decision = {
            acceptedRiskCents: 40_000,
            acceptedRungsCents: [40_000],
            accountId: ACCOUNT_ID,
            headlineRiskCents: 40_000,
            stage: AccountStage.Eval,
        };
        expect(
            isAccepted(weeklyReviewSubmitSchema, {
                asOf: '2026-09-21',
                decisions: [decision],
                snapshots: [snapshot],
            }),
        ).toBe(true);
        expect(
            isAccepted(weeklyReviewSubmitSchema, {
                asOf: '2026-09-21',
                decisions: [{ ...decision, accountId: VIDEO_IDS.round }],
                snapshots: [snapshot],
            }),
        ).toBe(false);
        expect(
            isAccepted(weeklyReviewSubmitSchema, {
                asOf: '2026-09-21',
                decisions: [],
                snapshots: [snapshot, snapshot],
            }),
        ).toBe(false);
    });
});
