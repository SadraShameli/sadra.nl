import { z } from 'zod';

import {
    AccountEventKind,
    AccountStage,
    AccountTracking,
    addCalendarYears,
    addIsoDays,
    BankrollTransferKind,
    BustCause,
    DashboardBalanceConvention,
    describeLifecycleRejection,
    FeeKind,
    FirmEngagementReason,
    FirmEngagementStatus,
    INT4_MAX,
    isAccountDate,
    latestIsoDateAnywhere,
    MAX_ACCOUNT_DATE_YEAR,
    MAX_EVENT_NOTE_LENGTH,
    MIN_ACCOUNT_DATE_YEAR,
    nonNegativeUsdCentsSchema,
    PayoutStatus,
    personalRulesSchema,
    type PlanKey,
    planKeyShape,
    positiveUsdCentsSchema,
    refinePlanKey,
    ReportedPayoutBasis,
    RuleViolationKind,
    SnapshotSource,
    usdCentsSchema,
    validateStageForPlan,
} from '~/lib/prop-accounts';
import { FirmId, NO_PLAN_OPT_INS } from '~/lib/prop-calculator';
import { AdviceSource } from '~/lib/prop-calculator/advisor';

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
export const MAX_CONFIRMED_EXCLUSIVITY_ACCOUNTS = 50;

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

export const accountTagsSchema = z
    .array(singleLineTextSchema(MAX_ACCOUNT_TAG_LENGTH))
    .max(MAX_ACCOUNT_TAGS);

const accountDetailsShape = {
    copyGroupId: idSchema.nullable(),
    dashboardConvention: z.enum(DashboardBalanceConvention),
    externalAlias: singleLineTextSchema(MAX_ACCOUNT_LABEL_LENGTH).nullable(),
    firstFundedTradeOn: accountDateSchema.nullable(),
    fundedOn: accountDateSchema.nullable(),
    label: accountLabelSchema,
    liveStartBalanceCents: nonNegativeUsdCentsSchema.nullable(),
    notes: accountNotesSchema.nullable(),
    overrideRoundBudget: z.boolean().default(false),
    personalRules: personalRulesSchema,
    purchasedOn: accountDateSchema,
    replacesAccountId: idSchema.nullable(),
    roundId: idSchema.nullable().default(null),
    tags: accountTagsSchema,
};

const modeledPlanShape = {
    ...planKeyShape,
    tracking: z
        .literal(AccountTracking.Modeled)
        .default(AccountTracking.Modeled),
};

const ledgerOnlyPlanShape = {
    accountSize: z.number().int().positive().max(INT4_MAX),
    externalFirmId: idSchema.nullable(),
    firmId: z.enum(FirmId).nullable(),
    optIns: planKeyShape.optIns.default(NO_PLAN_OPT_INS),
    planLabel: singleLineTextSchema(MAX_ACCOUNT_LABEL_LENGTH),
    tracking: z.literal(AccountTracking.LedgerOnly),
};

