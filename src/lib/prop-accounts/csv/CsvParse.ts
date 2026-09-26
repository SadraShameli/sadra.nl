import Papa from 'papaparse';
import { type z } from 'zod';

import {
    EntryTextKind,
    INT4_MAX,
    INT4_MIN,
    isAccountDate,
    MAX_ACCOUNT_DATE_YEAR,
    MIN_ACCOUNT_DATE_YEAR,
    parseCountText,
    parseMoneyText,
    usdCents,
    type UsdCents,
    usdCentsToText,
} from '~/lib/prop-accounts/core';

export const BYTE_ORDER_MARK = '\u{FEFF}';
export const MAX_CSV_BYTES = 262_144;

export enum CsvFailureKind {
    DuplicateColumns = 'duplicate-columns',
    Empty = 'empty',
    MissingColumns = 'missing-columns',
    TooLarge = 'too-large',
    TooManyRows = 'too-many-rows',
    UnknownColumns = 'unknown-columns',
}

export enum CsvIssueKind {
    Batch = 'batch',
    Cell = 'cell',
    Format = 'format',
    Plausibility = 'plausibility',
    Schema = 'schema',
}

export enum CsvTableKind {
    Failed = 'failed',
    Parsed = 'parsed',
}

export interface CsvColumns<Column extends string> {
    readonly all: readonly Column[];
    readonly required: readonly Column[];
}

export type CsvFailure =
    | {
          readonly actual: number;
          readonly kind: CsvFailureKind.TooLarge | CsvFailureKind.TooManyRows;
          readonly limit: number;
      }
    | {
          readonly columns: readonly string[];
          readonly kind:
              | CsvFailureKind.DuplicateColumns
              | CsvFailureKind.MissingColumns
              | CsvFailureKind.UnknownColumns;
      }
    | { readonly kind: CsvFailureKind.Empty };

export interface CsvIssue {
    readonly column: null | string;
    readonly kind: CsvIssueKind;
    readonly message: string;
    readonly rowNumber: number;
}

export type CsvPreview<Column extends string, Value> =
    | { readonly failure: CsvFailure; readonly kind: CsvTableKind.Failed }
    | {
          readonly kind: CsvTableKind.Parsed;
          readonly rows: readonly CsvPreviewRow<Column, Value>[];
      };

export interface CsvPreviewRow<Column extends string, Value> {
    readonly cells: ReadonlyMap<Column, string>;
    readonly issues: readonly CsvIssue[];
    readonly rowNumber: number;
    readonly value: null | Value;
}

export interface CsvRecord<Column extends string> {
    readonly cells: ReadonlyMap<Column, string>;
    readonly issues: readonly CsvIssue[];
    readonly rowNumber: number;
}

export type CsvTable<Column extends string> =
    | { readonly failure: CsvFailure; readonly kind: CsvTableKind.Failed }
    | {
          readonly kind: CsvTableKind.Parsed;
          readonly records: readonly CsvRecord<Column>[];
      };

export type SchemaPathColumns<Column extends string> = readonly (readonly [
    Column,
    readonly PropertyKey[],
])[];

type HeaderResult<Column extends string> =
    | {
          readonly columns: readonly Column[];
          readonly kind: CsvTableKind.Parsed;
      }
    | { readonly failure: CsvFailure; readonly kind: CsvTableKind.Failed };

const BYTES_PER_KILOBYTE = 1024;
const GUESSED_DELIMITERS = [',', '\t'];
const LIST_SEPARATOR = ',';
const TRUE_WORDS: ReadonlySet<string> = new Set(['1', 'true', 'y', 'yes']);
const FALSE_WORDS: ReadonlySet<string> = new Set(['0', 'false', 'n', 'no']);
const EMPTY_HEADER_NAME = '(empty)';

const QUOTE_MESSAGE: Readonly<
    Record<'InvalidQuotes' | 'MissingQuotes', string>
> = {
    InvalidQuotes: 'has a quoted field with text after its closing quote',
    MissingQuotes: 'has a quote that is never closed',
};

