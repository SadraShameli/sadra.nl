import { z } from 'zod';

import {
    AccountEventKind,
    AccountStage,
    addCalendarYears,
    addIsoDays,
    DashboardBalanceConvention,
    describeLifecycleRejection,
    FeeKind,
    isAccountDate,
    latestIsoDateAnywhere,
    MAX_ACCOUNT_DATE_YEAR,
    MAX_EVENT_NOTE_LENGTH,
    MIN_ACCOUNT_DATE_YEAR,
    nonNegativeUsdCentsSchema,
    PayoutStatus,
    personalRulesSchema,
    planKeyShape,
    positiveUsdCentsSchema,
    refinePlanKey,
    SnapshotSource,
    usdCentsSchema,
    validateStageForPlan,
} from '~/lib/prop-accounts';
import { FirmId } from '~/lib/prop-calculator';

export const MAX_ACCOUNT_LABEL_LENGTH = 64;
export const MAX_ACCOUNT_TAGS = 20;
export const MAX_ACCOUNT_TAG_LENGTH = 32;
export const MAX_ACCOUNT_NOTES_LENGTH = 2000;
export const MAX_LEDGER_NOTE_LENGTH = 500;
export const MAX_IMPORT_ROWS = 200;
export const MAX_BULK_SNAPSHOTS = 200;
export const MAX_PAYOUTS_TAKEN = 1000;
export const MAX_TRADING_DAYS = 10_000;
export const MAX_ACCEPTED_RUNGS = 20;
export const MAX_SCENARIO_NAME_LENGTH = 64;
export const MAX_SCENARIO_QUERY_LENGTH = 8192;
export const MAX_EVENT_LIST_YEARS = 3;

const MAX_ADVICE_SOURCE_LENGTH = 32;

const CONTROL_CHARACTER = /\p{Cc}/u;
const NOTE_LINE_CONTROL = /^[\t\n\r]$/u;
const FORMAT_CHARACTER = /\p{Cf}/u;
const WORD_JOINER = /^(?:\u{200C}|\u{200D})$/u;
const ZERO_WIDTH_NON_JOINER = '\u{200C}';
const ZERO_WIDTH_JOINER = '\u{200D}';
const EMOJI_PRESENTATION_SELECTOR = '\u{FE0F}';
const LINE_OR_PARAGRAPH_SEPARATOR = /[\p{Zl}\p{Zp}]/u;
const INVISIBLE_CHARACTER = /[\p{Default_Ignorable_Code_Point}\u{2800}]/u;
const VARIATION_SELECTOR = /^\p{Variation_Selector}$/u;
const PRESENTATION_SELECTOR = /^[\u{FE0E}\u{FE0F}]$/u;
const EMOJI = /^\p{Extended_Pictographic}$/u;
const EMOJI_MODIFIER = /^\p{Emoji_Modifier}$/u;
const LETTER = /^\p{L}$/u;
const LETTER_OR_MARK = /^[\p{L}\p{M}]$/u;

const UNSAFE_NOTE_MESSAGE =
    'must not contain control, bidirectional or zero-width characters other than word joiners';
const UNSAFE_SINGLE_LINE_MESSAGE =
    'must be one line without control, bidirectional or invisible characters';
const UNSAFE_QUERY_MESSAGE = 'must not contain control characters';

interface Neighbours {
    readonly next: string | undefined;
    readonly previous: string | undefined;
}

export const accountDateSchema = z.iso.date().refine(isAccountDate, {
    message: `must be a date from ${MIN_ACCOUNT_DATE_YEAR} through ${MAX_ACCOUNT_DATE_YEAR}`,
});

function controlFreeTextSchema(maxLength: number) {
    return z
        .string()
        .max(maxLength)
        .refine((text) => !CONTROL_CHARACTER.test(text), {
            message: UNSAFE_QUERY_MESSAGE,
        });
}

function hasNoCharacter(
    text: string,
    isUnsafe: (character: string, neighbours: Neighbours) => boolean,
): boolean {
    const characters = Array.from(text);
    return characters.every(
        (character, index) =>
            !isUnsafe(character, {
                next: characters[index + 1],
                previous: characters[index - 1],
            }),
    );
}

function isEmojiJoinable(character: string | undefined): boolean {
    return (
        character !== undefined &&
        (EMOJI.test(character) ||
            EMOJI_MODIFIER.test(character) ||
            character === EMOJI_PRESENTATION_SELECTOR)
    );
}

function isMatch(pattern: RegExp, character: string | undefined): boolean {
    return character !== undefined && pattern.test(character);
}

function isStrayVariationSelector(
    character: string,
    { previous }: Neighbours,
): boolean {
    return !PRESENTATION_SELECTOR.test(character) || !isMatch(EMOJI, previous);
}

