import { defineCommand } from 'citty';

import { AccountingProviderResolver } from '~/cli/commands/accounting/AccountingProviderResolver';
import { formatLedger } from '~/cli/commands/accounting/mutations/format';
import { ui } from '~/cli/ui';
import { endDb } from '~/server/db';

export default defineCommand({
    args: {
        credential: {
            description: 'Accounting credential id or label to use',
            type: 'string',
        },
        search: {
            description:
                'Only show ledgers whose code or description contains this text',
            type: 'string',
        },
    },
    meta: {
        description: 'List ledgers from your accounting provider',
        name: 'ledgers',
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
                const spinner = ui
                    .spinner(`Fetching ledgers from ${label}`)
                    .start();
                const ledgers = await session.listLedgers();
                spinner.succeed(`${ledgers.length} ledger(s) fetched`);

                const search = context.args.search?.toLowerCase();
                const filtered = search
                    ? ledgers.filter(
                          (l) =>
                              l.code.toLowerCase().includes(search) ||
                              l.description.toLowerCase().includes(search),
                      )
                    : ledgers;

                for (const ledger of filtered) ui.note(formatLedger(ledger));
                if (filtered.length === 0) ui.warn('No matching ledgers.');
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
