import { describe, expect, it } from 'vitest';

import {
    appendCsvIssues,
    buildCsvPreview,
    BYTE_ORDER_MARK,
    type CsvColumns,
    csvCommitPayload,
    CsvFailureKind,
    CsvIssueKind,
    csvIssues,
    type CsvRecord,
    CsvRowReader,
    type CsvTable,
    CsvTableKind,
    describeCsvFailure,
    MAX_CSV_BYTES,
    parseCsvTable,
} from '~/lib/prop-accounts/csv';

enum Colour {
    DarkBlue = 'dark-blue',
    Red = 'red',
}

enum Column {
    Amount = 'amount',
    Label = 'label',
    Note = 'note',
}

const COLUMNS: CsvColumns<Column> = {
    all: [Column.Label, Column.Amount, Column.Note],
    required: [Column.Label, Column.Amount],
};

const MAX_ROWS = 200;

function parsed(table: CsvTable<Column>): readonly CsvRecord<Column>[] {
    if (table.kind !== CsvTableKind.Parsed) {
        throw new Error(`expected a parsed table, got ${table.kind}`);
    }
    return table.records;
}

function readerFor(
    cells: Readonly<Partial<Record<Column, string>>>,
): CsvRowReader<Column> {
    const record: CsvRecord<Column> = {
        cells: new Map(
            Object.values(Column).flatMap((column) => {
                const text = cells[column];
                return text === undefined ? [] : [[column, text] as const];
            }),
        ),
        issues: [],
        rowNumber: 7,
    };
    return new CsvRowReader(record, new Set(COLUMNS.required));
}

function readRow(
    reader: CsvRowReader<Column>,
): undefined | { readonly amount: number; readonly label: string } {
    const label = reader.text(Column.Label);
    const amount = reader.money(Column.Amount);
    return label === undefined || amount === undefined
        ? undefined
        : { amount, label };
}

function rowsOf(count: number): string {
    return Array.from({ length: count }, (_, index) => `a${index},1,`).join(
        '\n',
    );
}

