import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';

import { FeeKind, PayoutStatus, usdCents } from '~/lib/prop-accounts';
import {
    buildLedgerEntries,
    DEFAULT_LEDGER_FILTERS,
    filterLedgerEntries,
    LEDGER_CSV_COLUMNS,
    type LedgerAccount,
    ledgerAccountName,
    LedgerCashFlow,
    ledgerCashFlow,
    ledgerCsv,
    LedgerCsvColumn,
    ledgerCsvFileName,
    ledgerEntryAccountId,
    LedgerEntryFilter,
    ledgerEntryId,
    LedgerEntryKind,
    type LedgerExportFee,
    type LedgerExportPayout,
} from '~/lib/prop-accounts/csv';
import { FirmId } from '~/lib/prop-calculator';

const USER_ID = 'user-a';
const ALPHA_ID = '11111111-1111-4111-8111-111111111111';
const BRAVO_ID = '22222222-2222-4222-8222-222222222222';

const ALPHA: LedgerAccount = {
    archivedAt: null,
    firmId: FirmId.Mffu,
    id: ALPHA_ID,
    label: 'Alpha',
    planSerial: 'mffu-50000-rapid',
};

const BRAVO: LedgerAccount = {
    archivedAt: null,
    firmId: FirmId.TopStep,
    id: BRAVO_ID,
    label: 'Bravo',
    planSerial: 'topstep-50000-standard',
};

function fee(
    overrides: Partial<LedgerExportFee> & Pick<LedgerExportFee, 'id'>,
): LedgerExportFee {
    return {
        accountId: ALPHA_ID,
        amountCents: usdCents(16_700),
        kind: FeeKind.EvalPurchase,
        note: null,
        paidOn: '2026-09-01',
        userId: USER_ID,
        ...overrides,
    };
}

function parseRows(text: string): string[][] {
    return Papa.parse<string[]>(text, {
        newline: '\r\n',
        skipEmptyLines: true,
    }).data;
}

function payout(
    overrides: Partial<LedgerExportPayout> & Pick<LedgerExportPayout, 'id'>,
): LedgerExportPayout {
    return {
        accountId: ALPHA_ID,
        grossCents: usdCents(100_000),
        netCents: usdCents(90_000),
        note: null,
        paidOn: '2026-09-10',
        requestedOn: '2026-09-08',
        status: PayoutStatus.Paid,
        userId: USER_ID,
        ...overrides,
    };
}