function isUnsafeNoteCharacter(
    character: string,
    neighbours: Neighbours,
): boolean {
    if (VARIATION_SELECTOR.test(character)) {
        return isStrayVariationSelector(character, neighbours);
    }
    return CONTROL_CHARACTER.test(character)
        ? !NOTE_LINE_CONTROL.test(character)
        : FORMAT_CHARACTER.test(character) && !WORD_JOINER.test(character);
}

function isUnsafeSingleLineCharacter(
    character: string,
    neighbours: Neighbours,
): boolean {
    if (VARIATION_SELECTOR.test(character)) {
        return isStrayVariationSelector(character, neighbours);
    }
    switch (character) {
        case ZERO_WIDTH_JOINER: {
            return !(
                isEmojiJoinable(neighbours.previous) &&
                isMatch(EMOJI, neighbours.next)
            );
        }
        case ZERO_WIDTH_NON_JOINER: {
            return !(
                isMatch(LETTER_OR_MARK, neighbours.previous) &&
                isMatch(LETTER, neighbours.next)
            );
        }
        default: {
            return (
                CONTROL_CHARACTER.test(character) ||
                LINE_OR_PARAGRAPH_SEPARATOR.test(character) ||
                FORMAT_CHARACTER.test(character) ||
                INVISIBLE_CHARACTER.test(character)
            );
        }
    }
}

function noteTextSchema(maxLength: number) {
    return z
        .string()
        .max(maxLength)
        .refine((text) => hasNoCharacter(text, isUnsafeNoteCharacter), {
            message: UNSAFE_NOTE_MESSAGE,
        });
}

function singleLineTextSchema(maxLength: number) {
    return z
        .string()
        .trim()
        .min(1)
        .max(maxLength)
        .refine((text) => hasNoCharacter(text, isUnsafeSingleLineCharacter), {
            message: UNSAFE_SINGLE_LINE_MESSAGE,
        });
}

const idSchema = z.uuid().transform((id) => id.toLowerCase());
const accountLabelSchema = singleLineTextSchema(MAX_ACCOUNT_LABEL_LENGTH);
const accountNotesSchema = noteTextSchema(MAX_ACCOUNT_NOTES_LENGTH);
const ledgerNoteSchema = noteTextSchema(MAX_LEDGER_NOTE_LENGTH);
const eventNoteSchema = noteTextSchema(MAX_EVENT_NOTE_LENGTH);
const dayCountSchema = z.number().int().min(0).max(MAX_TRADING_DAYS);

const accountEditableShape = {
    ...planKeyShape,
    copyGroupId: idSchema.nullable(),
    dashboardConvention: z.enum(DashboardBalanceConvention),
    externalAlias: singleLineTextSchema(MAX_ACCOUNT_LABEL_LENGTH).nullable(),
    firstFundedTradeOn: accountDateSchema.nullable(),
    fundedOn: accountDateSchema.nullable(),
    label: accountLabelSchema,
    liveStartBalanceCents: nonNegativeUsdCentsSchema.nullable(),
    notes: accountNotesSchema.nullable(),
    personalRules: personalRulesSchema,
    purchasedOn: accountDateSchema,
    replacesAccountId: idSchema.nullable(),
    tags: z
        .array(singleLineTextSchema(MAX_ACCOUNT_TAG_LENGTH))
        .max(MAX_ACCOUNT_TAGS),
};

interface AccountDateFields {
    readonly firstFundedTradeOn: null | string;
    readonly fundedOn: null | string;
    readonly purchasedOn: string;
}

function refineAccountDates(
    account: AccountDateFields,
    context: z.RefinementCtx,
): void {
    if (account.fundedOn !== null && account.fundedOn < account.purchasedOn) {
        context.addIssue({
            code: 'custom',
            message: 'an account cannot be funded before it was purchased',
            path: ['fundedOn'],
        });
    }
    const earliestFirstTrade = account.fundedOn ?? account.purchasedOn;
    if (
        account.firstFundedTradeOn !== null &&
        account.firstFundedTradeOn < earliestFirstTrade
    ) {
        context.addIssue({
            code: 'custom',
            message:
                account.fundedOn === null
                    ? 'the first funded trade cannot be before the purchase date'
                    : 'the first funded trade cannot be before the funded date',
            path: ['firstFundedTradeOn'],
        });
    }
}

const idInputShape = { id: idSchema };

export const entityIdSchema = z.object(idInputShape);

export const accountIdSchema = z.object(idInputShape);

export const accountListSchema = z.object({
    firmId: z.enum(FirmId).optional(),
    includeArchived: z.boolean().default(false),
    stage: z.enum(AccountStage).optional(),
});

