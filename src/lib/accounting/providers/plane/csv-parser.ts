import Papa from 'papaparse';

import type { RawTransaction } from '~/lib/accounting/core/types';

import { currencyCodeSchema } from '~/lib/accounting/core/currency';
import { isoDateSchema } from '~/lib/accounting/core/date';

const COLUMNS = {
    amount: 'Total payment',
    bankAccount: 'Bank account',
    currency: 'Total payment currency',
    date: 'Payment date',
    status: 'Status',
} as const;

const PAID_STATUS = 'Paid';

export class PlaneCsvParser {
    parse(content: string, meta: Record<string, unknown>): RawTransaction[] {
        const counterpartName =
            typeof meta.counterpartName === 'string' &&
            meta.counterpartName.trim().length > 0
                ? meta.counterpartName.trim()
                : 'Plane.com payout';

        const withoutBom = content.replaceAll(
            String.fromCodePoint(0xfe_ff),
            '',
        );
        const parsed = Papa.parse<Record<string, string>>(withoutBom, {
            header: true,
            skipEmptyLines: true,
        });

        const fields = parsed.meta.fields ?? [];
        if (fields.length === 0) return [];
        for (const column of Object.values(COLUMNS)) {
            if (!fields.includes(column)) {
                throw new Error(
                    `Plane.com CSV is missing expected column "${column}"`,
                );
            }
        }

        const txns: RawTransaction[] = [];
        for (const row of parsed.data) {
            const status = row[COLUMNS.status]?.trim();
            if (status !== PAID_STATUS) continue;

            const dateRaw = row[COLUMNS.date]?.trim();
            const amountRaw = row[COLUMNS.amount]?.trim();
            const currencyRaw = row[COLUMNS.currency]?.trim();
            if (!dateRaw || !amountRaw || !currencyRaw) continue;

            const bankAccount = row[COLUMNS.bankAccount]?.trim() ?? '';

            txns.push({
                date: isoDateSchema.parse(dateRaw),
                direction: 'IN',
                merchant: counterpartName,
                sourceAmount: Number(amountRaw),
                sourceCurrency: currencyCodeSchema.parse(currencyRaw),
                sourceFee: 0,
                sourceFeeCurrency: null,
                sourceId: 'plane-csv',
                txnId: `plane:${dateRaw}:${bankAccount}:${currencyRaw}:${amountRaw}`,
            });
        }
        return txns;
    }
}