const COUNT_MESSAGE = 'must be a whole number of 0 or more';
const DATE_MESSAGE = `must be a real date written as YYYY-MM-DD, in the years ${MIN_ACCOUNT_DATE_YEAR} to ${MAX_ACCOUNT_DATE_YEAR}`;
const FLAG_MESSAGE = 'must be yes or no';
const MONEY_MESSAGE = `must be a dollar amount like 1234.56 with at most 2 decimals, from ${usdCentsToText(usdCents(INT4_MIN))} to ${usdCentsToText(usdCents(INT4_MAX))}`;
const REQUIRED_MESSAGE = 'is required';

const UTF8 = new TextEncoder();
const WHOLE_NUMBER = new Intl.NumberFormat('en-US');

export class CsvRowReader<Column extends string> {
    private readonly found: CsvIssue[] = [];

    constructor(
        private readonly record: CsvRecord<Column>,
        private readonly required: ReadonlySet<Column>,
    ) {}

    private cell(column: Column): string | undefined {
        const value = this.record.cells.get(column)?.trim() ?? '';
        if (value !== '') return value;
        if (this.required.has(column)) {
            this.addIssue(column, CsvIssueKind.Cell, REQUIRED_MESSAGE);
        }
        return undefined;
    }

    get issues(): readonly CsvIssue[] {
        return [...this.record.issues, ...this.found];
    }

    addIssue(column: Column | null, kind: CsvIssueKind, message: string): void {
        this.found.push({
            column,
            kind,
            message,
            rowNumber: this.record.rowNumber,
        });
    }

    addSchemaIssues(
        issues: readonly z.core.$ZodIssue[],
        columns: SchemaPathColumns<Column>,
    ): void {
        for (const issue of issues) {
            const column = columnOfPath(issue.path, columns);
            if (column !== null && this.hasIssue(column)) continue;
            this.addIssue(
                column,
                CsvIssueKind.Schema,
                column === null && issue.path.length > 0
                    ? `${issue.path.map(String).join('.')}: ${issue.message}`
                    : issue.message,
            );
        }
    }

    choice<Choice extends string>(
        column: Column,
        choices: Readonly<Record<string, Choice>>,
    ): Choice | undefined {
        const cell = this.cell(column);
        if (cell === undefined) return undefined;
        const options = Object.values(choices);
        const match = options.find(
            (option) => option.toLowerCase() === cell.toLowerCase(),
        );
        if (match === undefined) {
            this.addIssue(
                column,
                CsvIssueKind.Cell,
                `must be one of: ${options.join(', ')}`,
            );
        }
        return match;
    }

    count(column: Column): number | undefined {
        const cell = this.cell(column);
        if (cell === undefined) return undefined;
        const parsed = parseCountText(cell);
        if (parsed.kind === EntryTextKind.Valid) return parsed.count;
        this.addIssue(column, CsvIssueKind.Cell, COUNT_MESSAGE);
        return undefined;
    }

    date(column: Column): string | undefined {
        const cell = this.cell(column);
        if (cell === undefined) return undefined;
        if (isAccountDate(cell)) return cell;
        this.addIssue(column, CsvIssueKind.Cell, DATE_MESSAGE);
        return undefined;
    }

    flag(column: Column): boolean | undefined {
        const cell = this.cell(column)?.toLowerCase();
        if (cell === undefined) return undefined;
        if (TRUE_WORDS.has(cell)) return true;
        if (FALSE_WORDS.has(cell)) return false;
        this.addIssue(column, CsvIssueKind.Cell, FLAG_MESSAGE);
        return undefined;
    }

    hasIssue(column: Column): boolean {
        return this.issues.some((issue) => issue.column === column);
    }

    list(column: Column): string[] | undefined {
        const cell = this.cell(column);
        if (cell === undefined) return undefined;
        return [
            ...new Set(
                cell
                    .split(LIST_SEPARATOR)
                    .map((item) => item.trim())
                    .filter((item) => item !== ''),
            ),
        ];
    }

    money(column: Column): undefined | UsdCents {
        const cell = this.cell(column);
        if (cell === undefined) return undefined;
        const parsed = parseMoneyText(cell);
        if (parsed.kind === EntryTextKind.Valid) return parsed.cents;
        this.addIssue(column, CsvIssueKind.Cell, MONEY_MESSAGE);
        return undefined;
    }

    text(column: Column): string | undefined {
        return this.cell(column);
    }
}