export const accountCreateSchema = z
    .object({
        ...accountEditableShape,
        copyGroupId: accountEditableShape.copyGroupId.default(null),
        externalAlias: accountEditableShape.externalAlias.default(null),
        firstFundedTradeOn:
            accountEditableShape.firstFundedTradeOn.default(null),
        fundedOn: accountEditableShape.fundedOn.default(null),
        liveStartBalanceCents:
            accountEditableShape.liveStartBalanceCents.default(null),
        notes: accountEditableShape.notes.default(null),
        personalRules: accountEditableShape.personalRules.default({}),
        replacesAccountId: accountEditableShape.replacesAccountId.default(null),
        stage: z.enum(AccountStage),
        tags: accountEditableShape.tags.default([]),
    })
    .superRefine((account, context) => {
        refineAccountDates(account, context);
        const plan = refinePlanKey(account, context);
        if (plan === null) return;
        const rejection = validateStageForPlan(account.stage, plan);
        if (rejection !== null) {
            context.addIssue({
                code: 'custom',
                message: describeLifecycleRejection(rejection, {
                    facts: plan,
                    stage: account.stage,
                }),
                path: ['stage'],
            });
        }
    });

export const accountUpdateSchema = z
    .strictObject({ ...accountEditableShape, id: idSchema })
    .superRefine((account, context) => {
        refineAccountDates(account, context);
        refinePlanKey(account, context);
        if (account.replacesAccountId === account.id) {
            context.addIssue({
                code: 'custom',
                message: 'an account cannot replace itself',
                path: ['replacesAccountId'],
            });
        }
    });

export const importAccountsSchema = z
    .array(accountCreateSchema)
    .min(1)
    .max(MAX_IMPORT_ROWS);

export const snapshotCreateSchema = z.object({
    accountId: idSchema,
    asOf: accountDateSchema,
    balanceAtLastPayoutCents: usdCentsSchema.nullable().default(null),
    balanceCents: usdCentsSchema,
    cumulativePayoutCents: nonNegativeUsdCentsSchema.nullable().default(null),
    cycleBestDayProfitCents: nonNegativeUsdCentsSchema.nullable().default(null),
    dashboardFloorCents: usdCentsSchema.nullable().default(null),
    evalBestDayProfitCents: nonNegativeUsdCentsSchema.nullable().default(null),
    floorAtLastPayoutCents: usdCentsSchema.nullable().default(null),
    highestEodBalanceCents: usdCentsSchema.nullable().default(null),
    highestIntradayBalanceCents: usdCentsSchema.nullable().default(null),
    lastPayoutOn: accountDateSchema.nullable().default(null),
    lastTradedOn: accountDateSchema.nullable().default(null),
    payoutsTaken: z
        .number()
        .int()
        .min(0)
        .max(MAX_PAYOUTS_TAKEN)
        .nullable()
        .default(null),
    qualifyingDaysSinceLastPayout: dayCountSchema.nullable().default(null),
    source: z.enum(SnapshotSource),
    tradingDays: dayCountSchema.nullable().default(null),
});

export const snapshotBulkCreateSchema = z
    .array(snapshotCreateSchema)
    .min(1)
    .max(MAX_BULK_SNAPSHOTS)
    .superRefine((snapshots, context) => {
        const seen = new Set<string>();
        for (const [index, snapshot] of snapshots.entries()) {
            const key = `${snapshot.accountId} ${snapshot.asOf}`;
            if (seen.has(key)) {
                context.addIssue({
                    code: 'custom',
                    message:
                        'one batch holds only one snapshot per account and date',
                    path: [index, 'asOf'],
                });
            }
            seen.add(key);
        }
    });

const payoutEditableShape = {
    grossCents: positiveUsdCentsSchema,
    netCents: nonNegativeUsdCentsSchema.nullable(),
    note: ledgerNoteSchema.nullable(),
    paidOn: accountDateSchema.nullable(),
    requestedOn: accountDateSchema,
    status: z.enum(PayoutStatus),
};

interface PayoutConsistencyFields {
    readonly grossCents: number;
    readonly netCents: null | number;
    readonly paidOn: null | string;
    readonly requestedOn: string;
    readonly status: PayoutStatus;
}

function refinePayoutConsistency(
    payout: PayoutConsistencyFields,
    context: z.RefinementCtx,
): void {
    const isPaid = payout.status === PayoutStatus.Paid;
    if (isPaid && payout.paidOn === null) {
        context.addIssue({
            code: 'custom',
            message: 'a paid payout needs its paid date',
            path: ['paidOn'],
        });
    }
    if (!isPaid && payout.paidOn !== null) {
        context.addIssue({
            code: 'custom',
            message: 'only a paid payout has a paid date',
            path: ['paidOn'],
        });
    }
    if (payout.paidOn !== null && payout.paidOn < payout.requestedOn) {
        context.addIssue({
            code: 'custom',
            message: 'a payout cannot be paid before it was requested',
            path: ['paidOn'],
        });
    }
    if (payout.netCents !== null && payout.netCents > payout.grossCents) {
        context.addIssue({
            code: 'custom',
            message: 'the net amount cannot exceed the gross amount',
            path: ['netCents'],
        });
    }
}

