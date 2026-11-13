import Papa from 'papaparse';

import type { RawTransaction } from '~/lib/accounting/core/types';

import { currencyCodeSchema } from '~/lib/accounting/core/currency';
import { isoDateSchema } from '~/lib/accounting/core/date';

const COLUMNS = {
    amount: 'Amount',
    date: 'Date',
    description: 'Description',
} as const;

const BALANCE_CURRENCY = currencyCodeSchema.parse('USD');

const INCOMING_PATTERN =
    /^Paid from (?<payer>\S+)(?:\s+riseid:\s*\S+)?(?:\s+on tx:\s*(?<hash>0x[\da-fA-F]+))?/;

const DATE_PATTERN = /^(?<year>\d{4})\/(?<month>\d{2})\/(?<day>\d{2})\b/;

export class RiseCsvParser {
    parse(content: string): RawTransaction[] {
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
                    `Rise CSV is missing expected column "${column}"`,
                );
            }
        }

        const txns: RawTransaction[] = [];
        for (const row of parsed.data) {
            const description = row[COLUMNS.description]?.trim() ?? '';
            const amount = Number(row[COLUMNS.amount]?.trim());
            const incoming = INCOMING_PATTERN.exec(description);
            const dateParts = DATE_PATTERN.exec(
                row[COLUMNS.date]?.trim() ?? '',
            )?.groups;
            const payer = incoming?.groups?.payer;
            if (
                payer === undefined ||
                dateParts === undefined ||
                !Number.isFinite(amount) ||
                amount <= 0
            ) {
                continue;
            }

            const date = isoDateSchema.parse(
                `${dateParts.year}-${dateParts.month}-${dateParts.day}`,
            );
            txns.push({
                date,
                direction: 'IN',
                merchant: payer,
                sourceAmount: amount,
                sourceCurrency: BALANCE_CURRENCY,
                sourceFee: 0,
                sourceFeeCurrency: null,
                sourceId: 'rise-csv',
                txnId: `rise:${incoming?.groups?.hash ?? `${date}:${payer}:${amount.toFixed(2)}`}`,
            });
        }
        return txns;
    }
}
