import 'server-only';

import type { Booking } from '~/lib/accounting/core/types';

import type {
    AccountingProvider,
    OpenSessionOptions,
    PostBookingResult,
    ProviderLedger,
    ProviderMutation,
    ProviderSession,
} from '../provider';
import type { LedgerResponse, MutationResponse } from './schemas';

import { registerProvider } from '../provider';
import { bookingToMutationPayload } from './booking';
import { EBoekhoudenClient } from './client';
import {
    AdministrationsResource,
    CostCentersResource,
    LedgersResource,
    MutationsResource,
    RelationsResource,
    SessionsResource,
} from './resources';

const adaptLedger = (ledger: LedgerResponse): ProviderLedger => ({
    category: ledger.category,
    code: ledger.code,
    description: ledger.description,
    externalId: ledger.id,
    group: ledger.group ?? null,
});

const adaptMutation = (m: MutationResponse): ProviderMutation => ({
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

class EBoekhoudenSession implements ProviderSession {
    readonly administrations: AdministrationsResource;
    readonly costCenters: CostCentersResource;
    readonly ledgers: LedgersResource;
    readonly mutations: MutationsResource;
    readonly relations: RelationsResource;
    readonly sessions: SessionsResource;

    constructor(private readonly client: EBoekhoudenClient) {
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
        const PAGE = 2000;
        let latest: null | string = null;
        let offset = 0;
        for (;;) {
            const page = await this.mutations.list({ limit: PAGE, offset });
            for (const m of page) {
                const d = adaptMutation(m).date;
                if (!latest || d > latest) latest = d;
            }
            if (page.length < PAGE) break;
            offset += PAGE;
        }
        return latest;
    }

    async listLedgers(
        opts: { category?: string } = {},
    ): Promise<ProviderLedger[]> {
        const all = await this.ledgers.list({ limit: 500 });
        const adapted = all.map((l) => adaptLedger(l));
        if (opts.category)
            return adapted.filter((l) => l.category === opts.category);
        return adapted;
    }

    async listMutations(opts: { limit: number }): Promise<ProviderMutation[]> {
        const rows = await this.mutations.list({ limit: opts.limit });
        return rows
            .map((m) => adaptMutation(m))
            .toSorted((a, b) => {
                if (a.date !== b.date) return a.date < b.date ? 1 : -1;
                return b.externalId - a.externalId;
            })
            .slice(0, opts.limit);
    }

    async postBooking(booking: Booking): Promise<PostBookingResult> {
        const payload = bookingToMutationPayload(booking);
        const created = await this.mutations.create(payload);
        return { externalId: created.id };
    }
}

export const eboekhoudenProvider: AccountingProvider = {
    id: 'eboekhouden',
    label: 'eBoekhouden',
    async openSession(opts: OpenSessionOptions): Promise<ProviderSession> {
        const source =
            typeof opts.meta?.source === 'string'
                ? opts.meta.source
                : 'sadranl';
        const client = new EBoekhoudenClient(opts.secret, {
            fetchImpl: opts.fetchImpl,
            source,
        });
        await client.openSession();
        return new EBoekhoudenSession(client);
    },
};

registerProvider(eboekhoudenProvider);