export const payoutCreateSchema = z
    .object({
        ...payoutEditableShape,
        accountId: idSchema,
        netCents: payoutEditableShape.netCents.default(null),
        note: payoutEditableShape.note.default(null),
        paidOn: payoutEditableShape.paidOn.default(null),
    })
    .superRefine(refinePayoutConsistency);

export const payoutUpdateSchema = z
    .strictObject({ ...payoutEditableShape, id: idSchema })
    .superRefine(refinePayoutConsistency);

const feeEditableShape = {
    amountCents: nonNegativeUsdCentsSchema,
    kind: z.enum(FeeKind),
    note: ledgerNoteSchema.nullable(),
    paidOn: accountDateSchema,
};

export const feeCreateSchema = z.object({
    ...feeEditableShape,
    accountId: idSchema,
    note: feeEditableShape.note.default(null),
});

export const feeUpdateSchema = z.strictObject({
    ...feeEditableShape,
    id: idSchema,
});

export const ledgerListSchema = z.object({ accountId: idSchema.optional() });

export const eventRecordSchema = z
    .strictObject({
        accountId: idSchema,
        kind: z.enum(AccountEventKind).exclude(['Edited', 'Purchased']),
        note: eventNoteSchema.nullable().default(null),
        occurredOn: accountDateSchema,
    })
    .superRefine((event, context) => {
        if (
            event.kind === AccountEventKind.BustReversed &&
            (event.note === null || event.note.trim() === '')
        ) {
            context.addIssue({
                code: 'custom',
                message:
                    'a bust reversal needs a note saying why the firm reversed it',
                path: ['note'],
            });
        }
    });

export const eventListSchema = z
    .object({
        accountId: idSchema.optional(),
        from: accountDateSchema.optional(),
        to: accountDateSchema.optional(),
    })
    .transform(({ from, to, ...rest }) => {
        const end =
            to ??
            (from === undefined
                ? latestIsoDateAnywhere(new Date())
                : addCalendarYears(from, MAX_EVENT_LIST_YEARS));
        return {
            ...rest,
            from: from ?? earliestListStart(end),
            to: end,
        };
    })
    .superRefine((range, context) => {
        if (range.to < range.from) {
            context.addIssue({
                code: 'custom',
                message: 'the range ends before it starts',
                path: ['to'],
            });
        } else if (
            range.to > addCalendarYears(range.from, MAX_EVENT_LIST_YEARS)
        ) {
            context.addIssue({
                code: 'custom',
                message: `the range spans more than ${MAX_EVENT_LIST_YEARS} years`,
                path: ['to'],
            });
        }
    });

const copyGroupNameSchema = singleLineTextSchema(MAX_ACCOUNT_LABEL_LENGTH);

export const copyGroupCreateSchema = z.object({
    name: copyGroupNameSchema,
    notes: accountNotesSchema.nullable().default(null),
});

export const copyGroupUpdateSchema = z.strictObject({
    id: idSchema,
    name: copyGroupNameSchema,
    notes: accountNotesSchema.nullable(),
});

export const copyGroupAssignSchema = z.object({
    accountId: idSchema,
    copyGroupId: idSchema.nullable(),
});

export const decisionCreateSchema = z.object({
    acceptedRiskCents: nonNegativeUsdCentsSchema,
    acceptedRungsCents: z.array(positiveUsdCentsSchema).max(MAX_ACCEPTED_RUNGS),
    accountId: idSchema,
    decidedOn: accountDateSchema,
    headlineRiskCents: nonNegativeUsdCentsSchema,
    note: ledgerNoteSchema.nullable().default(null),
    snapshotId: idSchema.nullable(),
    source: singleLineTextSchema(MAX_ADVICE_SOURCE_LENGTH),
    stage: z.enum(AccountStage),
});

export const decisionRecordActualSchema = z.object({
    actualRiskCents: nonNegativeUsdCentsSchema,
    id: idSchema,
});

export const scenarioSaveSchema = z.object({
    name: singleLineTextSchema(MAX_SCENARIO_NAME_LENGTH),
    query: controlFreeTextSchema(MAX_SCENARIO_QUERY_LENGTH),
});

function earliestListStart(end: string): string {
    const start = addCalendarYears(end, -MAX_EVENT_LIST_YEARS);
    return addCalendarYears(start, MAX_EVENT_LIST_YEARS) >= end
        ? start
        : addIsoDays(start, 1);
}
