import 'server-only';

import type { RawTransaction } from '~/lib/accounting/core/types';
import type { ApiSourceContext } from '~/lib/accounting/sources/source';

import { currencyCodeSchema } from '~/lib/accounting/core/currency';
import { isoDateSchema } from '~/lib/accounting/core/date';
import { ApiSourceBase, SourceRegistry } from '~/lib/accounting/sources/source';
import { WiseClient } from '~/lib/accounting/wise/client';

class WiseApiSource extends ApiSourceBase {
    readonly credentialKind = 'wise';
    readonly id = 'wise-api';
    readonly label = 'Wise API';

    protected async fetchRaw(
        context: ApiSourceContext,
    ): Promise<RawTransaction[]> {
        const isSandbox =
            typeof context.meta.sandbox === 'boolean'
                ? context.meta.sandbox
                : false;
        const profileId =
            typeof context.meta.profileId === 'number'
                ? context.meta.profileId
                : null;
        if (profileId === null) {
            throw new Error(
                'Wise credential is missing profileId — open Connections and pick a profile.',
            );
        }

        const client = new WiseClient(context.secret, {
            fetch: context.fetchImpl,
            sandbox: isSandbox,
        });

        const [transfers, cards] = await Promise.all([
            client.listTransfers({
                from: context.from,
                profileId,
                to: context.to,
            }),
            client.listCardTransactions({
                from: context.from,
                profileId,
                to: context.to,
            }),
        ]);

        const uniqueAccountIds = [
            ...new Set(transfers.map((t) => t.targetAccountId)),
        ];
        const recipientResults = await Promise.all(
            uniqueAccountIds.map((id) => client.getRecipient(id)),
        );
        const nameByAccount = new Map<number, string>();
        for (const [index, id] of uniqueAccountIds.entries()) {
            const r = recipientResults[index];
            if (r?.accountHolderName) {
                nameByAccount.set(id, r.accountHolderName);
            }
        }

        const transferTxns: RawTransaction[] = transfers.map((t) => ({
            date: isoDateSchema.parse(t.created.slice(0, 10)),
            direction: 'OUT',
            merchant:
                nameByAccount.get(t.targetAccountId) ??
                String(t.targetAccountId),
            sourceAmount: t.sourceValue,
            sourceCurrency: currencyCodeSchema.parse(t.sourceCurrency),
            sourceFee: 0,
            sourceFeeCurrency: null,
            sourceId: 'wise-api',
            txnId: String(t.id),
        }));
        const cardTxns: RawTransaction[] = cards.map((c) => {
            const isUseSecondary =
                c.primaryCurrency !== 'EUR' && c.secondaryCurrency === 'EUR';
            return {
                date: isoDateSchema.parse(c.created.slice(0, 10)),
                direction: c.isRefund ? 'IN' : 'OUT',
                isRefund: c.isRefund,
                merchant: c.merchant,
                sourceAmount: isUseSecondary
                    ? c.secondaryAmount
                    : c.primaryAmount,
                sourceCurrency: currencyCodeSchema.parse(
                    isUseSecondary ? c.secondaryCurrency : c.primaryCurrency,
                ),
                sourceFee: 0,
                sourceFeeCurrency: null,
                sourceId: 'wise-api',
                txnId: `card-${c.id}`,
            };
        });

        return [...transferTxns, ...cardTxns];
    }
}

export const wiseApiSource = new WiseApiSource();

{
    SourceRegistry.instance().register(wiseApiSource);
}