describe('ledgerCsv', () => {
    it('writes the header and one CRLF row per entry, money as exact decimal strings from cents', () => {
        const entries = buildLedgerEntries(
            [ALPHA],
            [
                payout({
                    grossCents: usdCents(123_456),
                    id: 'p1',
                    netCents: null,
                }),
            ],
            [fee({ amountCents: usdCents(5), id: 'f1' })],
        );

        const text = ledgerCsv(entries);

        expect(text.split('\r\n', 1)[0]).toBe(
            'date,account,firm,plan,entry,kind,status,requestedOn,paidOn,gross,net,amount,cashFlow,note,accountId',
        );
        expect(parseRows(text)).toEqual([
            LEDGER_CSV_COLUMNS,
            [
                '2026-09-10',
                'Alpha',
                FirmId.Mffu,
                'mffu-50000-rapid',
                LedgerEntryKind.Payout,
                '',
                PayoutStatus.Paid,
                '2026-09-08',
                '2026-09-10',
                '1234.56',
                '',
                '',
                LedgerCashFlow.In,
                '',
                ALPHA_ID,
            ],
            [
                '2026-09-01',
                'Alpha',
                FirmId.Mffu,
                'mffu-50000-rapid',
                LedgerEntryKind.Fee,
                FeeKind.EvalPurchase,
                '',
                '',
                '2026-09-01',
                '',
                '',
                '0.05',
                LedgerCashFlow.Out,
                '',
                ALPHA_ID,
            ],
        ]);
    });

    it('writes whole dollars without a fraction and keeps every cent', () => {
        const entries = buildLedgerEntries(
            [ALPHA],
            [payout({ grossCents: usdCents(50_000), id: 'p1' })],
            [fee({ amountCents: usdCents(2_147_483_647), id: 'f1' })],
        );

        const [, payoutRow, feeRow] = parseRows(ledgerCsv(entries));

        expect(payoutRow?.[9]).toBe('500');
        expect(payoutRow?.[10]).toBe('900');
        expect(feeRow?.[11]).toBe('21474836.47');
    });

    it.each([
        ['=', '=HYPERLINK("https://evil.example","x")'],
        ['+', '+1+1'],
        ['-', '-2+3'],
        ['@', '@SUM(A1)'],
        ['a tab', '\t=1+1'],
        ['a carriage return', '\r=1+1'],
        ['= across lines', '=1+1\nsecond line'],
    ])(
        'neutralizes a cell starting with %s so a spreadsheet never runs it',
        (_start, dangerous) => {
            const entries = buildLedgerEntries(
                [{ ...ALPHA, label: dangerous }],
                [],
                [fee({ id: 'f1', note: dangerous })],
            );

            const [, row] = parseRows(ledgerCsv(entries));

            expect(row?.[1]).toBe(`'${dangerous}`);
            expect(row?.[13]).toBe(`'${dangerous}`);
        },
    );

    it('leaves safe text untouched and quotes commas and quotes', () => {
        const entries = buildLedgerEntries(
            [{ ...ALPHA, label: 'Alpha, "main"' }],
            [],
            [fee({ id: 'f1', note: 'plain note' })],
        );

        const text = ledgerCsv(entries);

        expect(text).toContain('"Alpha, ""main"""');
        expect(parseRows(text)[1]?.[13]).toBe('plain note');
    });

    it('exports a refund with its kind and as cash in, never as a cost', () => {
        const entries = buildLedgerEntries(
            [ALPHA],
            [],
            [
                fee({
                    amountCents: usdCents(8000),
                    id: 'r1',
                    kind: FeeKind.Refund,
                }),
            ],
        );

        const [, row] = parseRows(ledgerCsv(entries));

        expect(row?.[5]).toBe(FeeKind.Refund);
        expect(row?.[11]).toBe('80');
        expect(row?.[12]).toBe(LedgerCashFlow.In);
    });

    it('tells apart an archived and an active account that share a label', () => {
        const retired: LedgerAccount = {
            ...BRAVO,
            archivedAt: new Date('2026-06-01T00:00:00Z'),
            label: 'Alpha',
        };
        const entries = buildLedgerEntries(
            [ALPHA, retired],
            [],
            [
                fee({ id: 'f-active', paidOn: '2026-09-02' }),
                fee({ accountId: BRAVO_ID, id: 'f-archived' }),
            ],
        );

        const rows = parseRows(ledgerCsv(entries)).slice(1);

        expect(ledgerAccountName(ALPHA)).toBe('Alpha');
        expect(ledgerAccountName(retired)).toBe('Alpha (archived)');
        expect(rows.map((row) => [row[1], row[14]])).toEqual([
            ['Alpha', ALPHA_ID],
            ['Alpha (archived)', BRAVO_ID],
        ]);
    });

    it('writes only the header for an empty ledger', () => {
        expect(ledgerCsv([])).toBe(`${LEDGER_CSV_COLUMNS.join(',')}\r\n`);
    });
});

describe('ledgerCashFlow', () => {
    it('counts paid payouts and refunds as cash in, other fees as cash out and unpaid payouts as none', () => {
        const entries = buildLedgerEntries(
            [ALPHA],
            [
                payout({ id: 'paid' }),
                payout({
                    id: 'requested',
                    paidOn: null,
                    requestedOn: '2026-09-20',
                    status: PayoutStatus.Requested,
                }),
                payout({
                    id: 'denied',
                    paidOn: null,
                    requestedOn: '2026-09-21',
                    status: PayoutStatus.Denied,
                }),
            ],
            [
                fee({ id: 'refund', kind: FeeKind.Refund }),
                fee({ id: 'reset', kind: FeeKind.Reset, paidOn: '2026-09-02' }),
            ],
        );

        expect(
            entries.map((entry) => [
                ledgerEntryId(entry),
                ledgerCashFlow(entry),
            ]),
        ).toEqual([
            ['denied', LedgerCashFlow.None],
            ['requested', LedgerCashFlow.None],
            ['paid', LedgerCashFlow.In],
            ['reset', LedgerCashFlow.Out],
            ['refund', LedgerCashFlow.In],
        ]);
    });
});

