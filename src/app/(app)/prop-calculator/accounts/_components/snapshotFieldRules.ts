import { type z } from 'zod';

import {
    type AccountStage,
    accountStageOn,
    COUNT_ENTRY_MESSAGE,
    type CountText,
    EntryTextKind,
    isAccountDate,
    type MissingSnapshotField,
    missingSnapshotFields,
    MONEY_ENTRY_MESSAGE,
    type MoneyText,
    NO_RECORDED_STAGE_STARTS,
    parseCountText,
    parseMoneyText,
    SnapshotField,
    SnapshotFieldRequirement,
    type SnapshotFieldRule,
    snapshotFieldRules,
    SnapshotInputKind,
    SnapshotSource,
} from '~/lib/prop-accounts';
import { type Plan } from '~/lib/prop-calculator';
import {
    accountCreateSchema,
    snapshotCreateSchema,
} from '~/lib/schemas/propAccounts';

import {
    type SnapshotPlausibilityContext,
    snapshotPlausibilityIssues,
    type SnapshotPlausibilityMessages,
} from './snapshotPlausibilityIssues';

export enum SnapshotFormResultKind {
    Invalid = 'invalid',
    Valid = 'valid',
}

export interface InitialSnapshotAccount {
    readonly fundedOn: string;
    readonly purchasedOn: string;
    readonly stage: AccountStage;
}

export type SnapshotDraft = Omit<
    z.output<typeof snapshotCreateSchema>,
    'accountId'
>;

export type SnapshotDraftWarnings = Pick<
    SnapshotPlausibilityMessages,
    'fieldWarnings' | 'formWarnings'
>;

export interface SnapshotFieldIssue {
    readonly field: SnapshotField;
    readonly message: string;
}

export type SnapshotFormResult =
    | {
          readonly formIssues: readonly string[];
          readonly issues: readonly SnapshotFieldIssue[];
          readonly kind: SnapshotFormResultKind.Invalid;
      }
    | {
          readonly kind: SnapshotFormResultKind.Valid;
          readonly snapshot: SnapshotDraft;
      };

export type SnapshotFormValues = Record<SnapshotField, string>;

export type TagsText =
    | { readonly kind: EntryTextKind.Invalid; readonly message: string }
    | { readonly kind: EntryTextKind.Valid; readonly tags: readonly string[] };

type ParsedValue = null | number | string;

type SnapshotDraftField = Exclude<keyof SnapshotDraft, 'source'>;

const NO_DRAFT_WARNINGS: SnapshotDraftWarnings = {
    fieldWarnings: [],
    formWarnings: [],
};

const SNAPSHOT_DRAFT_SCHEMA = snapshotCreateSchema.omit({ accountId: true });

const TAGS_SCHEMA = accountCreateSchema.shape.tags;

export function emptySnapshotFormValues(asOf: string): SnapshotFormValues {
    const values = {} as Record<SnapshotField, string>;
    for (const field of Object.values(SnapshotField)) values[field] = '';
    values[SnapshotField.AsOf] = asOf;
    return values;
}

export function initialSnapshotRules(
    plan: Plan,
    account: InitialSnapshotAccount,
    asOf: string,
): readonly SnapshotFieldRule[] {
    return snapshotFieldRules(plan, initialSnapshotStage(plan, account, asOf));
}

export function initialSnapshotStage(
    plan: Plan,
    account: InitialSnapshotAccount,
    asOf: string,
): AccountStage {
    if (!isAccountDate(asOf) || !isAccountDate(account.purchasedOn)) {
        return account.stage;
    }
    return accountStageOn(
        {
            fundedOn: isAccountDate(account.fundedOn) ? account.fundedOn : null,
            purchasedOn: account.purchasedOn,
            stage: account.stage,
        },
        plan,
        NO_RECORDED_STAGE_STARTS,
        asOf,
    );
}

