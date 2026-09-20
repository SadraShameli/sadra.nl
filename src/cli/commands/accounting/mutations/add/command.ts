import { defineCommand } from 'citty';

import { EboekhoudenCredentialResolver } from '~/cli/commands/accounting/EboekhoudenCredentialResolver';
import { formatMutationPayload } from '~/cli/commands/accounting/mutations/format';
import { ui } from '~/cli/ui';
import {
    MUTATION_TYPE_LABEL,
    VAT_CODE_LABEL,
} from '~/lib/accounting/providers/eboekhouden/enums';
import {
    buildManualMutationPayload,
    manualMutationInputSchema,
} from '~/lib/accounting/providers/eboekhouden/manual-mutation';
import { MutationsResource } from '~/lib/accounting/providers/eboekhouden/resources';
import { endDb } from '~/server/db';

function enumHelp(labels: Record<string, string>): string {
    return Object.entries(labels)
        .map(([code, label]) => `${code}=${label}`)
        .join(', ');
}

export default defineCommand({
    args: {
        amount: {
            description:
                'Row amount (including VAT unless --in-ex-vat=EX); negative to reverse a prior mutation of the same type',
            required: true,
            type: 'string',
        },
        credential: {
            description: 'eBoekhouden credential id or label to use',
            type: 'string',
        },
        date: {
            description: 'Mutation date, YYYY-MM-DD',
            required: true,
            type: 'string',
        },
        description: {
            description: 'Mutation + row description (max 50 chars)',
            type: 'string',
        },
        inExVat: {
            description: 'IN or EX (defaults based on --vat-code)',
            type: 'string',
        },
        invoiceNumber: {
            description: 'Invoice number to attach',
            type: 'string',
        },
        ledger: {
            description:
                'Top-level ledger id — the account being credited (e.g. a private/equity ledger for personally-funded expenses)',
            required: true,
            type: 'string',
        },
        relationId: {
            description: 'eBoekhouden relation id',
            type: 'string',
        },
        rowDescription: {
            description: 'Row description (defaults to --description)',
            type: 'string',
        },
        rowLedger: {
            description: 'Row ledger id — the expense account being debited',
            required: true,
            type: 'string',
        },
        type: {
            description: `Mutation type: ${enumHelp(MUTATION_TYPE_LABEL)}`,
            required: true,
            type: 'string',
        },
        vatCode: {
            description: `VAT code: ${enumHelp(VAT_CODE_LABEL)}`,
            required: true,
            type: 'string',
        },
        yes: {
            default: false,
            description:
                'Actually post to eBoekhouden (omit for a dry preview only)',
            type: 'boolean',
        },
    },
    meta: {
        description:
            'Manually create a mutation in eBoekhouden (dry by default)',
        name: 'add',
    },
    async run(context) {
        try {
            const parsed = manualMutationInputSchema.safeParse(context.args);
            if (!parsed.success) {
                ui.fail('Invalid input:');
                for (const issue of parsed.error.issues) {
                    ui.note(`${issue.path.join('.')}: ${issue.message}`);
                }
                process.exitCode = 1;
                return;
            }

            const credentialRow =
                await EboekhoudenCredentialResolver.resolveRow(
                    context.args.credential,
                );
            if (!credentialRow) {
                process.exitCode = 1;
                return;
            }

            const payload = buildManualMutationPayload(parsed.data);

            ui.heading(
                `Mutation to post — credential "${credentialRow.label}"`,
            );
            for (const line of formatMutationPayload(payload)) ui.note(line);

            if (!context.args.yes) {
                ui.warn(
                    'Dry run — nothing was posted. Re-run with --yes to create this mutation in eBoekhouden.',
                );
                return;
            }

            const client =
                await EboekhoudenCredentialResolver.openClient(credentialRow);
            try {
                const mutationsApi = new MutationsResource(client);
                const spinner = ui.spinner('Posting mutation').start();
                const created = await mutationsApi.create(payload);
                spinner.succeed(`Mutation created: ${created.id}`);
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
