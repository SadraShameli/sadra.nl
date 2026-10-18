import 'server-only';

import type { TaxCodeCatalog } from '~/lib/accounting/core/tax-code';
import type { Booking } from '~/lib/accounting/core/types';
import type {
    LedgerResponse,
    MutationResponse,
} from '~/lib/accounting/providers/eboekhouden/schemas';
import type {
    AccountingProvider,
    ListMutationsOptions,
    OpenSessionOptions,
    PostBookingResult,
    ProviderLedger,
    ProviderMutation,
} from '~/lib/accounting/providers/provider';

import { bookingToMutationPayload } from '~/lib/accounting/providers/eboekhouden/booking';
import { EBoekhoudenClient } from '~/lib/accounting/providers/eboekhouden/client';
import { eboekhoudenTaxCodes } from '~/lib/accounting/providers/eboekhouden/enums';
import {
    AdministrationsResource,
    CostCentersResource,
    LedgersResource,
    MutationsResource,
    RelationsResource,
    SessionsResource,
} from '~/lib/accounting/providers/eboekhouden/resources';
import {
    ProviderRegistry,
    ProviderSessionBase,
} from '~/lib/accounting/providers/provider';

const MUTATION_PAGE_SIZE = 2000;

export const adaptLedger = (ledger: LedgerResponse): ProviderLedger => ({
    category: ledger.category,
    code: ledger.code,
    description: ledger.description,
    externalId: ledger.id,
    group: ledger.group ?? null,
});

export const adaptMutation = (m: MutationResponse): ProviderMutation => ({
    amount: m.amount ?? null,
    date: m.date,
    description: m.description ?? null,
    externalId: m.id,
    ledgerId: m.ledgerId,
    paymentReference: m.paymentReference ?? null,
    rows: m.rows.map((r) => ({
        amount: r.amount,
        description: r.description ?? null,
        ledgerId: r.ledgerId ?? null,
        vatCode: r.vatCode ?? null,
    })),
    type: m.type,
});

interface SharedSession {
    holders: number;
    readonly session: Promise<EBoekhoudenSession>;
}

class EBoekhoudenSession extends ProviderSessionBase {
    readonly administrations: AdministrationsResource;
    readonly costCenters: CostCentersResource;
    readonly ledgers: LedgersResource;
    readonly mutations: MutationsResource;
    readonly relations: RelationsResource;
    readonly sessions: SessionsResource;

    constructor(private readonly client: EBoekhoudenClient) {
        super();
        this.sessions = new SessionsResource(client);
        this.administrations = new AdministrationsResource(client);
        this.costCenters = new CostCentersResource(client);
        this.ledgers = new LedgersResource(client);
        this.mutations = new MutationsResource(client);
        this.relations = new RelationsResource(client);
    }

    async close(): Promise<void> {
        await this.sessions.close();
    }

    async latestMutationDate(): Promise<null | string> {
        const mutations = await this.paginate(
            (offset) =>
                this.mutations.list({ limit: MUTATION_PAGE_SIZE, offset }),
            MUTATION_PAGE_SIZE,
        );
        let latest: null | string = null;
        for (const m of mutations) {
            const d = adaptMutation(m).date;
            if (!latest || d > latest) latest = d;
        }
        return latest;
    }

    async listLedgers(
        options: { category?: string } = {},
    ): Promise<ProviderLedger[]> {
        const PAGE = 500;
        const all = await this.paginate(
            (offset) => this.ledgers.list({ limit: PAGE, offset }),
            PAGE,
        );
        const adapted = all.map((l) => adaptLedger(l));
        return options.category
            ? adapted.filter((l) => l.category === options.category)
            : adapted;
    }

    async listMutations(
        options: ListMutationsOptions,
    ): Promise<ProviderMutation[]> {
        const hasDateFilter = Boolean(options.dateFrom ?? options.dateTo);
        const rows = hasDateFilter
            ? await this.paginate(
                  (offset) =>
                      this.mutations.list({
                          limit: MUTATION_PAGE_SIZE,
                          offset,
                      }),
                  MUTATION_PAGE_SIZE,
              )
            : await this.mutations.list({
                  limit: options.limit,
                  offset: options.offset ?? 0,
              });
        let adapted = rows.map((m) => adaptMutation(m));
        if (options.dateFrom) {
            const from = options.dateFrom;
            adapted = adapted.filter((m) => m.date >= from);
        }
        if (options.dateTo) {
            const to = options.dateTo;
            adapted = adapted.filter((m) => m.date <= to);
        }
        const sorted = adapted.toSorted((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? 1 : -1;
            return b.externalId.localeCompare(a.externalId, undefined, {
                numeric: true,
            });
        });
        const pageOffset = hasDateFilter ? (options.offset ?? 0) : 0;
        return sorted.slice(pageOffset, pageOffset + options.limit);
    }