describe('buildLedgerEntries and filterLedgerEntries', () => {
    const entries = buildLedgerEntries(
        [ALPHA, BRAVO],
        [
            payout({ id: 'alpha-paid' }),
            payout({
                accountId: BRAVO_ID,
                id: 'bravo-requested',
                paidOn: null,
                requestedOn: '2026-09-15',
                status: PayoutStatus.Requested,
            }),
        ],
        [
            fee({ id: 'alpha-fee', paidOn: '2026-08-31' }),
            fee({ accountId: BRAVO_ID, id: 'bravo-fee', paidOn: '2026-09-10' }),
            fee({
                accountId: 'gone-account',
                id: 'orphan-fee',
                paidOn: '2026-07-01',
            }),
        ],
    );

    function idsOf(list: typeof entries): string[] {
        return list.map((entry) => ledgerEntryId(entry));
    }

    it('dates a payout by its paid date, else its request date, and sorts newest first', () => {
        expect(
            entries.map((entry) => [ledgerEntryId(entry), entry.on]),
        ).toEqual([
            ['bravo-requested', '2026-09-15'],
            ['alpha-paid', '2026-09-10'],
            ['bravo-fee', '2026-09-10'],
            ['alpha-fee', '2026-08-31'],
            ['orphan-fee', '2026-07-01'],
        ]);
    });

    it('keeps an entry whose account is gone, without an account', () => {
        const orphan = entries.at(-1);
        if (orphan === undefined) throw new Error('no orphan entry');

        expect(orphan.account).toBeNull();
        expect(ledgerEntryAccountId(orphan)).toBe('gone-account');
        const [, row] = parseRows(ledgerCsv([orphan]));
        expect(row?.slice(1, 4)).toEqual(['gone-account', '', '']);
        expect(row?.[14]).toBe('gone-account');
    });

    it('filters by account, entry kind and an inclusive date range', () => {
        expect(
            idsOf(filterLedgerEntries(entries, DEFAULT_LEDGER_FILTERS)),
        ).toEqual(idsOf(entries));
        expect(
            idsOf(
                filterLedgerEntries(entries, {
                    ...DEFAULT_LEDGER_FILTERS,
                    accountId: BRAVO_ID,
                }),
            ),
        ).toEqual(['bravo-requested', 'bravo-fee']);
        expect(
            idsOf(
                filterLedgerEntries(entries, {
                    ...DEFAULT_LEDGER_FILTERS,
                    entries: LedgerEntryFilter.Fees,
                }),
            ),
        ).toEqual(['bravo-fee', 'alpha-fee', 'orphan-fee']);
        expect(
            idsOf(
                filterLedgerEntries(entries, {
                    ...DEFAULT_LEDGER_FILTERS,
                    entries: LedgerEntryFilter.Payouts,
                }),
            ),
        ).toEqual(['bravo-requested', 'alpha-paid']);
        expect(
            idsOf(
                filterLedgerEntries(entries, {
                    ...DEFAULT_LEDGER_FILTERS,
                    from: '2026-08-31',
                    to: '2026-09-10',
                }),
            ),
        ).toEqual(['alpha-paid', 'bravo-fee', 'alpha-fee']);
    });

    it('names the export file after the date', () => {
        expect(ledgerCsvFileName('2026-09-26')).toBe(
            'prop-ledger-2026-09-26.csv',
        );
    });

    it('lists the columns in export order', () => {
        expect(LEDGER_CSV_COLUMNS).toEqual([
            LedgerCsvColumn.Date,
            LedgerCsvColumn.Account,
            LedgerCsvColumn.Firm,
            LedgerCsvColumn.Plan,
            LedgerCsvColumn.Entry,
            LedgerCsvColumn.Kind,
            LedgerCsvColumn.Status,
            LedgerCsvColumn.RequestedOn,
            LedgerCsvColumn.PaidOn,
            LedgerCsvColumn.Gross,
            LedgerCsvColumn.Net,
            LedgerCsvColumn.Amount,
            LedgerCsvColumn.CashFlow,
            LedgerCsvColumn.Note,
            LedgerCsvColumn.AccountId,
        ]);
    });
});
