import 'server-only';

import type { EBoekhoudenClient } from '~/lib/accounting/providers/eboekhouden/client';

import {
    type AdministrationResponse,
    administrationSchema,
    type CostCenterResponse,
    costCenterSchema,
    type CreateMutationRequestPayload,
    type LedgerBalanceResponse,
    ledgerBalanceSchema,
    type LedgerResponse,
    ledgerSchema,
    mutationCreatedSchema,
    type MutationResponse,
    mutationSchema,
    omitNullish,
    type RelationResponse,
    relationSchema,
    unwrapItems,
} from '~/lib/accounting/providers/eboekhouden/schemas';
export class AdministrationsResource {
    constructor(private readonly client: EBoekhoudenClient) {}
    async list(): Promise<AdministrationResponse[]> {
        const body = await this.client.request('GET', '/administration');
        return unwrapItems(body, administrationSchema);
    }
    async listLinked(): Promise<AdministrationResponse[]> {
        const body = await this.client.request('GET', '/administration/linked');
        return unwrapItems(body, administrationSchema);
    }
}

export class CostCentersResource {
    constructor(private readonly client: EBoekhoudenClient) {}
    async create(input: {
        active?: boolean;
        description: string;
        parentId?: number;
    }): Promise<CostCenterResponse> {
        const body = await this.client.request('POST', '/costcenter', {
            json: omitNullish(input),
        });
        return costCenterSchema.parse(body);
    }
    async delete(id: number): Promise<void> {
        await this.client.request('DELETE', `/costcenter/${id}`);
    }
    async get(id: number): Promise<CostCenterResponse> {
        const body = await this.client.request('GET', `/costcenter/${id}`);
        return costCenterSchema.parse(body);
    }
    async list(): Promise<CostCenterResponse[]> {
        const body = await this.client.request('GET', '/costcenter');
        return unwrapItems(body, costCenterSchema);
    }
}

export class LedgersResource {
    constructor(private readonly client: EBoekhoudenClient) {}
    async create(input: {
        category: string;
        code: string;
        description: string;
        group?: string;
    }): Promise<LedgerResponse> {
        const body = await this.client.request('POST', '/ledger', {
            json: omitNullish(input),
        });
        return ledgerSchema.parse(body);
    }
    async get(ledgerId: number): Promise<LedgerResponse> {
        const body = await this.client.request('GET', `/ledger/${ledgerId}`);
        return ledgerSchema.parse(body);
    }
    async getBalance(ledgerId: number): Promise<LedgerBalanceResponse> {
        const body = await this.client.request(
            'GET',
            `/ledger/${ledgerId}/balance`,
        );
        if (body && typeof body === 'object' && !Array.isArray(body)) {
            return ledgerBalanceSchema.parse(body);
        }
        return ledgerBalanceSchema.parse({
            balance: typeof body === 'number' ? body : 0,
            ledgerId,
        });
    }
    async list(
        options: { limit?: number; offset?: number } = {},
    ): Promise<LedgerResponse[]> {
        const body = await this.client.request('GET', '/ledger', {
            params: {
                limit: String(options.limit ?? 500),
                offset: String(options.offset ?? 0),
            },
        });
        return unwrapItems(body, ledgerSchema);
    }
}

export class MutationsResource {
    constructor(private readonly client: EBoekhoudenClient) {}
    async create(input: CreateMutationRequestPayload): Promise<{ id: number }> {
        const { checkPaymentReference, rows, ...rest } = input;
        const payload: Record<string, unknown> = omitNullish(rest);
        if (checkPaymentReference) {
            payload.checkPaymentReference = true;
        }
        payload.rows = rows.map((row) => omitNullish(row));
        const body = await this.client.request('POST', '/mutation', {
            json: payload,
        });
        return mutationCreatedSchema.parse(body);
    }
    async get(id: number): Promise<MutationResponse> {
        const body = await this.client.request('GET', `/mutation/${id}`);
        return mutationSchema.parse(body);
    }
    async list(
        options: { limit?: number; offset?: number } = {},
    ): Promise<MutationResponse[]> {
        const body = await this.client.request('GET', '/mutation', {
            params: {
                limit: String(options.limit ?? 2000),
                offset: String(options.offset ?? 0),
            },
        });
        return unwrapItems(body, mutationSchema);
    }
    async listOutstandingInvoices(): Promise<MutationResponse[]> {
        const body = await this.client.request(
            'GET',
            '/mutation/invoice/outstanding',
        );
        return unwrapItems(body, mutationSchema);
    }
}

export class RelationsResource {
    constructor(private readonly client: EBoekhoudenClient) {}
    async create(input: Record<string, unknown>): Promise<RelationResponse> {
        const body = await this.client.request('POST', '/relation', {
            json: omitNullish(input),
        });
        return relationSchema.parse(body);
    }
    async get(id: number): Promise<RelationResponse> {
        const body = await this.client.request('GET', `/relation/${id}`);
        return relationSchema.parse(body);
    }
    async list(
        options: { limit?: number; offset?: number } = {},
    ): Promise<RelationResponse[]> {
        const body = await this.client.request('GET', '/relation', {
            params: {
                limit: String(options.limit ?? 500),
                offset: String(options.offset ?? 0),
            },
        });
        return unwrapItems(body, relationSchema);
    }
}

export class SessionsResource {
    constructor(private readonly client: EBoekhoudenClient) {}
    async close(): Promise<void> {
        await this.client.closeSession();
    }
    async open(): Promise<void> {
        await this.client.openSession();
    }
}