    async postBooking(booking: Booking): Promise<PostBookingResult> {
        const payload = bookingToMutationPayload(booking);
        const created = await this.mutations.create(payload);
        return { externalId: created.id };
    }

    async taxCodes(): Promise<TaxCodeCatalog> {
        return eboekhoudenTaxCodes;
    }
}

class EBoekhoudenSessionLease extends ProviderSessionBase {
    private isReleased = false;

    constructor(
        private readonly session: EBoekhoudenSession,
        private readonly release: () => Promise<void>,
    ) {
        super();
    }

    async close(): Promise<void> {
        if (this.isReleased) return;
        this.isReleased = true;
        await this.release();
    }

    latestMutationDate(): Promise<null | string> {
        return this.session.latestMutationDate();
    }

    listLedgers(options?: { category?: string }): Promise<ProviderLedger[]> {
        return this.session.listLedgers(options);
    }

    listMutations(options: ListMutationsOptions): Promise<ProviderMutation[]> {
        return this.session.listMutations(options);
    }

    postBooking(booking: Booking): Promise<PostBookingResult> {
        return this.session.postBooking(booking);
    }

    taxCodes(): Promise<TaxCodeCatalog> {
        return this.session.taxCodes();
    }
}

class SharedSessionPool {
    private readonly closing = new Map<string, Promise<void>>();
    private readonly open = new Map<string, SharedSession>();

    private async release(key: string, shared: SharedSession): Promise<void> {
        shared.holders -= 1;
        if (shared.holders > 0) return;
        if (this.open.get(key) === shared) this.open.delete(key);
        const closed = closeShared(shared);
        const settled = settle(closed);
        this.closing.set(key, settled);
        try {
            await closed;
        } finally {
            if (this.closing.get(key) === settled) this.closing.delete(key);
        }
    }

    private start(
        key: string,
        openSession: () => Promise<EBoekhoudenSession>,
    ): SharedSession {
        const shared: SharedSession = { holders: 0, session: openSession() };
        this.open.set(key, shared);
        return shared;
    }

    async acquire(
        key: string,
        openSession: () => Promise<EBoekhoudenSession>,
    ): Promise<EBoekhoudenSessionLease> {
        await this.closing.get(key);
        const shared = this.open.get(key) ?? this.start(key, openSession);
        shared.holders += 1;
        try {
            const session = await shared.session;
            return new EBoekhoudenSessionLease(session, () =>
                this.release(key, shared),
            );
        } catch (error) {
            shared.holders -= 1;
            if (this.open.get(key) === shared) this.open.delete(key);
            throw error;
        }
    }
}

async function closeShared(shared: SharedSession): Promise<void> {
    const session = await shared.session;
    await session.close();
}

async function settle(closing: Promise<void>): Promise<void> {
    try {
        await closing;
    } catch (error) {
        if (!(error instanceof Error)) throw error;
    }
}

const SHARED_SESSIONS = new SharedSessionPool();
const DEFAULT_SOURCE = 'sadranl';

export const eboekhoudenProvider: AccountingProvider = {
    id: 'eboekhouden',
    label: 'eBoekhouden',
    async openSession(
        options: OpenSessionOptions,
    ): Promise<EBoekhoudenSessionLease> {
        const source =
            typeof options.meta?.source === 'string'
                ? options.meta.source
                : DEFAULT_SOURCE;
        return SHARED_SESSIONS.acquire(
            JSON.stringify([source, options.secret]),
            async () => {
                const client = new EBoekhoudenClient(options.secret, {
                    source,
                });
                await client.openSession();
                return new EBoekhoudenSession(client);
            },
        );
    },
};

{
    ProviderRegistry.instance().register(eboekhoudenProvider);
}
