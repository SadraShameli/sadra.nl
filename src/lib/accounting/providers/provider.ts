import type { Booking } from '../core/types';

export interface AccountingProvider {
    readonly id: string;
    readonly label: string;
    openSession(opts: OpenSessionOptions): Promise<ProviderSession>;
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
    listLedgers(opts?: { category?: string }): Promise<ProviderLedger[]>;
    listMutations(opts: ListMutationsOptions): Promise<ProviderMutation[]>;
    postBooking(booking: Booking): Promise<PostBookingResult>;
}

const registry = new Map<string, AccountingProvider>();

export function getProvider(id: string): AccountingProvider | undefined {
    return registry.get(id);
}

export function listProviders(): AccountingProvider[] {
    return [...registry.values()];
}

export function registerProvider(provider: AccountingProvider): void {
    registry.set(provider.id, provider);
}
