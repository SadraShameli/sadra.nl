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

        const [transfers, cards] = await Promise.all([
            client.listTransfers({ from: ctx.from, profileId, to: ctx.to }),
            client.listCardTransactions({
                from: ctx.from,
                profileId,
                to: ctx.to,
            }),
        ]);

        const uniqueAccountIds = [
            ...new Set(transfers.map((t) => t.targetAccountId)),
        ];
        const recipientResults = await Promise.all(
            uniqueAccountIds.map((id) => client.getRecipient(id)),
        );
        const nameByAccount = new Map<number, string>();
        for (const [id, r] of uniqueAccountIds.map(
            (id, i) => [id, recipientResults[i]] as const,
        )) {
            if (r?.accountHolderName) {
                nameByAccount.set(id, r.accountHolderName);
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
        const cardTxns: RawTransaction[] = cards.map((c) => {
            const useSecondary =
                c.primaryCurrency !== 'EUR' && c.secondaryCurrency === 'EUR';
            return {
                date: c.created.slice(0, 10),
                direction: c.isRefund ? 'IN' : 'OUT',
                isRefund: c.isRefund,
                merchant: c.merchant,
                sourceAmount: useSecondary
                    ? c.secondaryAmount
                    : c.primaryAmount,
                sourceCurrency: useSecondary
                    ? c.secondaryCurrency
                    : c.primaryCurrency,
                sourceFee: 0,
                sourceFeeCurrency: null,
                sourceId: 'wise-api',
                txnId: `card-${c.id}`,
            };
        });

        return [...transferTxns, ...cardTxns];
    },
    id: 'wise-api',
    kind: 'api',
    label: 'Wise API',
};

registerSource(wiseApiSource);
