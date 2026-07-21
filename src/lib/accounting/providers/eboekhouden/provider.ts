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
        const PAGE = 2000;
        const mutations = await this.paginate(
            (offset) => this.mutations.list({ limit: PAGE, offset }),
            PAGE,
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
        if (options.category)
            return adapted.filter((l) => l.category === options.category);
        return adapted;
    }

    async listMutations(
        options: ListMutationsOptions,
    ): Promise<ProviderMutation[]> {
        const hasDateFilter = Boolean(options.dateFrom ?? options.dateTo);
        const rawOffset = hasDateFilter ? 0 : (options.offset ?? 0);
        const rawLimit = hasDateFilter ? 2000 : options.limit;
        const rows = await this.mutations.list({
            limit: rawLimit,
            offset: rawOffset,
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

export const eboekhoudenProvider: AccountingProvider = {
    id: 'eboekhouden',
    label: 'eBoekhouden',
    async openSession(
        options: OpenSessionOptions,
    ): Promise<EBoekhoudenSession> {
        const source =
            typeof options.meta?.source === 'string'
                ? options.meta.source
                : 'sadranl';
        const client = new EBoekhoudenClient(options.secret, { source });
        await client.openSession();
        return new EBoekhoudenSession(client);
    },
};

{
    ProviderRegistry.instance().register(eboekhoudenProvider);
}