describe('parseCsvTable', () => {
    it('reads quoted fields holding commas, escaped quotes and line breaks across CRLF rows', () => {
        const text =
            'label,amount,note\r\n"Apex, first",12.50,"he said ""go""\r\nnext line"\r\nplain,3,\r\n';

        const records = parsed(parseCsvTable(text, COLUMNS, MAX_ROWS));

        expect(records).toHaveLength(2);
        expect(records[0]?.cells.get(Column.Label)).toBe('Apex, first');
        expect(records[0]?.cells.get(Column.Amount)).toBe('12.50');
        expect(records[0]?.cells.get(Column.Note)).toBe(
            'he said "go"\r\nnext line',
        );
        expect(records[0]?.issues).toEqual([]);
        expect(records[1]?.cells.get(Column.Label)).toBe('plain');
        expect(records[1]?.rowNumber).toBe(3);
    });

    it('numbers rows like a spreadsheet: the header is row 1 and blank lines still count', () => {
        const text = 'label,amount\n\nfirst,1\n   \nsecond,2\n';

        const records = parsed(parseCsvTable(text, COLUMNS, MAX_ROWS));

        expect(records.map((record) => record.rowNumber)).toEqual([3, 5]);
    });

    it('matches header names case-insensitively after trimming and a byte order mark', () => {
        const text = `${BYTE_ORDER_MARK} Label ,AMOUNT\nx,1`;

        const records = parsed(parseCsvTable(text, COLUMNS, MAX_ROWS));

        expect(BYTE_ORDER_MARK).toBe('\u{FEFF}');
        expect(records[0]?.cells.get(Column.Label)).toBe('x');
        expect(records[0]?.cells.get(Column.Amount)).toBe('1');
    });

    it('accepts a tab separated paste from a spreadsheet', () => {
        const text = 'label\tamount\tnote\nx\t1,5\ty';

        const records = parsed(parseCsvTable(text, COLUMNS, MAX_ROWS));

        expect(records[0]?.cells.get(Column.Amount)).toBe('1,5');
        expect(records[0]?.cells.get(Column.Note)).toBe('y');
    });

    it('accepts exactly 200 data rows and rejects 201', () => {
        const header = 'label,amount,note\n';

        const atLimit = parseCsvTable(header + rowsOf(200), COLUMNS, MAX_ROWS);
        expect(parsed(atLimit)).toHaveLength(200);
        expect(parseCsvTable(header + rowsOf(201), COLUMNS, MAX_ROWS)).toEqual({
            failure: {
                actual: 201,
                kind: CsvFailureKind.TooManyRows,
                limit: 200,
            },
            kind: CsvTableKind.Failed,
        });
    });

    it('accepts a text of exactly 256 KB and rejects one byte more, counting UTF-8 bytes', () => {
        const prefix = 'label,amount,note\nx,1,';
        const exact = prefix.padEnd(MAX_CSV_BYTES, 'n');

        expect(MAX_CSV_BYTES).toBe(256 * 1024);
        expect(parsed(parseCsvTable(exact, COLUMNS, MAX_ROWS))).toHaveLength(1);
        expect(parseCsvTable(`${exact}n`, COLUMNS, MAX_ROWS)).toEqual({
            failure: {
                actual: MAX_CSV_BYTES + 1,
                kind: CsvFailureKind.TooLarge,
                limit: MAX_CSV_BYTES,
            },
            kind: CsvTableKind.Failed,
        });
        const multiByte = `${prefix}${'€'.repeat(Math.ceil(MAX_CSV_BYTES / 3))}`;
        expect(multiByte.length).toBeLessThan(MAX_CSV_BYTES);
        expect(parseCsvTable(multiByte, COLUMNS, MAX_ROWS).kind).toBe(
            CsvTableKind.Failed,
        );
    });

    it('fails an empty text and a header without data rows', () => {
        expect(parseCsvTable('  \n', COLUMNS, MAX_ROWS)).toEqual({
            failure: { kind: CsvFailureKind.Empty },
            kind: CsvTableKind.Failed,
        });
        expect(parseCsvTable('label,amount\n', COLUMNS, MAX_ROWS)).toEqual({
            failure: { kind: CsvFailureKind.Empty },
            kind: CsvTableKind.Failed,
        });
    });

    it('fails missing, unknown and duplicate columns by name so a typo never drops a field silently', () => {
        expect(parseCsvTable('label,note\nx,y', COLUMNS, MAX_ROWS)).toEqual({
            failure: {
                columns: [Column.Amount],
                kind: CsvFailureKind.MissingColumns,
            },
            kind: CsvTableKind.Failed,
        });
        expect(
            parseCsvTable('label,amount,amnt\nx,1,2', COLUMNS, MAX_ROWS),
        ).toEqual({
            failure: {
                columns: ['amnt'],
                kind: CsvFailureKind.UnknownColumns,
            },
            kind: CsvTableKind.Failed,
        });
        expect(
            parseCsvTable('label,amount,Label\nx,1,y', COLUMNS, MAX_ROWS),
        ).toEqual({
            failure: {
                columns: [Column.Label],
                kind: CsvFailureKind.DuplicateColumns,
            },
            kind: CsvTableKind.Failed,
        });
    });

    it('flags a row whose field count differs from the header with its row number', () => {
        const records = parsed(
            parseCsvTable('label,amount\nx,1\ny,2,3\nz', COLUMNS, MAX_ROWS),
        );

        expect(records[0]?.issues).toEqual([]);
        expect(records[1]?.issues).toEqual([
            {
                column: null,
                kind: CsvIssueKind.Format,
                message: 'has 3 fields, the header has 2',
                rowNumber: 3,
            },
        ]);
        expect(records[2]?.issues).toEqual([
            {
                column: null,
                kind: CsvIssueKind.Format,
                message: 'has 1 field, the header has 2',
                rowNumber: 4,
            },
        ]);
    });

    it('flags an unterminated quote on the row where it opens', () => {
        const records = parsed(
            parseCsvTable('label,amount\nx,1\n"y,2\nz,3', COLUMNS, MAX_ROWS),
        );

        expect(records.at(-1)?.rowNumber).toBe(3);
        expect(records.at(-1)?.issues).toContainEqual({
            column: null,
            kind: CsvIssueKind.Format,
            message: 'has a quote that is never closed',
            rowNumber: 3,
        });
    });
});

