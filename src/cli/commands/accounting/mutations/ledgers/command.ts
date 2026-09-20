import { defineCommand } from 'citty';

import { EboekhoudenCredentialResolver } from '~/cli/commands/accounting/EboekhoudenCredentialResolver';
import { ui } from '~/cli/ui';
import { LedgersResource } from '~/lib/accounting/providers/eboekhouden/resources';
import { endDb } from '~/server/db';

export default defineCommand({
    args: {
        credential: {
            description: 'eBoekhouden credential id or label to use',
            type: 'string',
        },
        search: {
            description:
                'Only show ledgers whose code or description contains this text',
            type: 'string',
        },
    },
    meta: {
        description: 'List eBoekhouden ledgers (grootboekrekeningen)',
        name: 'ledgers',
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
                const ledgersApi = new LedgersResource(client);
                const spinner = ui.spinner('Fetching ledgers').start();
                const ledgers = await ledgersApi.list({ limit: 500 });
                spinner.succeed(`${ledgers.length} ledger(s) fetched`);

                const search = context.args.search?.toLowerCase();
                const filtered = search
                    ? ledgers.filter(
                          (l) =>
                              l.code.toLowerCase().includes(search) ||
                              l.description.toLowerCase().includes(search),
                      )
                    : ledgers;

                for (const ledger of filtered) {
                    ui.note(
                        `${ledger.id}  ${ledger.code}  ${ledger.description}  (${ledger.category})`,
                    );
                }
                if (filtered.length === 0) ui.warn('No matching ledgers.');
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
