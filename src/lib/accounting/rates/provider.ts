import type { DateRange, ISODate } from '../core/types';

export interface RateProvider {
    ensureRange(range: DateRange): Promise<void>;
    rate(opts: { base: string; on: ISODate; quote: string }): number;
}
