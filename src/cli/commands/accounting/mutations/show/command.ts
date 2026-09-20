import { defineCommand } from 'citty';

import { EboekhoudenCredentialResolver } from '~/cli/commands/accounting/EboekhoudenCredentialResolver';
import { formatMutationDetail } from '~/cli/commands/accounting/mutations/format';
import { ui } from '~/cli/ui';
import { ExternalId } from '~/lib/accounting/core/ids';
import { MutationsResource } from '~/lib/accounting/providers/eboekhouden/resources';
import { endDb } from '~/server/db';

export default defineCommand({
    args: {
        credential: {
            description: 'eBoekhouden credential id or label to use',
            type: 'string',
        },
        id: {
            description: 'eBoekhouden mutation id',
            required: true,
            type: 'positional',
        },
    },
    meta: {
        description: 'Show a single eBoekhouden mutation in detail',
        name: 'show',
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
                const spinner = ui.spinner('Fetching mutation').start();
                const mutation = await mutationsApi.get(
                    ExternalId(context.args.id),
                );
                spinner.succeed('Mutation fetched');
                for (const line of formatMutationDetail(mutation)) {
                    ui.note(line);
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
