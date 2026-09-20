import { defineCommand } from 'citty';

import { EboekhoudenCredentialResolver } from '~/cli/commands/accounting/EboekhoudenCredentialResolver';
import { formatMutationSummary } from '~/cli/commands/accounting/mutations/format';
import { ui } from '~/cli/ui';
import { MutationsResource } from '~/lib/accounting/providers/eboekhouden/resources';
import { endDb } from '~/server/db';

export default defineCommand({
    args: {
        credential: {
            description: 'eBoekhouden credential id or label to use',
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
        description: 'List recent eBoekhouden mutations',
        name: 'list',
    },
    async run(context) {
        try {
            const credentialRow = await EboekhoudenCredentialResolver.resolveRow(
                context.args.credential,
            );
            if (!credentialRow) {
                process.exitCode = 1;
                return;
            }

            const client =
                await EboekhoudenCredentialResolver.openClient(credentialRow);
            try {
                const mutationsApi = new MutationsResource(client);
                const limit = Number(context.args.limit) || 20;
                const offset = Number(context.args.offset) || 0;
                const spinner = ui.spinner('Fetching mutations').start();
                const mutations = await mutationsApi.list({ limit, offset });
                spinner.succeed(`${mutations.length} mutation(s) fetched`);
                for (const mutation of mutations) {
                    ui.note(formatMutationSummary(mutation));
                }
            } finally {
                try {
                    await client.closeSession();
                } catch {}
            }
        } finally {
            await endDb();
        }
    },
});