export function appendCsvIssues<Column extends string, Value>(
    preview: CsvPreview<Column, Value>,
    issues: readonly CsvIssue[],
): CsvPreview<Column, Value> {
    if (preview.kind === CsvTableKind.Failed || issues.length === 0) {
        return preview;
    }
    const rowNumbers = new Set(preview.rows.map((row) => row.rowNumber));
    const stray = issues.find((issue) => !rowNumbers.has(issue.rowNumber));
    if (stray !== undefined) {
        throw new RangeError(
            `A CSV issue names row ${stray.rowNumber}, which is not in the preview`,
        );
    }
    return {
        kind: CsvTableKind.Parsed,
        rows: preview.rows.map((row) => {
            const extra = issues.filter(
                (issue) => issue.rowNumber === row.rowNumber,
            );
            return extra.length === 0
                ? row
                : { ...row, issues: [...row.issues, ...extra], value: null };
        }),
    };
}

export function buildCsvPreview<Column extends string, Value>(
    table: CsvTable<Column>,
    readRow: (reader: CsvRowReader<Column>) => undefined | Value,
    required: readonly Column[],
): CsvPreview<Column, Value> {
    if (table.kind === CsvTableKind.Failed) return table;
    const requiredColumns = new Set(required);
    return {
        kind: CsvTableKind.Parsed,
        rows: table.records.map((record) => {
            const reader = new CsvRowReader(record, requiredColumns);
            const value = readRow(reader);
            const issues = reader.issues;
            return {
                cells: record.cells,
                issues,
                rowNumber: record.rowNumber,
                value:
                    value !== undefined && issues.length === 0 ? value : null,
            };
        }),
    };
}

export function csvCommitPayload<Column extends string, Value>(
    preview: CsvPreview<Column, Value>,
): null | readonly Value[] {
    if (preview.kind === CsvTableKind.Failed || preview.rows.length === 0) {
        return null;
    }
    const values: Value[] = [];
    for (const row of preview.rows) {
        if (row.issues.length > 0 || row.value === null) return null;
        values.push(row.value);
    }
    return values;
}

export function csvIssues<Column extends string, Value>(
    preview: CsvPreview<Column, Value>,
): readonly CsvIssue[] {
    return preview.kind === CsvTableKind.Failed
        ? []
        : preview.rows.flatMap((row) => row.issues);
}

export function describeCsvFailure(failure: CsvFailure): string {
    switch (failure.kind) {
        case CsvFailureKind.DuplicateColumns: {
            return `The header repeats the columns: ${columnList(failure.columns)}`;
        }
        case CsvFailureKind.Empty: {
            return 'The CSV has no data rows';
        }
        case CsvFailureKind.MissingColumns: {
            return `The header is missing the columns: ${columnList(failure.columns)}`;
        }
        case CsvFailureKind.TooLarge: {
            return `The CSV is ${WHOLE_NUMBER.format(failure.actual)} bytes; the limit is ${WHOLE_NUMBER.format(failure.limit)} bytes (${WHOLE_NUMBER.format(failure.limit / BYTES_PER_KILOBYTE)} KB)`;
        }
        case CsvFailureKind.TooManyRows: {
            return `The CSV has ${WHOLE_NUMBER.format(failure.actual)} data rows; at most ${WHOLE_NUMBER.format(failure.limit)} can be imported at once`;
        }
        case CsvFailureKind.UnknownColumns: {
            return `The header has unknown columns: ${columnList(failure.columns)}`;
        }
    }
}

export function parseCsvTable<Column extends string>(
    text: string,
    columns: CsvColumns<Column>,
    maxRows: number,
): CsvTable<Column> {
    const bytes = UTF8.encode(text).length;
    if (bytes > MAX_CSV_BYTES) {
        return failed({
            actual: bytes,
            kind: CsvFailureKind.TooLarge,
            limit: MAX_CSV_BYTES,
        });
    }
    const content = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
    const parsed = Papa.parse<string[]>(content, {
        delimitersToGuess: GUESSED_DELIMITERS,
        skipEmptyLines: false,
    });
    const rows = parsed.data;
    const headerIndex = rows.findIndex((row) => !isBlankRow(row));
    const headerRow = rows[headerIndex];
    if (headerRow === undefined) return failed({ kind: CsvFailureKind.Empty });
    const header = readHeader(headerRow, columns);
    if (header.kind === CsvTableKind.Failed) return header;
    const dataIndexes = rows
        .map((row, index) => ({ index, row }))
        .filter(({ index, row }) => index > headerIndex && !isBlankRow(row));
    if (dataIndexes.length === 0) return failed({ kind: CsvFailureKind.Empty });
    if (dataIndexes.length > maxRows) {
        return failed({
            actual: dataIndexes.length,
            kind: CsvFailureKind.TooManyRows,
            limit: maxRows,
        });
    }
    const quoteErrors = quoteErrorsByRow(parsed.errors);
    return {
        kind: CsvTableKind.Parsed,
        records: dataIndexes.map(({ index, row }) =>
            toRecord(row, index + 1, header.columns, quoteErrors.get(index)),
        ),
    };
}

