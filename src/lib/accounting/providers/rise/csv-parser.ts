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
            const incoming = INCOMING_PATTERN.exec(description);
            const payer = incoming?.groups?.payer;
            if (payer === undefined) continue;

            const amountRaw = row[COLUMNS.amount]?.trim() ?? '';
            const amount = Number(amountRaw);
            if (amountRaw === '' || !Number.isFinite(amount) || amount <= 0) {
                throw new Error(
                    `Rise CSV payout from ${payer} has an unreadable amount "${amountRaw}"`,
                );
            }
            const dateRaw = row[COLUMNS.date]?.trim() ?? '';
            const dateParts = DATE_PATTERN.exec(dateRaw)?.groups;
            if (dateParts === undefined) {
                throw new Error(
                    `Rise CSV payout from ${payer} has an unreadable date "${dateRaw}"`,
                );
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
                txnId: `rise:${incoming?.groups?.hash ?? `${date}:${amount.toFixed(2)}:${payer}`}`,
            });
        }
        return txns;
    }
}
