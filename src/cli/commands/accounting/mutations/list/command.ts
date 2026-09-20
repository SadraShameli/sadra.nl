import { defineCommand } from 'citty';

import { AccountingProviderResolver } from '~/cli/commands/accounting/AccountingProviderResolver';
import { formatMutationSummary } from '~/cli/commands/accounting/mutations/format';
import { ui } from '~/cli/ui';
import { endDb } from '~/server/db';

export default defineCommand({
    args: {
        credential: {
            description: 'Accounting credential id or label to use',
            type: 'string',
        },
        limit: {
            default: '20',
            description: 'Max mutations to fetch',
            type: 'string',
        },
        offset: {
            default: '0',
            description: 'Offset into the mutation list',
            type: 'string',
        },
    },
    meta: {
        description: 'List recent mutations from your accounting provider',
        name: 'list',
    },
    async run(context) {
        try {
            const resolved = await AccountingProviderResolver.openSession(
                context.args.credential,
            );
            if (!resolved) {
                process.exitCode = 1;
                return;
            }
            const { label, session } = resolved;
            try {
                const limit = Number(context.args.limit) || 20;
                const offset = Number(context.args.offset) || 0;
                const spinner = ui
                    .spinner(`Fetching mutations from ${label}`)
                    .start();
                const mutations = await session.listMutations({
                    limit,
                    offset,
                });
                spinner.succeed(`${mutations.length} mutation(s) fetched`);
                for (const mutation of mutations) {
                    ui.note(formatMutationSummary(mutation));
                }
            } finally {
                try {
                    await session.close();
                } catch {}
            }
        } finally {
            await endDb();
        }
    },
});
