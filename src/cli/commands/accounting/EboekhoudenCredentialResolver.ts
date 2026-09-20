import { eq } from 'drizzle-orm';

import { ui } from '~/cli/ui';
import { CredentialKind } from '~/lib/accounting/credentials/registry';
import { EBoekhoudenClient } from '~/lib/accounting/providers/eboekhouden/client';
import { openSecret } from '~/lib/crypto/secrets';
import { accountingCredential, db } from '~/server/db';

export type EboekhoudenCredentialRow = typeof accountingCredential.$inferSelect;

export const EboekhoudenCredentialResolver = {
    async openClient(
        row: EboekhoudenCredentialRow,
    ): Promise<EBoekhoudenClient> {
        if (!row.ciphertext) {
            throw new Error(`Credential "${row.label}" has no stored secret.`);
        }
        const secret = await openSecret(row.ciphertext);
        const source =
            typeof row.meta.source === 'string' ? row.meta.source : 'sadranl';
        const client = new EBoekhoudenClient(secret, { source });
        await client.openSession();
        return client;
    },

    async resolveRow(
        credentialArgument: string | undefined,
    ): Promise<EboekhoudenCredentialRow | null> {
        const rows = await db
            .select()
            .from(accountingCredential)
            .where(eq(accountingCredential.kind, CredentialKind.EBoekhouden));

        const [onlyRow] = rows;
        if (!onlyRow || rows.length === 0) {
            ui.fail('No eBoekhouden credential found in the database.');
            return null;
        }

        let row = onlyRow;
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
                return null;
            }
            row = match;
        }

        if (!row.ciphertext) {
            ui.fail(`Credential "${row.label}" has no stored secret.`);
            return null;
        }

        return row;
    },
};