const accountCreateDetailsShape = {
    ...accountDetailsShape,
    copyGroupId: accountDetailsShape.copyGroupId.default(null),
    externalAlias: accountDetailsShape.externalAlias.default(null),
    firstFundedTradeOn: accountDetailsShape.firstFundedTradeOn.default(null),
    fundedOn: accountDetailsShape.fundedOn.default(null),
    liveStartBalanceCents:
        accountDetailsShape.liveStartBalanceCents.default(null),
    notes: accountDetailsShape.notes.default(null),
    personalRules: accountDetailsShape.personalRules.default({}),
    replacesAccountId: accountDetailsShape.replacesAccountId.default(null),
    stage: z.enum(AccountStage),
    tags: accountDetailsShape.tags.default([]),
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
    .discriminatedUnion('tracking', [
        z.object({ ...accountCreateDetailsShape, ...modeledPlanShape }),
        z.object({
            ...accountCreateDetailsShape,
            ...ledgerOnlyPlanShape,
            externalFirmId: ledgerOnlyPlanShape.externalFirmId.default(null),
            firmId: ledgerOnlyPlanShape.firmId.default(null),
        }),
    ])
    .superRefine((account, context) => {
        refineAccountDates(account, context);
        switch (account.tracking) {
            case AccountTracking.LedgerOnly: {
                refineExactlyOneFirm(account, context);
                return;
            }
            case AccountTracking.Modeled: {
                refineModeledStage(account, context);
                return;
            }
        }
    });

export const accountUpdateSchema = z
    .discriminatedUnion('tracking', [
        z.strictObject({
            ...accountDetailsShape,
            ...modeledPlanShape,
            id: idSchema,
        }),
        z.strictObject({
            ...accountDetailsShape,
            ...ledgerOnlyPlanShape,
            id: idSchema,
        }),
    ])
    .superRefine((account, context) => {
        refineAccountDates(account, context);
        switch (account.tracking) {
            case AccountTracking.LedgerOnly: {
                refineExactlyOneFirm(account, context);
                break;
            }
            case AccountTracking.Modeled: {
                refinePlanKey(account, context);
                break;
            }
        }
        if (account.replacesAccountId === account.id) {
            context.addIssue({
                code: 'custom',
                message: 'an account cannot replace itself',
                path: ['replacesAccountId'],
            });
        }
    });

export const accountUpgradeSchema = z
    .strictObject({
        ...planKeyShape,
        confirmSizeOrFirmChange: z.boolean().default(false),
        id: idSchema,
    })
    .superRefine((key, context) => {
        refinePlanKey(key, context);
    });

function refineModeledStage(
    account: PlanKey & { readonly stage: AccountStage },
    context: z.RefinementCtx,
): void {
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
}

export const importAccountsSchema = z
    .array(accountCreateSchema)
    .min(1)
    .max(MAX_IMPORT_ROWS);

const snapshotEntryValuesShape = {
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
    tradingDays: dayCountSchema.nullable().default(null),
};

export const snapshotCreateSchema = z.object({
    accountId: idSchema,
    asOf: accountDateSchema,
    ...snapshotEntryValuesShape,
    source: z.enum(SnapshotSource),
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
    approvedOn: accountDateSchema.nullable(),
    grossCents: positiveUsdCentsSchema,
    netCents: nonNegativeUsdCentsSchema.nullable(),
    note: ledgerNoteSchema.nullable(),
    paidOn: accountDateSchema.nullable(),
    requestedOn: accountDateSchema,
    status: z.enum(PayoutStatus),
};

interface PayoutConsistencyFields {
    readonly approvedOn?: null | string;
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
    if (
        payout.approvedOn !== undefined &&
        payout.approvedOn !== null &&
        payout.approvedOn < payout.requestedOn
    ) {
        context.addIssue({
            code: 'custom',
            message: 'a payout cannot be approved before it was requested',
            path: ['approvedOn'],
        });
    }
    if (
        payout.approvedOn !== undefined &&
        payout.approvedOn !== null &&
        payout.paidOn !== null &&
        payout.paidOn < payout.approvedOn
    ) {
        context.addIssue({
            code: 'custom',
            message: 'a payout cannot be paid before it was approved',
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
        approvedOn: payoutEditableShape.approvedOn.optional(),
        netCents: payoutEditableShape.netCents.default(null),
        note: payoutEditableShape.note.default(null),
        paidOn: payoutEditableShape.paidOn.default(null),
    })
    .superRefine(refinePayoutConsistency);

export const payoutUpdateSchema = z
    .strictObject({
        ...payoutEditableShape,
        approvedOn: payoutEditableShape.approvedOn.optional(),
        id: idSchema,
    })
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

const EVENT_NOTE_REQUIREMENT: Readonly<
    Partial<Record<AccountEventKind, string>>
> = {
    [AccountEventKind.BustReversed]:
        'a bust reversal needs a note saying why the firm reversed it',
};

export const eventRecordSchema = z
    .strictObject({
        accountId: idSchema,
        bustCause: z.enum(BustCause).optional(),
        confirmedExclusivityAccountIds: z
            .array(idSchema)
            .max(MAX_CONFIRMED_EXCLUSIVITY_ACCOUNTS)
            .optional(),
        kind: z.enum(AccountEventKind).exclude(['Edited', 'Purchased']),
        note: eventNoteSchema.nullable().default(null),
        occurredOn: accountDateSchema,
    })
    .superRefine((event, context) => {
        if (
            event.bustCause !== undefined &&
            event.kind !== AccountEventKind.Busted
        ) {
            context.addIssue({
                code: 'custom',
                message: 'only a bust has a bust cause',
                path: ['bustCause'],
            });
        }
        const confirmed = event.confirmedExclusivityAccountIds;
        if (confirmed !== undefined) {
            if (event.kind !== AccountEventKind.MovedLive) {
                context.addIssue({
                    code: 'custom',
                    message:
                        'only moving an account live can confirm effects on other accounts',
                    path: ['confirmedExclusivityAccountIds'],
                });
            }
            if (confirmed.includes(event.accountId)) {
                context.addIssue({
                    code: 'custom',
                    message:
                        'the account moving live cannot be one of the accounts it affects',
                    path: ['confirmedExclusivityAccountIds'],
                });
            }
            if (new Set(confirmed).size !== confirmed.length) {
                context.addIssue({
                    code: 'custom',
                    message: 'each affected account can be confirmed once',
                    path: ['confirmedExclusivityAccountIds'],
                });
            }
        }
        const requirement = EVENT_NOTE_REQUIREMENT[event.kind];
        if (
            requirement !== undefined &&
            (event.note === null || event.note.trim() === '')
        ) {
            context.addIssue({
                code: 'custom',
                message: requirement,
                path: ['note'],
            });
        }
    });

export function requiresEventNote(kind: AccountEventKind): boolean {
    return EVENT_NOTE_REQUIREMENT[kind] !== undefined;
}

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
    source: z.enum(AdviceSource),
    stage: z.enum(AccountStage),
});

export const decisionRecordActualSchema = z.object({
    actualRiskCents: nonNegativeUsdCentsSchema,
    id: idSchema,
});

export const weeklyReviewSnapshotEntrySchema = z.object({
    accountId: idSchema,
    ...snapshotEntryValuesShape,
});

export const weeklyReviewDecisionEntrySchema = z.object({
    acceptedRiskCents: nonNegativeUsdCentsSchema,
    acceptedRungsCents: z.array(positiveUsdCentsSchema).max(MAX_ACCEPTED_RUNGS),
    accountId: idSchema,
    headlineRiskCents: nonNegativeUsdCentsSchema,
    stage: z.enum(AccountStage),
});

export const weeklyReviewSubmitSchema = z
    .object({
        asOf: accountDateSchema,
        decisions: z
            .array(weeklyReviewDecisionEntrySchema)
            .max(MAX_BULK_SNAPSHOTS),
        snapshots: z
            .array(weeklyReviewSnapshotEntrySchema)
            .min(1)
            .max(MAX_BULK_SNAPSHOTS),
    })
    .superRefine((payload, context) => {
        const withSnapshot = new Set<string>();
        for (const [index, snapshot] of payload.snapshots.entries()) {
            if (withSnapshot.has(snapshot.accountId)) {
                context.addIssue({
                    code: 'custom',
                    message:
                        'one weekly review submits at most one snapshot per account',
                    path: ['snapshots', index, 'accountId'],
                });
            }
            withSnapshot.add(snapshot.accountId);
        }
        for (const [index, decision] of payload.decisions.entries()) {
            if (!withSnapshot.has(decision.accountId)) {
                context.addIssue({
                    code: 'custom',
                    message:
                        'a decision needs a snapshot for the same account in this submission',
                    path: ['decisions', index, 'accountId'],
                });
            }
        }
    });

export const bankrollTransferCreateSchema = z.object({
    amountCents: positiveUsdCentsSchema,
    kind: z.enum(BankrollTransferKind),
    note: ledgerNoteSchema.nullable().default(null),
    occurredOn: accountDateSchema,
});

export const bankrollTransferUpdateSchema = z.strictObject({
    amountCents: positiveUsdCentsSchema,
    id: idSchema,
    kind: z.enum(BankrollTransferKind),
    note: ledgerNoteSchema.nullable(),
    occurredOn: accountDateSchema,
});

const externalFirmNameSchema = singleLineTextSchema(MAX_ACCOUNT_LABEL_LENGTH);

export const externalFirmCreateSchema = z.object({
    name: externalFirmNameSchema,
    notes: accountNotesSchema.nullable().default(null),
});

export const externalFirmUpdateSchema = z.strictObject({
    id: idSchema,
    name: externalFirmNameSchema,
    notes: accountNotesSchema.nullable(),
});

interface FirmColumns {
    readonly externalFirmId: null | string;
    readonly firmId: FirmId | null;
}

function refineAtMostOneFirm(
    firm: FirmColumns,
    context: z.RefinementCtx,
): void {
    if (firm.firmId !== null && firm.externalFirmId !== null) {
        context.addIssue({
            code: 'custom',
            message:
                'pick either a listed firm or one of your own firms, not both',
            path: ['externalFirmId'],
        });
    }
}

function refineExactlyOneFirm(
    firm: FirmColumns,
    context: z.RefinementCtx,
): void {
    refineAtMostOneFirm(firm, context);
    if (firm.firmId === null && firm.externalFirmId === null) {
        context.addIssue({
            code: 'custom',
            message: 'pick a listed firm or one of your own firms',
            path: ['firmId'],
        });
    }
}

const firmColumnsShape = {
    externalFirmId: idSchema.nullable(),
    firmId: z.enum(FirmId).nullable(),
};

const roundEditableShape = {
    ...firmColumnsShape,
    budgetCents: positiveUsdCentsSchema.nullable(),
    label: accountLabelSchema,
    notes: accountNotesSchema.nullable(),
    openedOn: accountDateSchema,
};

export const roundCreateSchema = z
    .object({
        ...roundEditableShape,
        budgetCents: roundEditableShape.budgetCents.default(null),
        externalFirmId: roundEditableShape.externalFirmId.default(null),
        firmId: roundEditableShape.firmId.default(null),
        notes: roundEditableShape.notes.default(null),
    })
    .superRefine(refineExactlyOneFirm);

export const roundUpdateSchema = z
    .strictObject({ ...roundEditableShape, id: idSchema })
    .superRefine(refineExactlyOneFirm);

export const roundCloseSchema = z.object({
    closedOn: accountDateSchema,
    id: idSchema,
});

export const roundAssignSchema = z.object({
    accountId: idSchema,
    overrideRoundBudget: z.boolean().default(false),
    roundId: idSchema.nullable(),
});

export const firmEngagementSetSchema = z
    .object({
        externalFirmId: firmColumnsShape.externalFirmId.default(null),
        firmId: firmColumnsShape.firmId.default(null),
        note: ledgerNoteSchema.nullable().default(null),
        reason: z.enum(FirmEngagementReason).nullable().default(null),
        sentLiveOn: accountDateSchema.nullable().default(null),
        sinceOn: accountDateSchema,
        status: z.enum(FirmEngagementStatus),
    })
    .superRefine((engagement, context) => {
        refineExactlyOneFirm(engagement, context);
        const isActive = engagement.status === FirmEngagementStatus.Active;
        if (!isActive && engagement.reason === null) {
            context.addIssue({
                code: 'custom',
                message: 'a paused or retired firm needs a reason',
                path: ['reason'],
            });
        }
        if (isActive && engagement.reason !== null) {
            context.addIssue({
                code: 'custom',
                message: 'an active firm has no pause or retirement reason',
                path: ['reason'],
            });
        }
        const isSentLive = engagement.reason === FirmEngagementReason.SentLive;
        if (isSentLive && engagement.sentLiveOn === null) {
            context.addIssue({
                code: 'custom',
                message: 'a firm retired for sending you live needs the date',
                path: ['sentLiveOn'],
            });
        }
        if (!isSentLive && engagement.sentLiveOn !== null) {
            context.addIssue({
                code: 'custom',
                message: 'only a firm that sent you live has a sent-live date',
                path: ['sentLiveOn'],
            });
        }
        if (
            engagement.sentLiveOn !== null &&
            engagement.sentLiveOn > engagement.sinceOn
        ) {
            context.addIssue({
                code: 'custom',
                message:
                    'the sent-live date cannot be after the date this status began',
                path: ['sentLiveOn'],
            });
        }
    });

const firmStatementEditableShape = {
    asOf: accountDateSchema,
    basis: z.enum(ReportedPayoutBasis),
    note: ledgerNoteSchema.nullable(),
    reportedPayoutCents: nonNegativeUsdCentsSchema,
};

export const firmStatementCreateSchema = z
    .object({
        ...firmStatementEditableShape,
        externalFirmId: firmColumnsShape.externalFirmId.default(null),
        firmId: firmColumnsShape.firmId.default(null),
        note: firmStatementEditableShape.note.default(null),
    })
    .superRefine(refineExactlyOneFirm);

export const firmStatementUpdateSchema = z.strictObject({
    ...firmStatementEditableShape,
    id: idSchema,
});

const violationEditableShape = {
    costCents: usdCentsSchema.nullable(),
    decisionId: idSchema.nullable(),
    kind: z.enum(RuleViolationKind),
    note: ledgerNoteSchema.nullable(),
    occurredOn: accountDateSchema,
};

export const violationListSchema = ledgerListSchema.extend({
    occurredFrom: accountDateSchema.optional(),
});

export const violationCreateSchema = z.strictObject({
    ...violationEditableShape,
    accountId: idSchema,
    costCents: violationEditableShape.costCents.default(null),
    decisionId: violationEditableShape.decisionId.default(null),
    note: violationEditableShape.note.default(null),
});

export const violationUpdateSchema = z.strictObject({
    ...violationEditableShape,
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