describe('describeCsvFailure', () => {
    it('names the limit and the columns', () => {
        expect(
            describeCsvFailure({
                actual: 300_000,
                kind: CsvFailureKind.TooLarge,
                limit: MAX_CSV_BYTES,
            }),
        ).toBe('The CSV is 300,000 bytes; the limit is 262,144 bytes (256 KB)');
        expect(
            describeCsvFailure({
                actual: 201,
                kind: CsvFailureKind.TooManyRows,
                limit: 200,
            }),
        ).toBe(
            'The CSV has 201 data rows; at most 200 can be imported at once',
        );
        expect(
            describeCsvFailure({
                columns: ['amount', 'label'],
                kind: CsvFailureKind.MissingColumns,
            }),
        ).toBe('The header is missing the columns: amount, label');
        expect(
            describeCsvFailure({
                columns: ['amnt'],
                kind: CsvFailureKind.UnknownColumns,
            }),
        ).toBe('The header has unknown columns: amnt');
        expect(
            describeCsvFailure({
                columns: ['label'],
                kind: CsvFailureKind.DuplicateColumns,
            }),
        ).toBe('The header repeats the columns: label');
        expect(describeCsvFailure({ kind: CsvFailureKind.Empty })).toBe(
            'The CSV has no data rows',
        );
    });
});

describe('CsvRowReader', () => {
    it('reads dollar amounts as exact cents', () => {
        const reader = readerFor({ [Column.Amount]: ' 1234.56 ' });

        expect(reader.money(Column.Amount)).toBe(123_456);
        expect(readerFor({ [Column.Amount]: '0.1' }).money(Column.Amount)).toBe(
            10,
        );
        expect(readerFor({ [Column.Amount]: '-5' }).money(Column.Amount)).toBe(
            -500,
        );
        expect(reader.issues).toEqual([]);
    });

    it.each([
        ['$250', 25_000],
        ['1,000', 100_000],
        ['$52,400.00', 5_240_000],
        ['-$12.34', -1234],
    ])('reads the money cell "%s" as the account form does', (text, cents) => {
        const reader = readerFor({ [Column.Amount]: text });

        expect(reader.money(Column.Amount)).toBe(cents);
        expect(reader.issues).toEqual([]);
    });

    it.each(['12.345', 'abc', '1e3', '21474836.48', '-21474836.49'])(
        'rejects the money cell "%s" with a cell issue naming the format and the storable range',
        (text) => {
            const reader = readerFor({ [Column.Amount]: text });

            expect(reader.money(Column.Amount)).toBeUndefined();
            expect(reader.issues).toEqual([
                {
                    column: Column.Amount,
                    kind: CsvIssueKind.Cell,
                    message:
                        'must be a dollar amount like 1234.56 with at most 2 decimals, from -21474836.48 to 21474836.47',
                    rowNumber: 7,
                },
            ]);
        },
    );

    it('flags an empty required cell and returns undefined for an empty optional one', () => {
        const reader = readerFor({ [Column.Amount]: ' ', [Column.Note]: '' });

        expect(reader.money(Column.Amount)).toBeUndefined();
        expect(reader.text(Column.Note)).toBeUndefined();
        expect(reader.text(Column.Label)).toBeUndefined();
        expect(reader.issues).toEqual([
            {
                column: Column.Amount,
                kind: CsvIssueKind.Cell,
                message: 'is required',
                rowNumber: 7,
            },
            {
                column: Column.Label,
                kind: CsvIssueKind.Cell,
                message: 'is required',
                rowNumber: 7,
            },
        ]);
    });

    it('reads counts, dates, yes/no flags, enum choices and comma lists', () => {
        const reader = readerFor({
            [Column.Amount]: '12',
            [Column.Label]: 'DARK-BLUE',
            [Column.Note]: ' a, b ,a,, c ',
        });

        expect(reader.count(Column.Amount)).toBe(12);
        expect(reader.choice(Column.Label, Colour)).toBe(Colour.DarkBlue);
        expect(reader.list(Column.Note)).toEqual(['a', 'b', 'c']);
        expect(readerFor({ [Column.Note]: 'Yes' }).flag(Column.Note)).toBe(
            true,
        );
        expect(readerFor({ [Column.Note]: 'n' }).flag(Column.Note)).toBe(false);
        expect(
            readerFor({ [Column.Note]: '2026-09-26' }).date(Column.Note),
        ).toBe('2026-09-26');
        expect(reader.issues).toEqual([]);
    });

    it('flags bad counts, dates, flags and choices with the accepted forms', () => {
        const reader = readerFor({
            [Column.Amount]: '-1',
            [Column.Label]: 'green',
            [Column.Note]: '26/09/2026',
        });

        expect(reader.count(Column.Amount)).toBeUndefined();
        expect(reader.choice(Column.Label, Colour)).toBeUndefined();
        expect(reader.date(Column.Note)).toBeUndefined();
        const flagReader = readerFor({ [Column.Note]: 'maybe' });
        expect(flagReader.flag(Column.Note)).toBeUndefined();
        expect(
            [...reader.issues, ...flagReader.issues].map(
                (issue) => issue.message,
            ),
        ).toEqual([
            'must be a whole number of 0 or more',
            'must be one of: dark-blue, red',
            'must be a real date written as YYYY-MM-DD, in the years 2000 to 2100',
            'must be yes or no',
        ]);
    });

    it.each(['2026-02-30', '2026-13-01', '1999-12-31', '2101-01-01'])(
        'rejects the date cell "%s" that is not a real account date as a cell issue',
        (text) => {
            const reader = readerFor({ [Column.Note]: text });

            expect(reader.date(Column.Note)).toBeUndefined();
            expect(reader.issues).toEqual([
                {
                    column: Column.Note,
                    kind: CsvIssueKind.Cell,
                    message:
                        'must be a real date written as YYYY-MM-DD, in the years 2000 to 2100',
                    rowNumber: 7,
                },
            ]);
        },
    );

    it('accepts the first and last account dates', () => {
        const reader = readerFor({ [Column.Note]: '2000-01-01' });

        expect(reader.date(Column.Note)).toBe('2000-01-01');
        expect(
            readerFor({ [Column.Note]: '2100-12-31' }).date(Column.Note),
        ).toBe('2100-12-31');
        expect(reader.issues).toEqual([]);
    });

    it('maps schema issues onto the most specific column and skips columns that already have a cell issue', () => {
        const reader = readerFor({ [Column.Amount]: 'x' });
        reader.money(Column.Amount);

        reader.addSchemaIssues(
            [
                {
                    code: 'custom',
                    input: undefined,
                    message: 'amount is wrong',
                    path: ['amountCents'],
                },
                {
                    code: 'custom',
                    input: undefined,
                    message: 'note too long',
                    path: ['details', 'note'],
                },
                {
                    code: 'custom',
                    input: undefined,
                    message: 'label taken',
                    path: ['label'],
                },
                {
                    code: 'custom',
                    input: undefined,
                    message: 'the row is wrong',
                    path: [],
                },
            ],
            [
                [Column.Amount, ['amountCents']],
                [Column.Note, ['details', 'note']],
                [Column.Label, ['label']],
            ],
        );

        expect(
            reader.issues.map((issue) => [issue.column, issue.kind]),
        ).toEqual([
            [Column.Amount, CsvIssueKind.Cell],
            [Column.Note, CsvIssueKind.Schema],
            [Column.Label, CsvIssueKind.Schema],
            [null, CsvIssueKind.Schema],
        ]);
    });
});

