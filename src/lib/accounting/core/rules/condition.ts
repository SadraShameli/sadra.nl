import type {
    BookingDirection,
    CurrencyCode,
    ISODate,
    RawTransaction,
} from '~/lib/accounting/core/types';

import { IsoDate } from '~/lib/accounting/core/date';
import { toCents } from '~/lib/accounting/core/money';

export interface RuleCondition {
    isSatisfiedBy(tx: RawTransaction): boolean;
}

export class AmountRangeCondition implements RuleCondition {
    private readonly maxCents: null | number;
    private readonly minCents: null | number;

    constructor(min: null | number, max: null | number) {
        this.minCents = min === null ? null : toCents(min);
        this.maxCents = max === null ? null : toCents(max);
    }

    isSatisfiedBy(tx: RawTransaction): boolean {
        const cents = toCents(Math.abs(tx.sourceAmount));
        return (
            (this.minCents === null || cents >= this.minCents) &&
            (this.maxCents === null || cents <= this.maxCents)
        );
    }
}

export class CurrencyCondition implements RuleCondition {
    constructor(private readonly currency: CurrencyCode) {}

    isSatisfiedBy(tx: RawTransaction): boolean {
        return tx.sourceCurrency === this.currency;
    }
}

export class DateRangeCondition implements RuleCondition {
    constructor(
        private readonly from: ISODate | null,
        private readonly to: ISODate | null,
    ) {}

    isSatisfiedBy(tx: RawTransaction): boolean {
        return (
            (this.from === null || !IsoDate.isBefore(tx.date, this.from)) &&
            (this.to === null || !IsoDate.isBefore(this.to, tx.date))
        );
    }
}

export class DirectionCondition implements RuleCondition {
    constructor(private readonly direction: BookingDirection) {}

    isSatisfiedBy(tx: RawTransaction): boolean {
        return tx.direction === this.direction;
    }
}
