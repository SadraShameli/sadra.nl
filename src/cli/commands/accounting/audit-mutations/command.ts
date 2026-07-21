import { defineCommand } from 'citty';
import { eq } from 'drizzle-orm';

import type { LedgerResponse } from '~/lib/accounting/providers/eboekhouden/schemas';

import { ui } from '~/cli/ui';
import { LedgerId } from '~/lib/accounting/core/ids';
import { CredentialKind } from '~/lib/accounting/credentials/registry';
import { EBoekhoudenClient } from '~/lib/accounting/providers/eboekhouden/client';
import {
    LedgersResource,
    MutationsResource,
} from '~/lib/accounting/providers/eboekhouden/resources';
import { loadRuleSet } from '~/lib/accounting/rules/load';
import { openSecret } from '~/lib/crypto/secrets';
import {
    accountingBankAccount,
    accountingCredential,
    db,
    endDb,
} from '~/server/db';

import { auditMutations, buildVendorBreakdown } from './audit';
import { mapWithConcurrency, paginate } from './concurrency';
import { printBreakdown, printReport } from './report';

export default defineCommand({
    args: {
        concurrency: {
            default: '6',
            description: 'Concurrent detail requests sent to eBoekhouden',
            type: 'string',
        },
        credential: {
            description:
                'Credential id or label to audit (required if more than one eBoekhouden credential exists)',
            type: 'string',
        },
        limit: {
            description:
                'Only audit the first N mutations (useful for a quick check)',
            type: 'string',
        },
        verbose: {
            default: false,
            description:
                'Print every vendor/rule group with its full code breakdown, not just conflicts',
            type: 'boolean',
        },
    },
    meta: {
        description:
            'Fetch every eBoekhouden mutation and audit VAT/ledger codes for correctness and cross-vendor conflicts',
        name: 'audit-mutations',
    },
    async run(context) {
        const credentialArgument = context.args.credential;
        const concurrency = Number(context.args.concurrency) || 6;
        const limit = context.args.limit
            ? Number(context.args.limit)
            : undefined;
        const isVerbose = context.args.verbose;

        try {
            const rows = await db
                .select()
                .from(accountingCredential)
                .where(
                    eq(accountingCredential.kind, CredentialKind.EBoekhouden),
                );

            if (rows.length === 0) {
                ui.fail('No eBoekhouden credential found in the database.');
                process.exitCode = 1;
                return;
            }

            let credentialRow = rows[0];
            if (rows.length > 1) {
                const match = credentialArgument
                    ? rows.find(
                          (r) =>
                              r.id === credentialArgument ||
                              r.label.toLowerCase() ===
                                  credentialArgument.toLowerCase(),
                      )
                    : undefined;
                if (!match) {
                    ui.fail(
                        'Multiple eBoekhouden credentials found — pass --credential <id|label>:',
                    );
                    for (const r of rows) ui.note(`${r.label}  (${r.id})`);
                    process.exitCode = 1;
                    return;
                }
                credentialRow = match;
            }

            if (!credentialRow?.ciphertext) {
                ui.fail(
                    `Credential "${credentialRow?.label ?? ''}" has no stored secret.`,
                );
                process.exitCode = 1;
                return;
            }

            ui.heading(
                `Auditing eBoekhouden mutations — credential "${credentialRow.label}"`,
            );

            const secret = await openSecret(credentialRow.ciphertext);
            const source =
                typeof credentialRow.meta.source === 'string'
                    ? credentialRow.meta.source
                    : 'sadranl';

            const client = new EBoekhoudenClient(secret, { source });
            await client.openSession();

            try {
                const ledgersApi = new LedgersResource(client);
                const mutationsApi = new MutationsResource(client);

                const ledgerSpinner = ui.spinner('Fetching ledgers').start();
                const ledgers = await paginate(
                    (offset) => ledgersApi.list({ limit: 500, offset }),
                    500,
                );
                const ledgerById = new Map<LedgerId, LedgerResponse>(
                    ledgers.map((l) => [l.id, l]),
                );
                ledgerSpinner.succeed(`${ledgers.length} ledger(s) fetched`);

                const bankAccounts = await db
                    .select()
                    .from(accountingBankAccount)
                    .where(
                        eq(
                            accountingBankAccount.credentialId,
                            credentialRow.id,
                        ),
                    );
                const bankLedgerIds = new Set(
                    bankAccounts.map((b) =>
                        LedgerId(String(Number(b.ledgerId))),
                    ),
                );

                const ruleSet = await loadRuleSet(
                    credentialRow.id,
                    credentialRow.userId,
                );

                const listSpinner = ui.spinner('Listing mutations').start();
                let summaries = await paginate(
                    (offset) => mutationsApi.list({ limit: 2000, offset }),
                    2000,
                );
                if (limit) summaries = summaries.slice(0, limit);
                listSpinner.succeed(`${summaries.length} mutation(s) found`);

                let completed = 0;
                const detailSpinner = ui
                    .spinner(`Fetching mutation detail (0/${summaries.length})`)
                    .start();
                const details = await mapWithConcurrency(
                    summaries,
                    concurrency,
                    async (summary) => {
                        try {
                            const detail = await mutationsApi.get(summary.id);
                            completed += 1;
                            detailSpinner.text = `Fetching mutation detail (${completed}/${summaries.length})`;
                            return detail;
                        } catch (error) {
                            completed += 1;
                            detailSpinner.text = `Fetching mutation detail (${completed}/${summaries.length})`;
                            ui.warn(
                                `Could not fetch mutation ${summary.id}: ${
                                    error instanceof Error
                                        ? error.message
                                        : String(error)
                                }`,
                            );
                            return null;
                        }
                    },
                );
                detailSpinner.succeed(
                    `${summaries.length} mutation detail(s) fetched`,
                );

                const mutations = details.filter((m) => m !== null);

                const report = auditMutations({
                    bankLedgerIds,
                    ledgerById,
                    mutations,
                    ruleSet,
                });

                printReport(report);

                if (isVerbose) {
                    printBreakdown(
                        buildVendorBreakdown(mutations, ledgerById, ruleSet),
                    );
                }

                if (report.issues.length > 0) process.exitCode = 1;
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