describe('buildCsvPreview and the commit payload', () => {
    const table = parseCsvTable(
        'label,amount\nfirst,1\nsecond,x\n',
        COLUMNS,
        MAX_ROWS,
    );
    it('keeps a value only for rows without issues and blocks the commit while any row has one', () => {
        const preview = buildCsvPreview(table, readRow, COLUMNS.required);

        expect(preview.kind).toBe(CsvTableKind.Parsed);
        if (preview.kind !== CsvTableKind.Parsed) return;
        expect(preview.rows.map((row) => row.value)).toEqual([
            { amount: 100, label: 'first' },
            null,
        ]);
        expect(csvIssues(preview).map((issue) => issue.rowNumber)).toEqual([3]);
        expect(csvCommitPayload(preview)).toBeNull();
    });

    it('commits every row once all rows are clean, and a later appended issue blocks it again', () => {
        const clean = buildCsvPreview(
            parseCsvTable('label,amount\nfirst,1\nsecond,2', COLUMNS, MAX_ROWS),
            readRow,
            COLUMNS.required,
        );

        expect(csvCommitPayload(clean)).toEqual([
            { amount: 100, label: 'first' },
            { amount: 200, label: 'second' },
        ]);
        const flagged = appendCsvIssues(clean, [
            {
                column: Column.Amount,
                kind: CsvIssueKind.Plausibility,
                message: 'looks like a zero-based balance',
                rowNumber: 3,
            },
        ]);
        expect(csvCommitPayload(flagged)).toBeNull();
        expect(csvIssues(flagged)).toHaveLength(1);
    });

    it('passes a failed table through and never commits it', () => {
        const failed = buildCsvPreview(
            parseCsvTable('', COLUMNS, MAX_ROWS),
            readRow,
            COLUMNS.required,
        );

        expect(failed).toEqual({
            failure: { kind: CsvFailureKind.Empty },
            kind: CsvTableKind.Failed,
        });
        expect(csvCommitPayload(failed)).toBeNull();
    });
});
