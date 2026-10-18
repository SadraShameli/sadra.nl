import type { ExternalId, LedgerId } from '~/lib/accounting/core/ids';
import type { TaxCodeCatalog } from '~/lib/accounting/core/tax-code';
import type { Booking } from '~/lib/accounting/core/types';

import { IsoDate } from '~/lib/accounting/core/date';
import {
    type DateBounds,
    DateFilter,
} from '~/lib/accounting/providers/date-filter';

export interface AccountingProvider {
    readonly id: string;
    readonly label: string;
    openSession(options: OpenSessionOptions): Promise<ProviderSession>;
}

export interface ListMutationsOptions extends MutationDateRange {
    limit: number;
    offset?: number;
}

export interface MutationDateRange {
    dateFrom?: string;
    dateTo?: string;
}

export interface OpenSessionOptions {
    meta?: Record<string, unknown>;
    secret: string;
}

export interface PostBookingResult {
    externalId: ExternalId;
}

export interface ProviderLedger {
    category: string;
    code: string;
    description: string;
    externalId: LedgerId;
    group: null | string;
}

export interface ProviderMutation {
    amount: null | number;
    date: string;
    description: null | string;
    externalId: ExternalId;
    ledgerId: LedgerId;
    paymentReference: null | string;
    rows: ProviderMutationRow[];
    type: string;
}

export interface ProviderMutationRow {
    amount: number;
    description: null | string;
    ledgerId: LedgerId | null;
    vatCode: null | string;
}

export interface ProviderSession {
    close(): Promise<void>;
    countMutations(range: MutationDateRange): Promise<null | number>;
    latestMutationDate(): Promise<null | string>;
    listLedgers(options?: { category?: string }): Promise<ProviderLedger[]>;
    listMutations(options: ListMutationsOptions): Promise<ProviderMutation[]>;
    postBooking(booking: Booking): Promise<PostBookingResult>;
    taxCodes(): Promise<TaxCodeCatalog>;
}

export class ProviderRegistry {
    private static instanceValue: null | ProviderRegistry = null;

    static instance(): ProviderRegistry {
        this.instanceValue ??= new ProviderRegistry();
        return this.instanceValue;
    }

    private readonly providers: Map<string, AccountingProvider>;

    private constructor() {
        this.providers = new Map<string, AccountingProvider>();
    }

    get(id: string): AccountingProvider | undefined {
        return this.providers.get(id);
    }

    list(): AccountingProvider[] {
        return this.providers.values().toArray();
    }

    register(p: AccountingProvider): void {
        this.providers.set(p.id, p);
    }
}

export abstract class ProviderSessionBase implements ProviderSession {
    abstract close(): Promise<void>;
    abstract countMutations(range: MutationDateRange): Promise<null | number>;
    abstract latestMutationDate(): Promise<null | string>;
    abstract listLedgers(options?: {
        category?: string;
    }): Promise<ProviderLedger[]>;
    abstract listMutations(
        options: ListMutationsOptions,
    ): Promise<ProviderMutation[]>;
    abstract postBooking(booking: Booking): Promise<PostBookingResult>;
    abstract taxCodes(): Promise<TaxCodeCatalog>;

    protected async collectNewestFirst<T>(
        bounds: DateBounds,
        atLeast: number,
        within: (slice: DateBounds) => Promise<T[]>,
    ): Promise<T[]> {
        const found: T[] = [];
        for (const slice of DateFilter.newestFirstSlices(
            bounds,
            IsoDate.today(),
        )) {
            found.push(...(await within(slice)));
            if (found.length >= atLeast) break;
        }
        return found;
    }

    protected async paginate<T>(
        fetchPage: (offset: number) => Promise<T[]>,
        pageSize: number,
    ): Promise<T[]> {
        const results: T[] = [];
        let offset = 0;
        for (;;) {
            const page = await fetchPage(offset);
            results.push(...page);
            if (page.length < pageSize) break;
            offset += pageSize;
        }
        return results;
    }
}

export function newestMutationFirst(
    a: ProviderMutation,
    b: ProviderMutation,
): number {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return b.externalId.localeCompare(a.externalId, undefined, {
        numeric: true,
    });
}
