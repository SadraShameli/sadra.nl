import type {
    BookingDirection,
    LedgerReference,
    RawTransaction,
} from '~/lib/accounting/core/types';

import { currencyCodeSchema } from '~/lib/accounting/core/currency';
import { IsoDate } from '~/lib/accounting/core/date';
import {
    AmountRangeCondition,
    CurrencyCondition,
    DateRangeCondition,
    DirectionCondition,
    type RuleCondition,
} from '~/lib/accounting/core/rules/condition';
import {
    MatcherFactory,
    type MatchType,
    type RuleMatcher,
} from '~/lib/accounting/core/rules/matcher';
import { TaxCode } from '~/lib/accounting/core/tax-code';

export interface RuleRow {
    currency?: null | string;
    dateFrom?: null | string;
    dateTo?: null | string;
    direction: BookingDirection;
    display: string;
    id: string;
    ledger: LedgerReference;
    match: string;
    matchType?: MatchType | null;
    maxAmount?: null | number;
    minAmount?: null | number;
    taxCode: string;
}

export class Rule {
    constructor(
        readonly id: string,
        readonly display: string,
        readonly ledger: LedgerReference,
        readonly taxCode: TaxCode,
        private readonly matcher: RuleMatcher,
        private readonly conditions: readonly RuleCondition[],
    ) {}

    static fromRow(row: RuleRow): Rule {
        const conditions: RuleCondition[] = [
            new DirectionCondition(row.direction),
        ];

        if (row.minAmount != null || row.maxAmount != null) {
            conditions.push(
                new AmountRangeCondition(
                    row.minAmount ?? null,
                    row.maxAmount ?? null,
                ),
            );
        }

        if (row.currency != null) {
            conditions.push(
                new CurrencyCondition(currencyCodeSchema.parse(row.currency)),
            );
        }

        if (row.dateFrom != null || row.dateTo != null) {
            conditions.push(
                new DateRangeCondition(
                    row.dateFrom == null ? null : IsoDate.parse(row.dateFrom),
                    row.dateTo == null ? null : IsoDate.parse(row.dateTo),
                ),
            );
        }

        const matcher = MatcherFactory.create(
            row.matchType ?? 'contains',
            row.match,
        );

        return new Rule(
            row.id,
            row.display,
            row.ledger,
            TaxCode.of(row.taxCode),
            matcher,
            conditions,
        );
    }

    matches(tx: RawTransaction): boolean {
        if (!tx.merchant) return false;
        return (
            this.conditions.every((c) => c.isSatisfiedBy(tx)) &&
            this.matcher.matches(tx.merchant)
        );
    }
}
