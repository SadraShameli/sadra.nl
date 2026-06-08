import 'server-only';

import type { RawTransaction } from '../core/types';

import { WiseClient } from '../wise/client';
import { type ApiSource, registerSource } from './source';

export const wiseApiSource: ApiSource = {
    credentialKind: 'wise',
    async fetch(ctx) {
        const sandbox =
            typeof ctx.meta.sandbox === 'boolean' ? ctx.meta.sandbox : false;
        const profileId =
            typeof ctx.meta.profileId === 'number' ? ctx.meta.profileId : null;
        if (profileId === null) {
            throw new Error(
                'Wise credential is missing profileId — open Connections and pick a profile.',
            );
        }

        const client = new WiseClient(ctx.secret, {
            fetch: ctx.fetchImpl,
            sandbox,
        });

        const transfers = await client.listTransfers({
            from: ctx.from,
            profileId,
            to: ctx.to,
        });

        const accountIds = new Set(transfers.map((t) => t.targetAccountId));
        const nameByAccount = new Map<number, string>();
        for (const accountId of accountIds) {
            const recipient = await client.getRecipient(accountId);
            if (recipient?.accountHolderName) {
                nameByAccount.set(accountId, recipient.accountHolderName);
            }
        }

        const transferTxns: RawTransaction[] = transfers.map((t) => ({
            date: t.created.slice(0, 10),
            direction: 'OUT',
            merchant:
                nameByAccount.get(t.targetAccountId) ??
                String(t.targetAccountId),
            sourceAmount: t.sourceValue,
            sourceCurrency: t.sourceCurrency,
            sourceFee: 0,
            sourceFeeCurrency: null,
            sourceId: 'wise-api',
            txnId: String(t.id),
        }));

        const cards = await client.listCardTransactions({
            from: ctx.from,
            profileId,
            to: ctx.to,
        });
        const cardTxns: RawTransaction[] = cards.map((c) => ({
            date: c.created.slice(0, 10),
            direction: c.isRefund ? 'IN' : 'OUT',
            isRefund: c.isRefund,
            merchant: c.merchant,
            sourceAmount: c.secondaryAmount,
            sourceCurrency: c.secondaryCurrency,
            sourceFee: 0,
            sourceFeeCurrency: null,
            sourceId: 'wise-api',
            txnId: `card-${c.id}`,
        }));

        return [...transferTxns, ...cardTxns];
    },
    id: 'wise-api',
    kind: 'api',
    label: 'Wise API',
};

registerSource(wiseApiSource);
