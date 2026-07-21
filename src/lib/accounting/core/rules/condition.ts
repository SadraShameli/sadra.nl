import type {
    BookingDirection,
    CurrencyCode,
    ISODate,
    RawTransaction,
} from '~/lib/accounting/core/types';

import { IsoDate } from '~/lib/accounting/core/date';

export interface RuleCondition {
    isSatisfiedBy(tx: RawTransaction): boolean;
}

export class AmountRangeCondition implements RuleCondition {
    constructor(
        private readonly min: null | number,
        private readonly max: null | number,
    ) {}

    isSatisfiedBy(tx: RawTransaction): boolean {
        const amount = Math.abs(tx.sourceAmount);
        if (this.min !== null && amount < this.min) return false;
        return this.max === null || amount <= this.max;
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
        if (this.from !== null && IsoDate.isBefore(tx.date, this.from)) {
            return false;
        }
        return this.to === null || !IsoDate.isBefore(this.to, tx.date);
    }
}

export class DirectionCondition implements RuleCondition {
    constructor(private readonly direction: BookingDirection) {}

    isSatisfiedBy(tx: RawTransaction): boolean {
        return tx.direction === this.direction;
    }
}