export function parseSnapshotForm(
    values: SnapshotFormValues,
    rules: readonly SnapshotFieldRule[],
): SnapshotFormResult {
    const issues = new Map<SnapshotField, string>();
    const draft: Partial<Record<SnapshotDraftField, ParsedValue>> & {
        readonly source: SnapshotSource;
    } = { source: SnapshotSource.Manual };
    const isFilled = (field: SnapshotField) => values[field].trim() !== '';
    const missing = new Map(
        missingSnapshotFields(rules, isFilled).map((field) => [
            field.field,
            missingMessage(field),
        ]),
    );
    for (const rule of rules) {
        draft[rule.field] = null;
        if (rule.requirement === SnapshotFieldRequirement.Hidden) continue;
        if (!isFilled(rule.field)) {
            const message = missing.get(rule.field);
            if (message !== undefined) issues.set(rule.field, message);
            continue;
        }
        const parsed = parseFieldValue(rule.input, values[rule.field]);
        if (typeof parsed === 'object') {
            issues.set(rule.field, parsed.message);
            continue;
        }
        draft[rule.field] = parsed;
    }
    const result = SNAPSHOT_DRAFT_SCHEMA.safeParse(draft);
    if (!result.success) {
        for (const issue of result.error.issues) {
            const field = fieldOfPath(issue.path);
            if (!issues.has(field)) issues.set(field, issue.message);
        }
    }
    if (issues.size > 0 || !result.success) {
        return {
            formIssues: [],
            issues: [...issues].map(([field, message]) => ({ field, message })),
            kind: SnapshotFormResultKind.Invalid,
        };
    }
    return { kind: SnapshotFormResultKind.Valid, snapshot: result.data };
}

export function parseTagsText(text: string): TagsText {
    const tags = [
        ...new Set(
            text
                .split(',')
                .map((tag) => tag.trim())
                .filter((tag) => tag !== ''),
        ),
    ];
    const result = TAGS_SCHEMA.safeParse(tags);
    if (result.success) return { kind: EntryTextKind.Valid, tags: result.data };
    const [issue] = result.error.issues;
    const [index] = issue?.path ?? [];
    const tag = typeof index === 'number' ? tags[index] : undefined;
    const message = issue?.message ?? 'These tags cannot be saved';
    return {
        kind: EntryTextKind.Invalid,
        message: tag === undefined ? message : `Tag "${tag}": ${message}`,
    };
}

export function snapshotDraftWarnings(
    values: SnapshotFormValues,
    rules: readonly SnapshotFieldRule[],
    context: SnapshotPlausibilityContext,
): SnapshotDraftWarnings {
    const parsed = parseSnapshotForm(values, rules);
    if (parsed.kind === SnapshotFormResultKind.Invalid)
        return NO_DRAFT_WARNINGS;
    const { fieldWarnings, formWarnings } = snapshotPlausibilityIssues(
        context,
        parsed.snapshot,
    );
    return { fieldWarnings, formWarnings };
}

export function validateSnapshotDraft(
    values: SnapshotFormValues,
    rules: readonly SnapshotFieldRule[],
    context: SnapshotPlausibilityContext,
): SnapshotFormResult {
    const parsed = parseSnapshotForm(values, rules);
    if (parsed.kind === SnapshotFormResultKind.Invalid) return parsed;
    const plausibility = snapshotPlausibilityIssues(context, parsed.snapshot);
    return plausibility.fieldIssues.length === 0 &&
        plausibility.formIssues.length === 0
        ? parsed
        : {
              formIssues: plausibility.formIssues,
              issues: plausibility.fieldIssues,
              kind: SnapshotFormResultKind.Invalid,
          };
}

function entryValue(
    entry: CountText | MoneyText,
    emptyMessage: string,
): number | { readonly message: string } {
    switch (entry.kind) {
        case EntryTextKind.Empty: {
            return { message: emptyMessage };
        }
        case EntryTextKind.Invalid: {
            return { message: entry.message };
        }
        case EntryTextKind.Valid: {
            return 'cents' in entry ? entry.cents : entry.count;
        }
    }
}

function fieldOfPath(path: readonly PropertyKey[]): SnapshotField {
    const [key] = path;
    return (
        Object.values(SnapshotField).find((field) => field === key) ??
        SnapshotField.AsOf
    );
}

function lowerFirst(text: string): string {
    return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function missingMessage(missing: MissingSnapshotField): string {
    return missing.alternative === null
        ? `${missing.label} is required`
        : `Enter the ${lowerFirst(missing.label)} or the ${lowerFirst(missing.alternative.label)}: this plan’s floor trails it`;
}

function parseFieldValue(
    input: SnapshotInputKind,
    text: string,
): number | string | { readonly message: string } {
    switch (input) {
        case SnapshotInputKind.Count: {
            return entryValue(parseCountText(text), COUNT_ENTRY_MESSAGE);
        }
        case SnapshotInputKind.Date: {
            return text.trim();
        }
        case SnapshotInputKind.Money: {
            return entryValue(parseMoneyText(text), MONEY_ENTRY_MESSAGE);
        }
    }
}