function columnList(columns: readonly string[]): string {
    return columns
        .map((column) => (column === '' ? EMPTY_HEADER_NAME : column))
        .join(', ');
}

function columnOfPath<Column extends string>(
    path: readonly PropertyKey[],
    columns: SchemaPathColumns<Column>,
): Column | null {
    let best: null | readonly [Column, readonly PropertyKey[]] = null;
    for (const entry of columns) {
        const [, prefix] = entry;
        const isPrefix =
            prefix.length <= path.length &&
            prefix.every((key, index) => path[index] === key);
        if (isPrefix && (best === null || prefix.length > best[1].length)) {
            best = entry;
        }
    }
    return best === null ? null : best[0];
}

function failed(failure: CsvFailure): {
    readonly failure: CsvFailure;
    readonly kind: CsvTableKind.Failed;
} {
    return { failure, kind: CsvTableKind.Failed };
}

function fieldCountMessage(actual: number, expected: number): string {
    return `has ${actual} field${actual === 1 ? '' : 's'}, the header has ${expected}`;
}

function isBlankRow(row: readonly string[]): boolean {
    return row.every((cell) => cell.trim() === '');
}

function quoteErrorsByRow(
    errors: readonly Papa.ParseError[],
): ReadonlyMap<number, readonly string[]> {
    const byRow = new Map<number, string[]>();
    for (const error of errors) {
        if (error.row === undefined) continue;
        if (error.code !== 'InvalidQuotes' && error.code !== 'MissingQuotes') {
            continue;
        }
        const messages = byRow.get(error.row) ?? [];
        const message = QUOTE_MESSAGE[error.code];
        if (!messages.includes(message)) messages.push(message);
        byRow.set(error.row, messages);
    }
    return byRow;
}

function readHeader<Column extends string>(
    headerRow: readonly string[],
    columns: CsvColumns<Column>,
): HeaderResult<Column> {
    const byName = new Map(
        columns.all.map((column) => [column.toLowerCase(), column] as const),
    );
    const names = headerRow.map((cell) => cell.trim());
    const unknown = names.filter((name) => !byName.has(name.toLowerCase()));
    if (unknown.length > 0) {
        return failed({
            columns: unknown,
            kind: CsvFailureKind.UnknownColumns,
        });
    }
    const matched = names.flatMap((name) => {
        const column = byName.get(name.toLowerCase());
        return column === undefined ? [] : [column];
    });
    const duplicates = [
        ...new Set(
            matched.filter(
                (column, index) => matched.indexOf(column) !== index,
            ),
        ),
    ];
    if (duplicates.length > 0) {
        return failed({
            columns: duplicates,
            kind: CsvFailureKind.DuplicateColumns,
        });
    }
    const missing = columns.required.filter(
        (column) => !matched.includes(column),
    );
    return missing.length > 0
        ? failed({ columns: missing, kind: CsvFailureKind.MissingColumns })
        : { columns: matched, kind: CsvTableKind.Parsed };
}

function toRecord<Column extends string>(
    row: readonly string[],
    rowNumber: number,
    columns: readonly Column[],
    quoteMessages: readonly string[] = [],
): CsvRecord<Column> {
    const issues: CsvIssue[] = quoteMessages.map((message) => ({
        column: null,
        kind: CsvIssueKind.Format,
        message,
        rowNumber,
    }));
    if (row.length !== columns.length) {
        issues.push({
            column: null,
            kind: CsvIssueKind.Format,
            message: fieldCountMessage(row.length, columns.length),
            rowNumber,
        });
    }
    return {
        cells: new Map(
            columns.map((column, index) => [column, row[index] ?? ''] as const),
        ),
        issues,
        rowNumber,
    };
}
