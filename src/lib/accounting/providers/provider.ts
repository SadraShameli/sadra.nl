import type { TaxCodeCatalog } from '~/lib/accounting/core/tax-code';
import type { Booking } from '~/lib/accounting/core/types';

export interface AccountingProvider {
    readonly id: string;
    readonly label: string;
    openSession(options: OpenSessionOptions): Promise<ProviderSession>;
    readonly taxCodes?: TaxCodeCatalog;
}

export interface ListMutationsOptions {
    dateFrom?: string;
    dateTo?: string;
    limit: number;
    offset?: number;
}

export interface OpenSessionOptions {
    fetchImpl?: typeof fetch;
    meta?: Record<string, unknown>;
    secret: string;
}

export interface PostBookingResult {
    externalId: number;
}

export interface ProviderLedger {
    category: string;
    code: string;
    description: string;
    externalId: number;
    group: null | string;
}

export interface ProviderMutation {
    date: string;
    description: null | string;
    externalId: number;
    ledgerId: number;
    paymentReference: null | string;
    rows: ProviderMutationRow[];
    type: string;
}

export interface ProviderMutationRow {
    amount: number;
    description: null | string;
    ledgerId: null | number;
    vatCode: null | string;
}

export interface ProviderSession {
    close(): Promise<void>;
    latestMutationDate(): Promise<null | string>;
    listLedgers(options?: { category?: string }): Promise<ProviderLedger[]>;
    listMutations(options: ListMutationsOptions): Promise<ProviderMutation[]>;
    postBooking(booking: Booking): Promise<PostBookingResult>;
}

export class ProviderRegistry {
    private static instanceValue: null | ProviderRegistry = null;

    private readonly providers: Map<string, AccountingProvider>;

    private constructor() {
        this.providers = new Map<string, AccountingProvider>();
    }

    static instance(): ProviderRegistry {
        ProviderRegistry.instanceValue ??= new ProviderRegistry();
        return ProviderRegistry.instanceValue;
    }

    get(id: string): AccountingProvider | undefined {
        return this.providers.get(id);
    }

    list(): AccountingProvider[] {
        return [...this.providers.values()];
    }

    register(p: AccountingProvider): void {
        this.providers.set(p.id, p);
    }
}

export abstract class ProviderSessionBase implements ProviderSession {
    abstract close(): Promise<void>;
    abstract latestMutationDate(): Promise<null | string>;
    abstract listLedgers(options?: {
        category?: string;
    }): Promise<ProviderLedger[]>;
    abstract listMutations(
        options: ListMutationsOptions,
    ): Promise<ProviderMutation[]>;
    abstract postBooking(booking: Booking): Promise<PostBookingResult>;

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
