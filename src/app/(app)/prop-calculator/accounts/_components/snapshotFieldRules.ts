import { type z } from 'zod';

import {
    type MissingSnapshotField,
    missingSnapshotFields,
    parseUsdCents,
    SnapshotField,
    SnapshotFieldRequirement,
    type SnapshotFieldRule,
    SnapshotInputKind,
    SnapshotSource,
    type UsdCents,
} from '~/lib/prop-accounts';
import {
    accountCreateSchema,
    snapshotCreateSchema,
} from '~/lib/schemas/propAccounts';

export enum EntryTextKind {
    Empty = 'empty',
    Invalid = 'invalid',
    Valid = 'valid',
}

export enum SnapshotFormResultKind {
    Invalid = 'invalid',
    Valid = 'valid',
}

export type CountText =
    | { readonly count: number; readonly kind: EntryTextKind.Valid }
    | { readonly kind: EntryTextKind.Empty }
    | { readonly kind: EntryTextKind.Invalid; readonly message: string };

export type MoneyText =
    | { readonly cents: UsdCents; readonly kind: EntryTextKind.Valid }
    | { readonly kind: EntryTextKind.Empty }
    | { readonly kind: EntryTextKind.Invalid; readonly message: string };

export type SnapshotDraft = Omit<
    z.output<typeof snapshotCreateSchema>,
    'accountId'
>;

export interface SnapshotFieldIssue {
    readonly field: SnapshotField;
    readonly message: string;
}

export type SnapshotFormResult =
    | {
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

const MONEY_PATTERN = /^(-?)\$?((?:\d{1,3}(?:,\d{3})+)|\d+)(\.\d{1,2})?$/;
const COUNT_PATTERN = /^\d+$/;

const MONEY_MESSAGE = 'Enter a dollar amount with at most 2 decimals';
const COUNT_MESSAGE = 'Enter a whole number of 0 or more';

const SNAPSHOT_DRAFT_SCHEMA = snapshotCreateSchema.omit({ accountId: true });

const TAGS_SCHEMA = accountCreateSchema.shape.tags;

export function emptySnapshotFormValues(asOf: string): SnapshotFormValues {
    const values = {} as Record<SnapshotField, string>;
    for (const field of Object.values(SnapshotField)) values[field] = '';
    values[SnapshotField.AsOf] = asOf;
    return values;
}

export function parseCountText(text: string): CountText {
    const trimmed = text.trim();
    if (trimmed === '') return { kind: EntryTextKind.Empty };
    return COUNT_PATTERN.test(trimmed)
        ? { count: Number(trimmed), kind: EntryTextKind.Valid }
        : { kind: EntryTextKind.Invalid, message: COUNT_MESSAGE };
}

export function parseMoneyText(text: string): MoneyText {
    const trimmed = text.trim();
    if (trimmed === '') return { kind: EntryTextKind.Empty };
    const match = MONEY_PATTERN.exec(trimmed);
    if (match === null) {
        return { kind: EntryTextKind.Invalid, message: MONEY_MESSAGE };
    }
    const [, sign = '', whole = '', fraction = ''] = match;
    try {
        return {
            cents: parseUsdCents(
                `${sign}${whole.replaceAll(',', '')}${fraction}`,
            ),
            kind: EntryTextKind.Valid,
        };
    } catch (error) {
        return {
            kind: EntryTextKind.Invalid,
            message:
                error instanceof RangeError ? error.message : MONEY_MESSAGE,
        };
    }
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
            return entryValue(parseCountText(text), COUNT_MESSAGE);
        }
        case SnapshotInputKind.Date: {
            return text.trim();
        }
        case SnapshotInputKind.Money: {
            return entryValue(parseMoneyText(text), MONEY_MESSAGE);
        }
    }
}
